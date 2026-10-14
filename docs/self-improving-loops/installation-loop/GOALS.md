# Installation loop — goals

TIM must install and connect on a machine that has Node 22+ and git but no prior
TIM install. These goals are the **automated** contract (`scripts/sandbox/`).
Blueprint agents (four CLIs, logged-in GitHub/API) follow the same checklist in
reports; gaps they find become new hard goals here.

## Hard goals (Docker sandbox)

| ID | Goal | Check |
|----|------|-------|
| I1 | **Source path install** | `fresh.sh`: `npm ci` exit 0; `tim init` + `new-project` exit 0 |
| I2 | **Three hosts wired** | `setup-agent` for claude, codex, cursor; `hooks-check.py` reports ALL OK for each |
| I3 | **Rerun is idempotent** | Second `setup-agent --host claude` → `"status": "unchanged"` |
| I4 | **MCP round trip** | `mcp-smoke.mjs` completes without error |
| I5 | **Hooks log work** | `tim doctor` shows observed exchanges and hooks that can start |
| I6 | **One-command installer** | `installer.sh`: virgin install links `~/.local/bin/tim`, summarizer chain present |
| I7 | **Installer rerun** | Second pipe of `install.sh` does not mutate claude/codex JSON |
| I8 | **Checkout move** | Install from a second clone repoints all four Claude hooks, codex session-start + notify, and `tim` symlink |

## Blueprint-only (not in Docker gate)

| ID | Goal | Check |
|----|------|-------|
| B1 | **OpenCode MCP** | `tim init` merges TIM server into `~/.config/opencode/opencode.json` when that tree exists (`install.ts`) |
| B2 | **Fourth CLI agent** | Agent completes `tim new-project` from OpenCode with no manual path edits |

OpenCode has no `tim setup-agent --host` yet; track B2 in the ledger until a host adapter exists.

## Run

```bash
scripts/sandbox/run.sh [git-ref] fresh installer
```

Full logs: `/tmp/tim-sandbox-*.log`. Only **committed** refs are valid input (repo mounted read-only at `/src`).
