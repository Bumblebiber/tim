# Self-improving loops for TIM

Repeatable QA loops: isolate a fresh environment, score output against a written
contract (`GOALS.md`), fix friction in a clone, rescore, record the diff in
`LEDGER.md`. Pattern from TIM scenario
`ubun-0603-ns-01KT6SEPP24VXX6EBCBGXVHWG5` (agent-driven pipeline on Blueprint
clones).

## Two environments

| Tier | Where | Use |
|------|--------|-----|
| **Automated** | Docker (`scripts/sandbox/`), vitest, `scripts/briefing-eval.mjs` | Every PR; no API keys; committed ref only |
| **Blueprint** | Strato `Blueprint_raw` → clone per CLI (Cursor, Claude Code, Codex, OpenCode) | Login, keys, real agent UX; report friction → code/data fixes |

Run automated gates: `node scripts/self-improving-loops.mjs check`  
Include Docker installation gate: `node scripts/self-improving-loops.mjs check --with-docker`

## Loops

| Loop | Contract | Ledger | Automated gate |
|------|----------|--------|----------------|
| **Installation** | [installation-loop/GOALS.md](./installation-loop/GOALS.md) | [installation-loop/LEDGER.md](./installation-loop/LEDGER.md) | `scripts/sandbox/run.sh` (Docker) |
| **Loading** (briefing) | [../briefing-loop/GOALS.md](../briefing-loop/GOALS.md) | [../briefing-loop/LEDGER.md](../briefing-loop/LEDGER.md) | `node scripts/briefing-eval.mjs --selftest` + goals unit tests |
| **Sync** | [sync-loop/GOALS.md](./sync-loop/GOALS.md) | [sync-loop/LEDGER.md](./sync-loop/LEDGER.md) | `tim-sync-client` integration vitest |
| **Hook** | [hook-loop/GOALS.md](./hook-loop/GOALS.md) | [hook-loop/LEDGER.md](./hook-loop/LEDGER.md) | Sandbox `hooks-check.py` (via `fresh` / `installer`) |
| **Schema migration** | [schema-migration-loop/GOALS.md](./schema-migration-loop/GOALS.md) | [schema-migration-loop/LEDGER.md](./schema-migration-loop/LEDGER.md) | `tim-store` migration vitest suite |

## Loop rule (all loops)

1. Score baseline → store raw output under the loop’s `runs/` or vitest log.
2. Fix the worst failing **hard** goal (product code or curated TIM data).
3. Rescore; keep the change only if no hard goal regressed.
4. Append one row to the loop’s `LEDGER.md` with commit hash and note.
5. A goal that measures the wrong thing is changed in `GOALS.md` with the reason in the ledger — not silently loosened in the harness.

## Cron / night agents

Global interface policy (AGENTS.md §Cronjobs): maintenance agents may run
**automated** gates only. Blueprint loops need human-provisioned clones and
credentials; schedule those separately, not from repo cron.
