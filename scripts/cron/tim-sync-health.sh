#!/bin/bash
# tim-sync-health.sh — Health check for the hosted sync server; alerts via the cron Telegram bot (beeBot).
# no_agent cron (every 5 min). Also checks backup age. Silent when healthy.
#
# Environment:
#   TIM_SYNC_URL          health base URL (default: http://127.0.0.1:3100)
#   TIM_SYNC_ADMIN_TOKEN  admin token (enables error-rate / latency / disk checks)
#   TIM_SYNC_BACKUP_DIR   dir holding backup bundles (default: ${HOME}/.tim/sync-backups)
#   TIM_SYNC_BACKUP_MAX_AGE_MIN  default 120
#   TIM_SYNC_LATENCY_P95_MS      default 2000
#   TIM_SYNC_TENANT_MAX_MB       per-tenant disk warning, default 500
#   TIM_SYNC_DISK_PCT_MAX        filesystem usage warning, default 80

set -uo pipefail

URL="${TIM_SYNC_URL:-http://127.0.0.1:3100}"
BACKUP_DIR="${TIM_SYNC_BACKUP_DIR:-${HOME}/.tim/sync-backups}"
MAX_AGE_MIN="${TIM_SYNC_BACKUP_MAX_AGE_MIN:-120}"
P95_MAX="${TIM_SYNC_LATENCY_P95_MS:-2000}"
TENANT_MAX_MB="${TIM_SYNC_TENANT_MAX_MB:-500}"
DISK_PCT_MAX="${TIM_SYNC_DISK_PCT_MAX:-80}"
DATA_DIR="${TIM_SYNC_DATA_DIR:-${HOME}/.tim/sync-server}"
ROLE="[tim-sync-health]"
PROBLEMS=()

HEADERS=()
[[ -n "${TIM_SYNC_ADMIN_TOKEN:-}" ]] && HEADERS=(-H "Authorization: Bearer ${TIM_SYNC_ADMIN_TOKEN}")
BODY=$(curl -fsS --max-time 10 "${HEADERS[@]}" "${URL}/health" 2>&1) || { PROBLEMS+=("server unreachable: ${BODY}"); BODY=""; }

if [[ -n "${BODY}" ]]; then
  # Stats only appear with the admin token; without it only reachability is checked.
  while IFS= read -r line; do PROBLEMS+=("${line}"); done < <(node -e '
    const h = JSON.parse(process.argv[1]), [p95Max, mb] = process.argv.slice(2).map(Number);
    if (h.ok !== true) console.log("health ok=false");
    if (h.latency_p95_ms > p95Max) console.log(`p95 latency ${h.latency_p95_ms}ms > ${p95Max}ms`);
    if (h.requests >= 20 && h.errors_5xx / h.requests > 0.05) console.log(`5xx rate ${h.errors_5xx}/${h.requests}`);
    for (const [id, b] of Object.entries(h.tenant_disk_bytes ?? {})) if (b > mb * 1048576) console.log(`tenant ${id} uses ${Math.round(b / 1048576)} MB`);
  ' "${BODY}" "${P95_MAX}" "${TENANT_MAX_MB}" 2>&1)
fi

PCT=$(df --output=pcent "${DATA_DIR}" 2>/dev/null | tail -1 | tr -dc '0-9')
[[ -n "${PCT}" && "${PCT}" -ge "${DISK_PCT_MAX}" ]] && PROBLEMS+=("filesystem ${PCT}% full")

LATEST=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'sync-*' -mmin "-${MAX_AGE_MIN}" 2>/dev/null | head -1)
[[ -z "${LATEST}" ]] && PROBLEMS+=("no backup newer than ${MAX_AGE_MIN}m in ${BACKUP_DIR}")

if (( ${#PROBLEMS[@]} > 0 )); then
  msg=$(printf '%s\n' "${PROBLEMS[@]}")
  echo "${ROLE} ${msg}" >&2
  esc="${msg//&/&amp;}"; esc="${esc//</&lt;}"; esc="${esc//>/&gt;}"
  "${HOME}/.hermes/bin/send-cron-telegram" "TIM sync health:"$'\n'"${esc}" >/dev/null 2>&1 \
    || echo "${ROLE} telegram alert failed" >&2
  exit 1
fi
