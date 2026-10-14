# Hook loop — goals

Session-start, exchange capture, stop/end, and summarizer triggers must run when
the agent host invokes hook commands **without** `node` or `tim` on `PATH`.

## Hard goals

| ID | Goal | Check |
|----|------|-------|
| H1 | **Claude four events** | `hooks-check.py claude`: SessionStart, UserPromptSubmit, Stop, SessionEnd — all exit 0, empty stderr |
| H2 | **Codex session + notify** | `hooks-check.py codex`: SessionStart hooks + `notify` on turn complete |
| H3 | **Cursor hooks** | `hooks-check.py cursor`: every configured event runs |
| H4 | **Exchange persisted** | After checks, `tim doctor` shows ≥1 observed exchange (sandbox `fresh.sh`) |
| H5 | **Summarizer path** | Worker env tests (`summarizer-worker-env.test.ts`) — hooks no-op for `TEAMUP_WORKER` except session-start briefing |

## Soft goals

| ID | Goal | Check |
|----|------|-------|
| S1 | **Git post-merge hook** | `scripts/__tests__/git-hooks.test.mjs` — TIM repo hook exits 0 |

## Run

Automated: part of `scripts/sandbox/run.sh` (`fresh` + `installer`).  
Summarizer unit tests: `npx vitest run packages/tim-summarizer/src/__tests__/summarizer-worker-env.test.ts`
