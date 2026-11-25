#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# OrahDEX — Termux + Cloudflare Tunnel bootstrap (Android arm64/x86_64)
#
#   bash termux/bootstrap.sh              install / update / start
#   bash termux/bootstrap.sh --rebuild    force both production builds
#   bash termux/bootstrap.sh --skip-models  skip the ollama pulls
#
# No secret lives in this file. On first run it opens two files in nano:
#   $APP/.env                  application secrets (chmod 600)
#   $HOME/.cloudflared/token   Cloudflare tunnel token (chmod 600)
# Re-running is safe: .env, the token, the database and the models are kept.
#
# Topology:  node start.mjs  ->  API :8081 (loopback)  +  static :20180
#            serve-static.mjs proxies /api to the API, so the tunnel only
#            needs one hostname -> http://localhost:20180
# ============================================================================
set -uo pipefail

APP="${ORAHDEX_DIR:-$HOME/OrahDEX}"
REPO="${ORAHDEX_REPO:-https://github.com/aaurah/OrahDEX.git}"
BRANCH="${ORAHDEX_BRANCH:-Main}"
FRONTEND_PORT="${FRONTEND_PORT:-20180}"
API_PORT="${API_PORT:-8081}"
ORA_MODEL="${ORA_AI_MODEL:-llama3.2:3b}"
DEVAI_MODEL_NAME="${DEVAI_MODEL:-qwen2.5-coder:1.5b}"
ENV_FILE=""
TOKEN_FILE="$HOME/.cloudflared/token"
STATE_DIR="$HOME/.orahdex"
PGDATA="$PREFIX/var/lib/postgresql"
LAUNCHER="$HOME/start-orahdex.sh"
WATCHDOG="$HOME/orahdex-watchdog.sh"
AUDIT="$HOME/orahdex-audit.sh"
REBUILD=0
SKIP_MODELS=0

for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    --skip-models) SKIP_MODELS=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    WARN: %s\n' "$*"; }
die()  { printf '\nFATAL: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- [1/9] checks
step "[1/9] Pre-flight"
case "$(uname -m)" in
  aarch64|arm64|x86_64) ;;
  *) die "Termux on 64-bit arm/x86 only (the ollama package has no 32-bit build)" ;;
esac
[ "$(id -u)" -ne 0 ] || die "run as your normal Termux user, not root"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
FREE_GB=$(df -Pk "$HOME" | awk 'NR==2 {printf "%d", $4/1048576}')
[ "${FREE_GB:-0}" -ge 12 ] || warn "only ${FREE_GB}G free under \$HOME; deps + models want ~12G"
info "arch $(uname -m) | free ${FREE_GB}G | dir $APP"

# -------------------------------------------------------------- [2/9] packages
step "[2/9] Packages"
pkg update -y >/dev/null 2>&1 || warn "pkg update had errors; continuing"
pkg install -y git curl nano nodejs-lts postgresql openssl-tool procps tmux >/dev/null 2>&1 \
  || die "package install failed (run 'pkg install git curl nano nodejs-lts postgresql' by hand)"
# ollama and cloudflared ship for Termux via the Tur repository
command -v ollama >/dev/null 2>&1 || pkg install -y tur-repo >/dev/null 2>&1 || true
pkg install -y ollama cloudflared >/dev/null 2>&1 || true
for bin in node git psql cloudflared; do
  command -v "$bin" >/dev/null 2>&1 || die "$bin missing after install"
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)' \
  || die "Node 20.19+ required (pkg install -y nodejs-lts && pkg upgrade)"
info "node $(node -v) | cloudflared $(cloudflared --version 2>/dev/null | awk '{print $3}')"
if command -v ollama >/dev/null 2>&1; then
  info "ollama $(ollama --version 2>/dev/null | awk '{print $NF}')"
else
  warn "ollama not installed — AI features will report unavailable"
fi
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@9.15.9 >/dev/null 2>&1 \
  || die "pnpm install failed"
info "pnpm $(pnpm -v)"

# ---------------------------------------------------------------- [3/9] source
step "[3/9] Source"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --quiet origin "$BRANCH" 2>/dev/null || warn "git fetch failed (offline?)"
  git -C "$APP" checkout --quiet "$BRANCH" 2>/dev/null || true
  git -C "$APP" merge --ff-only "origin/$BRANCH" >/dev/null 2>&1 \
    || warn "local changes or divergence — keeping working tree as-is"
