#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

APP_DIR="${ORAHDEX_APP_DIR:-$HOME/OrahDEX-app}"
API_DIR="$APP_DIR/artifacts/api-server"
API_ENV="$API_DIR/.env"
PGDATA="${PREFIX:-}/var/lib/postgresql"
TOKEN_FILE="$HOME/.config/orahdex/tunnel-token"
LOG_DIR="$HOME/orahdex-logs"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[ -n "${PREFIX:-}" ] || fail "Run this launcher inside Termux."

command -v node >/dev/null 2>&1 || fail "Node.js is missing. Install nodejs-lts with pkg."
command -v cloudflared >/dev/null 2>&1 || fail "cloudflared is missing. Install it with pkg."
command -v pg_ctl >/dev/null 2>&1 || fail "PostgreSQL tools are missing. Install postgresql with pkg."
command -v curl >/dev/null 2>&1 || fail "curl is missing. Install it with pkg."

[ -d "$API_DIR" ] || fail "API folder not found: $API_DIR"
[ -s "$API_DIR/dist/index.mjs" ] || fail "API build is missing. Build the API before starting it."
[ -r "$API_ENV" ] || fail "Create and protect $API_ENV before starting."
[ -s "$TOKEN_FILE" ] || fail "Add the rotated Cloudflare tunnel token to $TOKEN_FILE."
[ -s "$PGDATA/PG_VERSION" ] || fail "No initialized PostgreSQL database found at $PGDATA. This script will not initialize or replace a database."

mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"
chmod 600 "$API_ENV" "$TOKEN_FILE"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  printf 'Starting the existing PostgreSQL cluster...\n'
  pg_ctl -D "$PGDATA" -l "$LOG_DIR/postgres.log" start
fi

if pgrep -f '[d]ist/index.mjs' >/dev/null 2>&1; then
  fail "An API process is already running. Identify it and plan a backed-up cutover before starting this build."
fi

if pgrep -f '[c]loudflared tunnel run' >/dev/null 2>&1; then
  fail "A tunnel process is already running. Update/disable the old watchdog and stop the old connector before starting with the rotated token."
fi

printf 'Starting OrahDEX API...\n'
(
  cd "$API_DIR"
  nohup node --env-file="$API_ENV" --max-old-space-size=2560 ./dist/index.mjs \
    >>"$LOG_DIR/api.log" 2>&1 </dev/null &
)

printf 'Starting Cloudflare Tunnel from the protected token file...\n'
nohup cloudflared tunnel run --token-file "$TOKEN_FILE" \
  >>"$LOG_DIR/tunnel.log" 2>&1 </dev/null &

printf 'Waiting for the API health endpoint...\n'
for _attempt in $(seq 1 12); do
  if curl --silent --fail --max-time 5 http://127.0.0.1:8080/api/health >/dev/null; then
    printf 'API health endpoint responded:\n'
    curl --silent --show-error --max-time 5 http://127.0.0.1:8080/api/health || true
    printf '\nAI status:\n'
    curl --silent --show-error --max-time 8 http://127.0.0.1:8080/api/ai/status || true
    printf '\nLogs: %s/api.log and %s/tunnel.log\n' "$LOG_DIR" "$LOG_DIR"
    exit 0
  fi
  sleep 5
done

printf 'The API did not become healthy. Recent API log:\n' >&2
tail -n 40 "$LOG_DIR/api.log" 2>/dev/null || true
printf '\nRecent tunnel log:\n' >&2
tail -n 40 "$LOG_DIR/tunnel.log" 2>/dev/null || true
exit 1
