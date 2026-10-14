#!/usr/bin/env bash
# graphify-tim.sh — Run graphify on the TIM monorepo and refresh P0063/Codebase dependency-map.
#
# Usage:
#   ./scripts/graphify-tim.sh [--dry-run] [--skip-graphify] [--package P0063]
#
# Environment:
#   TIM_GRAPHIFY_OUT     — output dir (default: ~/.tim/graphify-out)
#   GRAPHIFY_BIN         — graphify executable (default: graphify on PATH)
#   TIM_GRAPHIFY_REPO    — repo root to scan (default: parent of scripts/)
#   TIM_GRAPHIFY_TIMEOUT_SEC — wall-clock cap for graphify update (default: 3600)
#
# Cron (weekly, Mondays 08:00): see scripts/cron/tim-graphify-refresh.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TIM_GRAPHIFY_REPO:-$(cd "$SCRIPT_DIR/.." && pwd)}"
OUT_DIR="${TIM_GRAPHIFY_OUT:-${HOME}/.tim/graphify-out}"
GRAPHIFY="${GRAPHIFY_BIN:-graphify}"
DRY_RUN=false
SKIP_GRAPHIFY=false
PACKAGE="P0063"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-graphify) SKIP_GRAPHIFY=true; shift ;;
    --package) PACKAGE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

TIM_BIN="$(command -v tim 2>/dev/null || true)"
TIM_CLI_JS="${REPO_ROOT}/packages/tim-cli/dist/cli.js"
run_tim() {
  # Prefer this checkout's built CLI so cron/dev matches the repo that owns the script.
  if [[ -f "$TIM_CLI_JS" ]]; then
    node "$TIM_CLI_JS" "$@"
  elif [[ -n "$TIM_BIN" ]]; then
    "$TIM_BIN" "$@"
  else
    echo "[graphify-tim] tim CLI not found" >&2
    exit 1
  fi
}

mkdir -p "${OUT_DIR}"

if [[ "$SKIP_GRAPHIFY" != true ]]; then
  if ! command -v "${GRAPHIFY}" >/dev/null 2>&1; then
    echo "[graphify-tim] graphify not found (set GRAPHIFY_BIN)" >&2
    exit 1
  fi

  WORK_OUT="${REPO_ROOT}/graphify-out"
  TIMEOUT_SEC="${TIM_GRAPHIFY_TIMEOUT_SEC:-3600}"
  echo "[graphify-tim] graphify update ${REPO_ROOT} (timeout ${TIMEOUT_SEC}s)"
  if [[ "$DRY_RUN" == true ]]; then
    echo "[graphify-tim] DRY RUN — would run graphify update and copy to ${OUT_DIR}"
  else
    set +e
    timeout --kill-after=30s "${TIMEOUT_SEC}s" "${GRAPHIFY}" update "${REPO_ROOT}"
    ec=$?
    set -e
    if [[ "$ec" -ne 0 ]]; then
      echo "[graphify-tim] graphify update failed (exit ${ec})" >&2
      exit "$ec"
    fi
    if [[ ! -f "${WORK_OUT}/graph.json" ]]; then
      echo "[graphify-tim] missing ${WORK_OUT}/graph.json after update" >&2
      exit 1
    fi
    cp -f "${WORK_OUT}/graph.json" "${OUT_DIR}/graph.json"
    if [[ -f "${WORK_OUT}/analysis_summary.json" ]]; then
      cp -f "${WORK_OUT}/analysis_summary.json" "${OUT_DIR}/analysis_summary.json"
    fi
    echo "[graphify-tim] graph copied to ${OUT_DIR}/graph.json"
  fi
fi

REFRESH_ARGS=(codebase-refresh --package "${PACKAGE}" --out-dir "${OUT_DIR}")
if [[ "$DRY_RUN" == true ]]; then
  REFRESH_ARGS+=(--dry-run)
fi

echo "[graphify-tim] tim ${REFRESH_ARGS[*]}"
run_tim "${REFRESH_ARGS[@]}"