else
  mkdir -p "$(dirname "$APP")"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$APP" || die "clone failed"
fi
ENV_FILE="$APP/.env"
git config --global --add safe.directory "$APP" 2>/dev/null || true
info "$(git -C "$APP" rev-parse --short HEAD) on $(git -C "$APP" rev-parse --abbrev-ref HEAD)"

# ------------------------------------------------------------ [4/9] dependencies
step "[4/9] Dependencies"
cd "$APP" || die "cannot cd $APP"
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
pnpm install --frozen-lockfile --prefer-offline >/dev/null 2>&1 \
  || pnpm install --frozen-lockfile || die "pnpm install failed"
info "node_modules ready"

# -------------------------------------------------------------- [5/9] postgres
step "[5/9] PostgreSQL"
[ -f "$PGDATA/PG_VERSION" ] || initdb -D "$PGDATA" >/dev/null 2>&1 || die "initdb failed"
if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  rm -f "$PGDATA/postmaster.pid"
  pg_ctl -D "$PGDATA" -l "$HOME/pg.log" start >/dev/null 2>&1
  for _ in $(seq 1 30); do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 1; done
fi
pg_isready -q -h 127.0.0.1 -p 5432 || die "postgres did not start (see ~/pg.log)"
createdb orahdex 2>/dev/null || true
DB_URL="postgresql://$(whoami)@127.0.0.1:5432/orahdex"
info "postgres up | $(psql orahdex -tAc "select count(*) from pg_tables where schemaname='public'" 2>/dev/null || echo 0) tables"

# --------------------------------------------------------------- [6/9] secrets
step "[6/9] Secrets (.env in nano)"
umask 077
mkdir -p "$HOME/.cloudflared" "$STATE_DIR"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV_TEMPLATE
# OrahDEX secrets — edit in nano, save with Ctrl-O then Ctrl-X.
# Leave GENERATE on a line to have a random value written for you.
# Reuse the ORIGINAL values if you ever restore a database backup, otherwise
# stored wallet keys cannot be decrypted again.
DATABASE_URL="$DB_URL"
NODE_ENV=production

# --- wallet / signing secrets (required) ---
EVM_WALLET_SECRET=GENERATE
BSV_WALLET_SECRET=GENERATE
API_KEY_HMAC_SECRET=GENERATE
EVM_WEBHOOK_SECRET=GENERATE

# --- CORS: the public origin the tunnel serves ---
ALLOWED_ORIGINS="https://orahdex.com,https://www.orahdex.com"

# --- local AI (Ollama on this device) ---
DEVAI_OLLAMA_ENABLED=true
DEVAI_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
DEVAI_MODEL=$DEVAI_MODEL_NAME
ORA_AI_MODEL=$ORA_MODEL

# --- optional third-party keys (blank = feature off) ---
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
SIMPLESWAP_API_KEY=
LETSEXCHANGE_API_KEY=
COINBASE_API_KEY=
COINBASE_SECRET=
COINBASE_PROJECT_ID=
ETH_RPC_URL=
ENV_TEMPLATE
  chmod 600 "$ENV_FILE"
  info "created $ENV_FILE — opening nano"
else
  info "$ENV_FILE exists — opening nano (nothing is overwritten)"
fi
nano "$ENV_FILE" || die "nano exited with an error"

# fill any placeholder left as GENERATE, never touch a real value
while IFS= read -r key; do
  sed -i "s|^$key=.*|$key=\"$(openssl rand -hex 32)\"|" "$ENV_FILE"
  info "generated random $key"
done < <(grep -E '^[A-Z_]+="?GENERATE"?' "$ENV_FILE" 2>/dev/null | cut -d= -f1)
chmod 600 "$ENV_FILE"

MISSING=""
for key in DATABASE_URL EVM_WALLET_SECRET BSV_WALLET_SECRET API_KEY_HMAC_SECRET ALLOWED_ORIGINS; do
  grep -qE "^$key=\"?[^\"[:space:]]" "$ENV_FILE" || MISSING="$MISSING $key"
