# Termux Ollama host for the Replit app

This is the selected setup: the **OrahDEX website and API stay on Replit**; Termux runs only Ollama and `cloudflared`. You do not need `OrahDEX.zip`, PostgreSQL, the API `.env`, or OrahDEX wallet/API keys on the phone for this path.

## Important credential split

- The **Cloudflare Tunnel connector token** must be stored on the phone because `cloudflared` runs there. Keep it in the protected local token file below, not in Replit, a script, Git, or chat.
- The **Cloudflare Access Service Token** (Client ID and Client Secret) goes in Replit Secrets. It lets the Replit API call the protected model hostname.
- The old attached script exposed its tunnel token and other credentials. Rotate them before continuing; do not reuse the values from that script.

## 1. Keep Ollama on loopback

In Termux, install `cloudflared` if it is not already installed and hold a wake lock:

```sh
pkg install cloudflared curl nano procps
termux-wake-lock
```

Start Ollama in Termux, or in the Debian session where your models are installed:

```sh
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

In a second Termux session, verify both models are available from the local Ollama endpoint:

```sh
curl -fsS http://127.0.0.1:11434/api/tags
```

The response should contain `llama3.2:3b` and `qwen2.5-coder:1.5b`. Do not expose port `11434` directly to the Internet.

## 2. Create a separate protected hostname

In the Cloudflare dashboard:

1. Rotate the previously exposed tunnel token, or create a new named tunnel dedicated to Ollama. If you create a new tunnel, also disable the old tunnel or rotate its token.
2. Add a hostname such as `ollama.orahdex.com` to the tunnel. The service must be `http://127.0.0.1:11434`.
3. Create a Cloudflare Access application for that hostname with a **Service Auth** policy. Allow only a newly created Service Token.
4. Keep the existing public OrahDEX hostname pointed at Replit. Do not point the root site hostname or an unauthenticated hostname at Ollama.

Cloudflare references: [Tunnel token rotation](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/), [Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

## 3. Store the rotated connector token on Termux

Create a local file containing only the **new** tunnel connector token:

```sh
mkdir -p "$HOME/.config/orahdex"
chmod 700 "$HOME/.config/orahdex"
nano "$HOME/.config/orahdex/ollama-tunnel-token"
```

Paste the new connector token into nano, save with **Ctrl+O**, press **Enter**, then **Ctrl+X**:

```sh
chmod 600 "$HOME/.config/orahdex/ollama-tunnel-token"
```

Do not put the token in the launcher script. Cloudflare supports `cloudflared tunnel run --token-file <PATH>`.

## 4. Start the tunnel

Copy `scripts/termux/start-ollama-tunnel.sh` from this project into Termux as `~/start-ollama-tunnel.sh` using nano. Save, then run:

```sh
chmod 700 "$HOME/start-ollama-tunnel.sh"
bash "$HOME/start-ollama-tunnel.sh"
```

The script checks the local Ollama endpoint, refuses to start a duplicate tunnel process, and reads the connector token from the private file. It does not install models, expose the Ollama port, or modify OrahDEX data.

## 5. Configure Replit after the hostname and Access token exist

The Replit API needs:

- Production variable `DEVAI_OLLAMA_REMOTE=true`
- Production variable `DEVAI_OLLAMA_BASE_URL=https://<your-protected-hostname>/v1`
- Replit Secrets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` from the new Access Service Token

Do not enable remote mode before both Access secrets and the hostname are ready. I can set the production URL and open the secure Secrets form after you provide only the hostname. Never send either token in chat.

The Termux phone must stay awake and connected for AI replies. Replit remains the public website/API; the phone provides only the model.
