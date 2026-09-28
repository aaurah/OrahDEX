#!/usr/bin/env bash
# =============================================================================
#  OrahDEX API Server Watchdog
#  Keeps the server alive forever. On crash it self-diagnoses, waits with
#  exponential back-off, and restarts. Rebuilds automatically when the dist
#  is missing or after repeated rapid crashes.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8080}"
NODE_ENV="${NODE_ENV:-development}"

MAX_BACKOFF=30        # seconds
STABLE_SEC=60         # run longer than this → reset back-off
REBUILD_AFTER=5       # quick-crash threshold before forced rebuild

crash_count=0
quick_crashes=0
backoff=1
child_pid=""

# ── helpers ──────────────────────────────────────────────────────────────────
ts()  { date '+%Y-%m-%dT%H:%M:%S'; }
log() { echo "$(ts) [watchdog] $*"; }

free_port() {
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}

do_build() {
  log "Building server..."
  cd "$SCRIPT_DIR"
  if node ./build.mjs 2>&1; then
    log "Build succeeded."
    return 0
  else
    log "Build FAILED."
    return 1
  fi
}

diagnose() {
  log "--- Self-diagnosis ---"
  local need_rebuild=0

  # 1. dist missing?
  if [[ ! -f "$SCRIPT_DIR/dist/index.mjs" ]]; then
    log "DIAG: dist/index.mjs not found — rebuild required."
    need_rebuild=1
  fi

  # 2. port still occupied?
  if fuser "${PORT}/tcp" 2>/dev/null | grep -q .; then
    log "DIAG: port $PORT still occupied — killing occupant."
    free_port
  fi

  # 3. memory snapshot
  local free_mb
  free_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo "unknown")
  log "DIAG: available RAM: ${free_mb} MB"

  # 4. disk snapshot
  local disk_pct
  disk_pct=$(df / 2>/dev/null | awk 'NR==2{print $5}' || echo "unknown")
  log "DIAG: disk usage: $disk_pct"

  log "--- End diagnosis ---"
  return $need_rebuild
}

# ── graceful shutdown ─────────────────────────────────────────────────────────
cleanup() {
  log "Shutdown signal received — stopping watchdog."
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    log "Sending SIGTERM to server (PID $child_pid)..."
    kill -TERM "$child_pid" 2>/dev/null || true
    # Give it 5 s to exit gracefully, then SIGKILL
    for _ in $(seq 1 5); do
      sleep 1
      kill -0 "$child_pid" 2>/dev/null || break
    done
    kill -KILL "$child_pid" 2>/dev/null || true
  fi
  log "Watchdog exited cleanly."
  exit 0
}
trap cleanup SIGTERM SIGINT

# ── initial build ─────────────────────────────────────────────────────────────
log "============================================="
log " OrahDEX API Server Watchdog — starting up"
log "============================================="
log "PORT=$PORT  NODE_ENV=$NODE_ENV"
log "Script dir: $SCRIPT_DIR"

cd "$SCRIPT_DIR"

# Kill anything already on the port before the very first start
free_port
sleep 1

if ! do_build; then
  log "Initial build failed — retrying once in 5 s..."
  sleep 5
  do_build || { log "Second build attempt also failed. Check source errors."; exit 1; }
fi

# ── watch loop ─────────────────────────────────────────────────────────────
while true; do
  cd "$SCRIPT_DIR"

  log "▶  Starting server (restarts so far: $crash_count) ..."
  free_port
  sleep 1

  START_TS=$(date +%s)

  NODE_ENV="$NODE_ENV" \
    node --enable-source-maps --max-old-space-size=4096 --expose-gc \
         ./dist/index.mjs &
  child_pid=$!

  # Block until server exits
  wait "$child_pid" 2>/dev/null
  EXIT_CODE=$?
  child_pid=""

  NOW_TS=$(date +%s)
  UPTIME=$(( NOW_TS - START_TS ))
  crash_count=$(( crash_count + 1 ))

  log "⚠  Server stopped  exit=$EXIT_CODE  uptime=${UPTIME}s  total_restarts=$crash_count"

  # Stable run → reset back-off
  if [[ $UPTIME -ge $STABLE_SEC ]]; then
    log "Server ran stably for ${UPTIME}s — resetting back-off."
    backoff=1
    quick_crashes=0
  else
    quick_crashes=$(( quick_crashes + 1 ))
  fi

  # Self-diagnosis (sets need_rebuild flag)
  diagnose
  need_rebuild=$?

  # Force rebuild after repeated rapid crashes or if dist is missing
  if [[ $need_rebuild -ne 0 ]] || [[ $quick_crashes -ge $REBUILD_AFTER ]]; then
    log "Triggering rebuild (quick_crashes=$quick_crashes, need_rebuild=$need_rebuild)..."
    quick_crashes=0
    do_build || log "Rebuild failed — proceeding with existing dist (may crash again)."
  fi

  log "↻  Restarting in ${backoff}s..."
  sleep "$backoff"

  # Exponential back-off, capped
  next=$(( backoff * 2 ))
  backoff=$(( next > MAX_BACKOFF ? MAX_BACKOFF : next ))
done