done
[ -z "$MISSING" ] || die "still empty in $ENV_FILE:$MISSING"
node -e '
  const fs=require("fs");
  for (const line of fs.readFileSync(process.argv[1],"utf8").split("\n")) {
    const t=line.trim();
    if (!t || t.startsWith("#")) continue;
    if (t.indexOf("=") < 1) { console.error("bad line: "+t.slice(0,40)); process.exit(1); }
  }
' "$ENV_FILE" || die ".env has a line without KEY=value"
info ".env parses, required keys present"

# ---------------------------------------------------------------- [7/9] schema
step "[7/9] Database schema"
if DATABASE_URL="$DB_URL" pnpm --filter @workspace/db push >/dev/null 2>&1; then
  info "schema applied ($(psql orahdex -tAc "select count(*) from pg_tables where schemaname='public'") tables)"
else
  warn "drizzle push failed — run by hand: pnpm --filter @workspace/db push"
  warn "or, on an existing database you accept overwriting: pnpm --filter @workspace/db push-force"
fi

# ----------------------------------------------------------------- [8/9] models
step "[8/9] Local models"
if [ "$SKIP_MODELS" -eq 1 ]; then
  info "skipped (--skip-models)"
elif command -v ollama >/dev/null 2>&1; then
  OLLAMA_PID=""
  if ! curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    nohup ollama serve >>"$HOME/ollama.log" 2>&1 &
    OLLAMA_PID=$!
    for _ in $(seq 1 30); do
      curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  if curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    for m in "$ORA_MODEL" "$DEVAI_MODEL_NAME"; do
      info "pull $m"
      ollama pull "$m" || warn "pull failed: $m"
    done
    ollama list 2>/dev/null | sed 's/^/    /'
  else
    warn "ollama did not come up; check ~/ollama.log"
  fi
  # hand the model service over to start.mjs, which spawns its own
  [ -n "$OLLAMA_PID" ] && kill "$OLLAMA_PID" 2>/dev/null
else
  info "ollama not installed — skipped"
fi

# ------------------------------------------------------------------ [9/9] build
step "[9/9] Builds"
export NODE_OPTIONS="--max-old-space-size=3072"
if [ "$REBUILD" -eq 1 ] || [ ! -f "artifacts/api-server/dist/index.mjs" ]; then
  info "building api-server"
  pnpm --filter @workspace/api-server run build >/dev/null 2>&1 \
    || pnpm --filter @workspace/api-server run build || die "api-server build failed"
else
  info "api-server build present (use --rebuild to force)"
fi
if [ "$REBUILD" -eq 1 ] || [ ! -f "artifacts/bsv-dex/dist/public/index.html" ]; then
  info "building bsv-dex"
  pnpm --filter @workspace/bsv-dex run build >/dev/null 2>&1 \
    || pnpm --filter @workspace/bsv-dex run build || die "frontend build failed"
else
  info "frontend build present (use --rebuild to force)"
fi
info "dist: $(du -sh artifacts/bsv-dex/dist/public 2>/dev/null | cut -f1) frontend, $(du -sh artifacts/api-server/dist 2>/dev/null | cut -f1) api"

# --------------------------------------------------------------- tunnel token
step "[+] Tunnel token"
if [ ! -s "$TOKEN_FILE" ] || grep -qE '^(#|PASTE|$)' "$TOKEN_FILE" 2>/dev/null; then
  printf '# Paste the Cloudflare tunnel token on ONE line, then save and exit.\n# Cloudflare Zero Trust -> Networks -> Tunnels -> your tunnel -> Install.\n' > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  nano "$TOKEN_FILE" || die "nano exited with an error"
  sed -i '/^#/d;/^[[:space:]]*$/d' "$TOKEN_FILE"
fi
chmod 600 "$TOKEN_FILE"
[ "$(tr -d '\n' < "$TOKEN_FILE" | wc -c)" -ge 40 ] || die "tunnel token looks empty in $TOKEN_FILE"
info "token stored at $TOKEN_FILE (0600)"

# ------------------------------------------------------------- launcher/wd/audit
step "[+] Launchers"
cat > "$LAUNCHER" <<'LAUNCH_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# OrahDEX launcher — start.mjs owns API (:8081) and static (:20180),
# serve-static proxies /api, so one tunnel hostname is enough.
set -u
APP="__APP__"
PORT="__PORT__"
API_PORT="__API_PORT__"
PGDATA="__PGDATA__"
STATE="__STATE__"
termux-wake-lock 2>/dev/null
cd "$APP" || { echo "no $APP"; exit 1; }

pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null || {
  rm -f "$PGDATA/postmaster.pid"
  pg_ctl -D "$PGDATA" -l "$HOME/pg.log" start >/dev/null 2>&1
  for _ in $(seq 1 30); do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 1; done
}

set -a; . "$APP/.env"; set +a
export PORT API_PORT

if [ -f "$STATE/app.pid" ]; then
  OLD=$(cat "$STATE/app.pid" 2>/dev/null)
  [ -n "$OLD" ] && pkill -P "$OLD" 2>/dev/null; kill "$OLD" 2>/dev/null; sleep 2
fi
nohup node start.mjs >> "$HOME/orahdex.log" 2>&1 &
echo $! > "$STATE/app.pid"

if [ -f "$STATE/tunnel.pid" ]; then kill "$(cat "$STATE/tunnel.pid")" 2>/dev/null; sleep 1; fi
TUNNEL_TOKEN="$(tr -d '\n' < "$HOME/.cloudflared/token")" \
  nohup cloudflared tunnel run >> "$HOME/tunnel.log" 2>&1 &
echo $! > "$STATE/tunnel.pid"

for i in $(seq 1 60); do
  curl -sf -m 3 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1 && break
  sleep 2
done
curl -sf -m 3 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1 \
  && echo "OrahDEX up: http://127.0.0.1:$PORT  (tunnel: orahdex.com)" \
  || echo "still booting — tail -f ~/orahdex.log"
LAUNCH_EOF
sed -i "s|__APP__|$APP|g; s|__PORT__|$FRONTEND_PORT|g; s|__API_PORT__|$API_PORT|g; s|__PGDATA__|$PGDATA|g; s|__STATE__|$STATE_DIR|g" "$LAUNCHER"

cat > "$WATCHDOG" <<'WD_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Health-aware supervisor: postgres, API, tunnel, log trimming.
set -u
APP="__APP__"
PORT="__PORT__"
API_PORT="__API_PORT__"
PGDATA="__PGDATA__"
STATE="__STATE__"
MAX_LOG_KB=51200
FAILS=0
termux-wake-lock 2>/dev/null
log() { echo "$(date '+%F %T') $*" >> "$HOME/watchdog.log"; }
trim() {
  for L in "$HOME/orahdex.log" "$HOME/tunnel.log" "$HOME/ollama.log"; do
    [ -f "$L" ] || continue
    [ "$(stat -c %s "$L" 2>/dev/null || echo 0)" -gt $((MAX_LOG_KB*1024)) ] \
      && tail -n 2000 "$L" > "$L.tmp" && mv "$L.tmp" "$L"
  done
}
while true; do
  pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null || {
    rm -f "$PGDATA/postmaster.pid"
    pg_ctl -D "$PGDATA" -l "$HOME/pg.log" start >> "$HOME/watchdog.log" 2>&1
    log "postgres restarted"; sleep 5
  }
  if ! curl -sf -m 8 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; then
    FAILS=$((FAILS+1))
    log "health check failed ($FAILS/3)"
    if [ "$FAILS" -ge 3 ]; then
      OLD=$(cat "$STATE/app.pid" 2>/dev/null || echo "")
      [ -n "$OLD" ] && pkill -P "$OLD" 2>/dev/null
      [ -n "$OLD" ] && kill "$OLD" 2>/dev/null
      sleep 2
      cd "$APP" || exit 1
      set -a; . "$APP/.env"; set +a
      export PORT API_PORT
      nohup node start.mjs >> "$HOME/orahdex.log" 2>&1 &
      echo $! > "$STATE/app.pid"
      log "api stack restarted"; FAILS=0; sleep 20
    fi
  else
    FAILS=0
  fi
  TPID=$(cat "$STATE/tunnel.pid" 2>/dev/null || echo "")
  if [ -z "$TPID" ] || ! kill -0 "$TPID" 2>/dev/null; then
    TUNNEL_TOKEN="$(tr -d '\n' < "$HOME/.cloudflared/token")" \
      nohup cloudflared tunnel run >> "$HOME/tunnel.log" 2>&1 &
    echo $! > "$STATE/tunnel.pid"
    log "tunnel restarted"
  fi
  trim
  sleep 120
