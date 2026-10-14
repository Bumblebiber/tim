# Schema migration loop — goals

Upgrading TIM on an **existing** `tim.db` applies pending migrations with backup,
rollback on failure, and a clear gate when the CLI is behind the DB.

## Hard goals (vitest)

| ID | Goal | Check |
|----|------|-------|
| M1 | **Failed migration rolls back** | `migrations.test.ts`: version stays; retry succeeds |
| M2 | **Backup before upgrade** | Pre-migration `.bak` exists when version > 0 |
| M3 | **Fresh DB skips backup** | Version 0 bootstrap has no `.bak` noise |
| M4 | **Open gate** | `migration-gate.test.ts`: stale CLI refuses open until `tim migrate-schema` |
| M5 | **Worker guard** | `migrate-schema-guard.test.ts`: worker may migrate only on a copy |

## Loop rule

1. Add a fixture DB at version *n−1* under `packages/tim-store/src/__tests__/fixtures/` when a migration is non-trivial.
2. Run full migration suite before merge.
3. Record migration version and fixture hash in this ledger.

## Run

```bash
npx vitest run packages/tim-store/src/__tests__/migrations.test.ts packages/tim-store/src/__tests__/migration-gate.test.ts packages/tim-cli/src/__tests__/migrate-schema-guard.test.ts
```
