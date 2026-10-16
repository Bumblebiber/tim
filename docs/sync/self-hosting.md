# Self-hosting the sync server

`tim-sync-server` speaks plain HTTP. Run it on loopback and put a TLS-terminating
reverse proxy in front; never expose the port directly — bearer tokens would cross
the network in cleartext.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TIM_SYNC_HOST` | `127.0.0.1` | Interface to bind. Keep loopback behind a proxy. |
| `TIM_SYNC_PORT` | `3100` | Listen port. |
| `TIM_SYNC_DATA_DIR` | `~/.tim/sync-server` | Tenant registry and per-tenant databases. Back it up with `tim-sync-server backup`, not `cp`. |
| `TIM_SYNC_ADMIN_TOKEN` | unset | Enables admin endpoints and detailed `/health`. Long random value. |
| `TIM_SYNC_TRUST_PROXY` | unset | `1` = take the client IP for the registration rate limit from the last `X-Forwarded-For` hop. Set it only when the proxy appends that header; otherwise any client could pick its own IP. |

```bash
TIM_SYNC_TRUST_PROXY=1 TIM_SYNC_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  node packages/tim-sync-server/dist/cli.js
```

## Reverse proxy

Caddy (TLS automatic, appends `X-Forwarded-For`):

```text
sync.example.org {
  reverse_proxy 127.0.0.1:3100
}
```

nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:3100;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  client_max_body_size 10m;
}
```

## Limits that still apply

- Registration is unauthenticated, limited to 5 per hour per client IP, in memory (a restart resets it).
- Sync endpoints have no application rate limit; add one at the proxy if the server is public.
- The server stores every pushed blob (no compaction yet) — watch the data directory size.

## Backup, restore, monitoring

**Backup** — never `cp` the live data dir. `tim-sync-server backup <out-dir>` uses SQLite's online backup API for `registry.db` and every `tenants/*.db`, then runs `integrity_check` on the copies. It refuses a non-empty target. Cron (hourly):

```text
0 * * * *  TIM_SYNC_DATA_DIR=/srv/tim-sync bash /path/to/repo/scripts/cron/tim-sync-backup.sh
```

The script keeps 48 bundles (`TIM_SYNC_BACKUP_KEEP`) and prunes only after a successful new bundle. Off-host copy (rclone/pCloud, encrypted) is **not** done yet — see open items in production-plan T07.

**Restore** (tested by `hosted-server.test.ts` "restore drill"; repeat on the server once before going public):

1. `systemctl stop tim-sync` (or kill the process).
2. Move the damaged data dir away: `mv $TIM_SYNC_DATA_DIR $TIM_SYNC_DATA_DIR.broken`.
3. `TIM_SYNC_DATA_DIR=… tim-sync-server restore ~/.tim/sync-backups/sync-<timestamp>` — refuses a non-empty dir.
4. Start the server; `GET /health` with the admin token must show the expected `tenant_count`; pull with a known tenant token.

**Monitoring** — `GET /health` with the admin token returns `requests`, `errors_5xx`, `errors_4xx`, `latency_p95_ms` (last 1000 requests, since process start) and `tenant_disk_bytes` (db + WAL per tenant). `scripts/cron/tim-sync-health.sh` (cron every 5 min) checks reachability, 5xx rate, p95 latency, per-tenant size, filesystem usage and newest-backup age, and alerts through `~/.hermes/bin/send-cron-telegram` (beeBot). It is silent when healthy.

**Log rotation** — `deploy/tim-sync/logrotate.conf` (copy to `/etc/logrotate.d/tim-sync`; redirect server output to `/var/log/tim-sync/server.log`). For journald set `SystemMaxUse=` in `journald.conf`.

The open production gates (compaction, off-host backup, alert dedup) are tracked in
[production-plan.md](production-plan.md).