done
WD_EOF
sed -i "s|__APP__|$APP|g; s|__PORT__|$FRONTEND_PORT|g; s|__API_PORT__|$API_PORT|g; s|__PGDATA__|$PGDATA|g; s|__STATE__|$STATE_DIR|g" "$WATCHDOG"

cat > "$AUDIT" <<'AUD_EOF'
#!/data/data/com.termux/files/usr/bin/bash
set -u
APP="__APP__"
PORT="__PORT__"
P=0; W=0; F=0
ok(){ P=$((P+1)); echo "OK   $*"; }
wn(){ W=$((W+1)); echo "WARN $*"; }
bd(){ F=$((F+1)); echo "FAIL $*"; }
curl -sf -m 5 "http://127.0.0.1:$PORT/api/healthz" >/dev/null && ok "api healthz" || bd "api healthz"
curl -sf -m 5 "http://127.0.0.1:$PORT/" >/dev/null && ok "static frontend" || bd "static frontend"
pg_isready -q -h 127.0.0.1 -p 5432 && ok "postgres" || bd "postgres"
pgrep -f "node start.mjs" >/dev/null && ok "node start.mjs" || bd "node start.mjs"
pgrep -f "cloudflared tunnel run" >/dev/null && ok "tunnel process" || bd "tunnel process"
pgrep -f "orahdex-watchdog" >/dev/null && ok "watchdog" || wn "watchdog not running"
curl -sf -m 8 -o /dev/null https://orahdex.com && ok "public domain" || wn "public domain (tunnel/dns)"
curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null && ok "ollama" || wn "ollama (AI off)"
[ -f "$APP/artifacts/api-server/dist/index.mjs" ] && ok "api build" || bd "api build missing"
[ -f "$APP/artifacts/bsv-dex/dist/public/index.html" ] && ok "frontend build" || bd "frontend build missing"
grep -q "^BSV_WALLET_SECRET=." "$APP/.env" && ok "BSV_WALLET_SECRET set" || wn "BSV_WALLET_SECRET empty (BSV wallet returns 500)"
df -Pk "$HOME" | awk 'NR==2 && $4 < 2097152 {exit 1}' && ok "disk >2G free" || wn "disk low"
echo "------------------------------"
echo "RESULT: $P ok, $W warnings, $F failures"
[ "$F" -eq 0 ] || exit 1
AUD_EOF
sed -i "s|__APP__|$APP|g; s|__PORT__|$FRONTEND_PORT|g" "$AUDIT"

chmod +x "$LAUNCHER" "$WATCHDOG" "$AUDIT"
if [ -d "$HOME/.termux" ] || mkdir -p "$HOME/.termux/boot"; then
  mkdir -p "$HOME/.termux/boot"
  printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\nbash %s\nbash %s >> ~/watchdog.log 2>&1 &\n' \
    "$LAUNCHER" "$WATCHDOG" > "$HOME/.termux/boot/orahdex.sh"
  info "boot hook written (needs the Termux:Boot app)"
fi

# --------------------------------------------------------------------- start
step "[+] Start"
[ -f "$STATE_DIR/app.pid" ] && {
  OLD=$(cat "$STATE_DIR/app.pid" 2>/dev/null)
  [ -n "$OLD" ] && pkill -P "$OLD" 2>/dev/null; kill "$OLD" 2>/dev/null
}
pkill -f "cloudflared tunnel run" 2>/dev/null
pkill -f "orahdex-watchdog" 2>/dev/null
sleep 2
bash "$LAUNCHER"
nohup bash "$WATCHDOG" >/dev/null 2>&1 &
sleep 5

step "Status"
curl -s -m 5 "http://127.0.0.1:$FRONTEND_PORT/api/healthz"; echo
printf '\n'
cat <<SUMMARY
  Local:   http://127.0.0.1:$FRONTEND_PORT
  Public:  https://orahdex.com   (tunnel -> localhost:$FRONTEND_PORT)
  Secrets: $ENV_FILE  (nano to edit)
  Token:   $TOKEN_FILE (nano to edit)
  Logs:    tail -f ~/orahdex.log  |  tail -f ~/tunnel.log  |  ~/watchdog.log
  Audit:   bash ~/orahdex-audit.sh
  Restart: bash ~/start-orahdex.sh
  Rebuild: bash $APP/termux/bootstrap.sh --rebuild
SUMMARY
