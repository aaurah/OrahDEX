#!/usr/bin/env bash
# Provision the local Ollama model tags OrahDEX expects.
#
# Model weights are never committed to Git (llama3.2:3b is a 2.0 GB blob and
# GitHub rejects files over 100 MB), so every runtime pulls its own copy:
#   - Termux / desktop:  bash scripts/pull-models.sh
#   - Replit build:      run automatically by .replit before the deployment starts
#
# Idempotent: tags already present in the Ollama store are skipped. If no
# loopback server is running, one is started temporarily and stopped again.
set -uo pipefail

BASE="${DEVAI_OLLAMA_BASE_URL:-http://127.0.0.1:11434/v1}"
BASE="${BASE%/v1}"
ORA_TAG="${ORA_AI_MODEL:-llama3.2:3b}"
DEVAI_TAG="${DEVAI_MODEL:-qwen2.5-coder:1.5b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "[models] ollama not installed here — skipping (AI stays disabled)" >&2
  exit 0
fi

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

if ! curl -sf -m 2 "$BASE/api/tags" >/dev/null 2>&1; then
  echo "[models] starting a temporary ollama server for the pull"
  OLLAMA_HOST=127.0.0.1:11434 nohup ollama serve >>"${TMPDIR:-/tmp}/ollama-pull.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf -m 2 "$BASE/api/tags" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -sf -m 2 "$BASE/api/tags" >/dev/null 2>&1; then
    echo "[models] ollama did not become reachable; see ${TMPDIR:-/tmp}/ollama-pull.log" >&2
    exit 1
  fi
fi

INSTALLED=$(curl -sf -m 5 "$BASE/api/tags" | tr ',' '\n' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
STATUS=0
for tag in "$ORA_TAG" "$DEVAI_TAG"; do
  # Ollama reports "model:latest" when no tag is given, so compare exactly.
  case "$tag" in *:*) want="$tag" ;; *) want="$tag:latest" ;; esac
  if printf '%s\n' "$INSTALLED" | grep -Fxq "$want"; then
    echo "[models] $want already installed"
    continue
  fi
  echo "[models] pulling $want"
  ollama pull "$tag" || { echo "[models] pull failed: $tag" >&2; STATUS=1; }
done

exit "$STATUS"
