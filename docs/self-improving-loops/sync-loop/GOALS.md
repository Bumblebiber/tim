# Sync loop — goals

Two TIM instances (Blueprint clones or isolated temp homes) share one hosted or
dev sync server without data loss or secret leakage.

## Hard goals (vitest)

| ID | Goal | Check |
|----|------|-------|
| Y1 | **Push then pull** | `integration.test.ts`: entries round-trip; staging acked |
| Y2 | **Conflict safety** | Client tests: lock, cursor ack, partial cooldown |
| Y3 | **Secrets envelope** | `secret-sync.test.ts`, `secret-envelope.test.ts` pass |
| Y4 | **No live home bleed** | Integration suite uses `HOME` temp dir (see file header) |

## Blueprint extension (manual)

| ID | Goal | Check |
|----|------|-------|
| Y5 | **Two Blueprint users** | Clone A pushes; clone B pulls; same project label; human spot-check `tim doctor` sync timestamps |

## Run

```bash
npx vitest run packages/tim-sync-client/src/__tests__/integration.test.ts
```

Full client package: `npx vitest run packages/tim-sync-client`
