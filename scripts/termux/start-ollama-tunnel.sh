#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

TOKEN_FILE="$HOME/.config/orahdex/ollama-tunnel-token"
OLLAMA_TAGS_URL="http://127.0.0.1:11434/api/tags"
LOG_FILE="$HOME/ollama-tunnel.log"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[ -n "${PREFIX:-}" ] || fail "Run this script inside Termux."
command -v cloudflared >/dev/null 2>&1 || fail "cloudflared is missing. Install it with: pkg install cloudflared"
command -v curl >/dev/null 2>&1 || fail "curl is missing. Install it with: pkg install curl"
[ -s "$TOKEN_FILE" ] || fail "Put the rotated tunnel token in $TOKEN_FILE first."
chmod 600 "$TOKEN_FILE"

if ! curl --silent --fail --max-time 5 "$OLLAMA_TAGS_URL" | grep -q 'llama3.2:3b'; then
  fail "Ollama is not reachable at 127.0.0.1:11434 or llama3.2:3b is not installed."
fi
if ! curl --silent --fail --max-time 5 "$OLLAMA_TAGS_URL" | grep -q 'qwen2.5-coder:1.5b'; then
  fail "qwen2.5-coder:1.5b is not available from the local Ollama endpoint."
fi

if pgrep -f '[c]loudflared tunnel run' >/dev/null 2>&1; then
  fail "A cloudflared tunnel is already running. Stop the identified old connector after rotating its token, then retry."
fi

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

nohup cloudflared tunnel run --token-file "$TOKEN_FILE" \
  >>"$LOG_FILE" 2>&1 </dev/null &
sleep 3

if ! pgrep -f '[c]loudflared tunnel run' >/dev/null 2>&1; then
  printf 'cloudflared did not stay running. Recent log:\n' >&2
  tail -n 40 "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

printf 'Ollama is reachable locally and cloudflared is running.\n'
printf 'Tunnel log: %s\n' "$LOG_FILE"
printf 'The hostname and Access policy must be configured in Cloudflare.\n'
