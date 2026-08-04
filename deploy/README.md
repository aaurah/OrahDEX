# OrahDEX deploy kit (Azure + Google Cloud)

Production packaging for [aaurah/OrahDEX](https://github.com/aaurah/OrahDEX).

## Contents

| Path | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage API image (Node 20, port 8080) |
| `Dockerfile.frontend` | Static frontend via nginx |
| `docker-compose.yml` | Local API + Postgres + frontend |
| `.env.example` | Required secrets |
| `gcp/deploy.sh` | One-shot Cloud Run deploy |
| `gcp/cloudbuild.yaml` | Cloud Build pipeline |
| `azure/deploy.sh` | One-shot ACR + Postgres + Container Apps |
| `azure/bicep/main.bicep` | Azure IaC starter |
| `scripts/migrate-db.sh` | Apply Drizzle SQL |
| `.github/workflows/deploy-gcp.yml` | GitHub Actions → Cloud Run |

## Critical production rules

1. **Replicas = 1** for the API until background workers (price, HTLC, funding, etc.) use distributed locks.
2. **CPU always allocated** on Cloud Run (`--no-cpu-throttling`) so intervals keep running.
3. **Heap** `NODE_OPTIONS=--max-old-space-size=4096`.
4. Put **secrets** in Azure Key Vault / GCP Secret Manager — never in git.
5. Apply DB schema **before** first traffic (`scripts/migrate-db.sh`).

## Quick start (local)

```bash
# 1. Clone OrahDEX and place this kit as deploy/ inside the repo
git clone https://github.com/aaurah/OrahDEX.git
cd OrahDEX
# copy this folder to ./deploy

# 2. Env
cp deploy/.env.example deploy/.env
# edit deploy/.env

# 3. Adjust docker-compose build context if needed, then:
cd deploy
docker compose up -d --build

# 4. Migrate
DATABASE_URL='postgresql://orahdex:PASSWORD@localhost:5432/orahdex' \
  ./scripts/migrate-db.sh ..
```

API: `http://localhost:8080` · Frontend: `http://localhost:8081`

## Google Cloud

```bash
export PROJECT_ID=your-gcp-project
# Create Cloud SQL instance + secrets in console first (DATABASE_URL, EVM_WALLET_SECRET, ...)
chmod +x deploy/gcp/deploy.sh
./deploy/gcp/deploy.sh
```

Then in Cloud Run → **Edit & deploy** → **Variables & secrets**, attach:

- `DATABASE_URL`
- `EVM_WALLET_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `LETSEXCHANGE_API_KEY`, `SIMPLESWAP_API_KEY`
- `COINBASE_*`, `EVM_WEBHOOK_SECRET`

Webhooks:

- Stripe → `https://<cloud-run-url>/api/stripe/webhook`
- EVM → `https://<cloud-run-url>/api/webhooks/evm`

## Azure

```bash
az login
chmod +x deploy/azure/deploy.sh
./deploy/azure/deploy.sh
# Saves DATABASE_URL to azure-db.url — protect it
```

Add remaining secrets:

```bash
az containerapp secret set -g rg-orahdex-prod -n orahdex-api \
  --secrets \
    evm-wallet-secret='...' \
    stripe-secret-key='...' \
    stripe-webhook-secret='...' \
    letsexchange-api-key='...' \
    simpleswap-api-key='...' \
    evm-webhook-secret='...'

az containerapp update -g rg-orahdex-prod -n orahdex-api \
  --set-env-vars \
    EVM_WALLET_SECRET=secretref:evm-wallet-secret \
    STRIPE_SECRET_KEY=secretref:stripe-secret-key \
    STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-secret \
    LETSEXCHANGE_API_KEY=secretref:letsexchange-api-key \
    SIMPLESWAP_API_KEY=secretref:simpleswap-api-key \
    EVM_WEBHOOK_SECRET=secretref:evm-webhook-secret
```

## Cloudflare

Point `aaurah.org` / `api.aaurah.org` (or `orahdex.org`) at the cloud origin:

- Frontend → Static host or nginx container
- API → Cloud Run / Container Apps FQDN
- SSL mode: **Full (strict)**
- Enable WAF + rate limits on `/api/*`

Keep **one active API region** to avoid duplicate workers.

## Health

- `GET /api/health` — detailed (consider restricting in prod)
- `GET /api/healthz` — used by Railway; enable if present

## Install this kit into the repo

```bash
cd OrahDEX
mkdir -p deploy
# copy all files from this package into deploy/
# ensure Dockerfile paths match (build context = repo root)
```

Dockerfile expects monorepo layout:

```text
package.json
pnpm-workspace.yaml
lib/
artifacts/api-server/
artifacts/bsv-dex/
deploy/Dockerfile
```
