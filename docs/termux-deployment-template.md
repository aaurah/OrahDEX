# OrahDEX Termux deployment template

This template is for running the **full OrahDEX site and API on Termux**. It contains no real credentials. Only enter newly rotated values locally on your phone; never paste secrets into chat, screenshots, Git, or the deployment script.

## Before starting

- Do not run the old attached deployment script. Its credentials were exposed, and it stops processes and changes application/database state.
- Rotate the exposed wallet keys, Cloudflare tunnel token, admin login/TOTP, and live vendor API keys first. A blockchain private key is not invalidated by deleting it from `.env`; move any affected funds and update contract permissions.
- This guide preserves existing data. It does not initialize, erase, restore, or migrate PostgreSQL. Do not run `drizzle-kit push` or `push-force` against an existing database.
- If `~/OrahDEX-app` already exists, stop before extracting. Do not overwrite a live install; first make a verified database backup and choose a separate staging directory.

## 1. Install Termux packages and grant storage

Run these in the **Termux app**, not in Replit:

```sh
termux-setup-storage
pkg update
pkg install nodejs-lts pnpm git unzip curl cloudflared nano postgresql openssl-tool procps
termux-wake-lock
```

Accept Android’s storage permission prompt. Keep Termux exempt from battery optimization and keep the phone charging while it hosts the public site.

## 2. Check and extract `OrahDEX.zip`

Put `OrahDEX.zip` in Android’s **Downloads** folder. This extracts into a new folder and refuses to overwrite an existing install:

```sh
ZIP="$HOME/storage/downloads/OrahDEX.zip"
APP="$HOME/OrahDEX-app"
STAGE="$HOME/OrahDEX-stage"

test -f "$ZIP" || { echo "Put OrahDEX.zip in Downloads first"; exit 1; }
test ! -e "$APP" || { echo "$APP already exists; stop and make a backup before updating"; exit 1; }
test ! -e "$STAGE" || { echo "$STAGE already exists; rename it before retrying"; exit 1; }
unzip -t "$ZIP" || exit 1
mkdir -p "$STAGE"
unzip -q "$ZIP" -d "$STAGE"

if [ -f "$STAGE/package.json" ]; then
  mv "$STAGE" "$APP"
elif [ -f "$STAGE/OrahDEX/package.json" ]; then
  mv "$STAGE/OrahDEX" "$APP"
else
  echo "Could not find the OrahDEX project package.json; nothing was installed."
  echo "Extracted files remain in $STAGE for inspection."
  exit 1
fi
```

If your ZIP uses a different folder name, stop and inspect it with `unzip -l "$ZIP"`; do not extract over the current app.

## 3. Install dependencies and build

Keep Termux open while this runs:

```sh
cd "$HOME/OrahDEX-app"
export NODE_OPTIONS=--max-old-space-size=3072
pnpm install --frozen-lockfile
pnpm --filter @workspace/bsv-dex build
pnpm --filter @workspace/api-server build
```

## 4. Create the API `.env` locally

Copy the blank project template only if an API `.env` does not already exist:

```sh
cd "$HOME/OrahDEX-app"
test ! -e artifacts/api-server/.env || {
  echo "An API .env already exists. Back it up and edit it; do not overwrite it."
  exit 1
}
cp .env.example artifacts/api-server/.env
nano artifacts/api-server/.env
```

In `nano`, fill the blank fields with **newly rotated** values you still need. Keep unused services blank. Add these lines at the end if they are not present:

```dotenv
NODE_ENV=production
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_TOTP_SECRET=
DEVAI_OLLAMA_ENABLED=true
DEVAI_OLLAMA_REMOTE=false
DEVAI_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
DEVAI_MODEL=qwen2.5-coder:1.5b
ORA_AI_MODEL=llama3.2:3b
```

Leave wallet private-key fields blank until the keys are rotated and any affected funds/contracts are secured. The Ollama models must already be installed and the Ollama service running on this phone. The API will still report AI unavailable if the phone does not have enough free memory; do not bypass the memory guard.

If Ollama is installed directly in Termux, start it in a separate Termux session:

```sh
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

Then check `ollama list` and `curl -fsS http://127.0.0.1:11434/api/tags`. If Ollama is installed inside Debian, start it from that Debian session and verify the same loopback URL is reachable from Termux.

Save in nano with **Ctrl+O**, press **Enter**, then **Ctrl+X**. Protect the file:

```sh
chmod 600 "$HOME/OrahDEX-app/artifacts/api-server/.env"
```

Generate a fresh session secret locally without displaying it:

```sh
cd "$HOME/OrahDEX-app/artifacts/api-server"
sed -i '/^SESSION_SECRET=/d' .env
printf 'SESSION_SECRET="%s"\n' "$(openssl rand -hex 32)" >> .env
chmod 600 .env
```

Set `DATABASE_URL` to the database you intend to use. For an existing Termux database, keep its known-working connection string. This guide will not create a database or run schema changes. If this is a fresh database, stop and restore a verified backup or prepare a reviewed migration first.

## 5. Store the rotated tunnel token separately

For the public OrahDEX site, the Cloudflare hostname should route to `http://127.0.0.1:8080`. Do not expose Ollama’s port `11434` as a public hostname.

After rotating the tunnel token in Cloudflare, make a private token file:

```sh
mkdir -p "$HOME/.config/orahdex"
chmod 700 "$HOME/.config/orahdex"
nano "$HOME/.config/orahdex/tunnel-token"
```

Paste **only the new tunnel token** into that file, save with **Ctrl+O**, **Enter**, **Ctrl+X**, then run:

```sh
chmod 600 "$HOME/.config/orahdex/tunnel-token"
```

Cloudflare supports `cloudflared tunnel run --token-file <PATH>`; this keeps the token out of the launcher script and command history. Update or disable the old watchdog first so it cannot restart the connector with the exposed token.

## 6. Start OrahDEX

The safe launcher is `scripts/termux/start-orahdex.sh` in this workspace. Open that file from Replit Files, copy its contents, then in Termux run `nano ~/start-orahdex.sh`, paste it, save with **Ctrl+O**, **Enter**, **Ctrl+X**, and run:

```sh
chmod 700 "$HOME/start-orahdex.sh"
bash "$HOME/start-orahdex.sh"
```

The launcher starts an already-initialized PostgreSQL cluster, the built API, and `cloudflared`. It does not kill existing processes, remove files, initialize a database, or run migrations. If an old API or tunnel process is still running, it stops and asks you to plan a backed-up cutover; do not kill processes until you have identified them and disabled the old watchdog.

For automatic launch after a phone reboot, install the **Termux:Boot** companion app from the same source as Termux. Then create:

```sh
mkdir -p "$HOME/.termux/boot"
nano "$HOME/.termux/boot/start-orahdex"
```

Paste:

```sh
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
bash /data/data/com.termux/files/home/start-orahdex.sh
```

Save, then run `chmod 700 "$HOME/.termux/boot/start-orahdex"`.

## AI and Cloudflare Access

When the full app and Ollama are on the same phone, keep Ollama bound to `127.0.0.1:11434`. Do not expose that port through the public OrahDEX hostname. If Replit will call the Termux-hosted model, add a **separate** hostname protected by Cloudflare Access Service Auth; only then configure Replit with that HTTPS endpoint and store the Access client ID/secret in Replit Secrets.

This is a deployment template, not a live cutover. Test `/api/health` and `/api/ai/status` on the phone first. The public site will depend on the phone, its network, and Android allowing Termux to stay awake.
