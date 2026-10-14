#!/bin/bash
# tim-graphify-refresh.sh — Weekly graphify + TIM Codebase dependency-map refresh.
# Suggested cron: 0 8 * * 1  (Mondays 08:00, machine local time)
#
# Environment: same as scripts/graphify-tim.sh (TIM_GRAPHIFY_OUT, GRAPHIFY_BIN, …)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="${HOME}/.tim/logs/graphify-refresh-cron.log"
LOCK_FILE="${TIM_GRAPHIFY_LOCK:-/tmp/tim-graphify-refresh.lock}"

mkdir -p "$(dirname "${LOG_FILE}")" 2>/dev/null || true

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] SKIP: previous graphify refresh still running" >> "${LOG_FILE}"
  exit 0
fi

echo "[$(date -Iseconds)] graphify refresh start" >> "${LOG_FILE}"

set +e
RESULT=$(bash "${ROOT}/scripts/graphify-tim.sh" 2>&1)
ec=$?
set -e

echo "${RESULT}" >> "${LOG_FILE}"
echo "[$(date -Iseconds)] graphify refresh exit ${ec}" >> "${LOG_FILE}"

exit "${ec}"
