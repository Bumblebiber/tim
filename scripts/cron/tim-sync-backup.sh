#!/bin/bash
# tim-sync-backup.sh — Hourly consistent backup of the sync server data dir (SQLite online backup, no file copy).
# Keeps the newest KEEP bundles; prunes only after a new bundle was written and verified.
# Failure exits nonzero; tim-sync-health.sh alerts when the newest bundle is too old.
set -euo pipefail
BACKUP_DIR="${TIM_SYNC_BACKUP_DIR:-${HOME}/.tim/sync-backups}"
KEEP="${TIM_SYNC_BACKUP_KEEP:-48}"
CLI="${TIM_SYNC_CLI:-$(cd "$(dirname "$0")/../.." && pwd)/packages/tim-sync-server/dist/cli.js}"
mkdir -p "${BACKUP_DIR}"
OUT="${BACKUP_DIR}/sync-$(date -u +%Y%m%dT%H%M%SZ)"
node "${CLI}" backup "${OUT}" || { rm -rf "${OUT}"; exit 1; }
ls -d "${BACKUP_DIR}"/sync-* | sort | head -n "-${KEEP}" | xargs -r rm -rf
