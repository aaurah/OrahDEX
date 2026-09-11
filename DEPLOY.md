# OrahDEX Cloudflare Deployment Runbook

Canonical target architecture (replaces Replit autoscale, Railway, Vercel,
and the Termux/cloudflared path):

```
                 Cloudflare (single account, DNS for orahdex.app)
                ┌──────────────────────────────────────────────┐
  orahdex.app   │  Cloudflare Pages  (frontend, Vite build)    │
  www / .com /  │  ── 301 ──▶  canonical                       │
  .org          │  Bulk Redirect list (managed by setup script)│
                │                                              │
  api.orahdex.  │  Worker "orahdex-exchange" (Hono + Hyperdrive)│
  app           │  Cron: * * * * * and */5 * * * *              │
                │  Postgres via Hyperdrive (existing Neon/pg)  │
                └──────────────────────────────────────────────┘
```

CI/CD: push to `Main` → verify → deploy staging → smoke → migrate prod →
deploy prod worker → deploy Pages → smoke. PRs run the full verify suite.

---

## 0. Prereqs

- Node 22 + pnpm 10
- Cloudflare account with `orahdex.app` zone (DNS-only move if hosted
  elsewhere; apex must ultimately be CNAME-flattened or NS-delegated to CF)
- Existing Postgres (Neon or your current db) with the app's schema already
  applied. The worker adds its own tables via migrations.

## 1. Cloudflare API token

Create token (My Profile → API Tokens) with:
- Account permissions: `Cloudflare Pages:Edit`, `Hyperdrive:Edit`,
  `Rules Lists:Edit`, `Account Rules:Edit`, `Workers Scripts:Edit`,
  `Workers R2 Storage:Edit` (not used, harmless), `Account Settings:Read`
- Zone permission: `DNS:Edit` for `orahdex.app`
- Account resources: your account. Zone resources: `orahdex.app`.

## 2. GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | account id (dash right-hand sidebar) |
| `STAGING_DATABASE_URL` | staging Postgres URL for migrations |
| `PROD_DATABASE_URL` | prod Postgres URL for migrations |
| `EVM_WEBHOOK_SECRET` | HMAC secret for EVM provider webhook |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `EXCHANGE_HOT_WALLET_KEY` | hot wallet key (worker secret) |
| `EVM_RELAYER_KEY` | relayer key (worker secret) |

Environments: create `staging` and `production` environments (Settings →
Environments) and re-scope the DATABASE_URL secrets there if you want
approval gates. The workflow references `environment: staging/production`.

## 3. Provisioning (Pages project, Hyperdrive, redirects)

```bash
export CF_API_TOKEN=... CF_ACCOUNT_ID=...
export DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USER=... DB_PASSWORD=...
bash scripts/setup-cloudflare.sh
```

The script prints the created Hyperdrive config ids. Paste them into
`worker/wrangler.toml` (`REPLACE_WITH_PROD_HYPERDRIVE_ID` /
`REPLACE_WITH_STAGING_HYPERDRIVE_ID`), commit, push.

## 4. Migrations

Migrations run in CI. To run manually:

```bash
cd worker && pnpm install
DATABASE_URL=... node ../scripts/migrate.mjs
```

`0001_worker_core.sql` is additive-only (new tables, no changes to the
exchange schema) and safe to apply while the old api-server is live.

## 5. Custom domain cutover (api.orahdex.app)

1. Ensure `orahdex.app` DNS is served by Cloudflare.
2. In `worker/wrangler.toml`, uncomment the `[[env.production.routes]]`
   block (`custom_domain = true`, `pattern = "api.orahdex.app"`).
3. Push. Wrangler creates the custom-domain certificate and DNS records.
4. In the workflow's production smoke step, set repository variable
   `CUSTOM_DOMAIN_LIVE=true` once DNS resolves.

`api.orahdex.app` previously pointed at the tunnel — the custom domain
replaces it. Nothing else serves that hostname afterwards.

## 6. Frontend cutover (orahdex.app)

1. Pages project `orahdex-app` was created by the setup script.
2. Attach custom domains in dash → Workers & Pages → orahdex-app →
   Custom domains → add `orahdex.app`. (apex works; CNAME flattening)
3. The bulk-redirect ruleset already handles `www.orahdex.app`,
   `orahdex.com`, `www.orahdex.com`, `orahdex.org`, `www.orahdex.org` →
   `orahdex.app` with path/query preserved.
4. Remove old DNS records: the `orahdex.replit.app` CNAME, any Vercel
   records, and the old `REPLIT_VERIFICATION` TXT (replace with the real
   value only if still needed, otherwise delete).

## 7. Decommission the old path

1. On the Termux device: `cloudflared tunnel route dns` cleanup, then
   delete the tunnel: `cloudflared tunnel delete orahdex`.
2. Remove DNS entries pointing at Replit (the autoscale deployment).
3. Delete `cloudflare-tunnel/config.yml`, `orahdex-app.zone`, and
   `vercel.json`/`railway.json`/`nixpacks.toml` once cutover is verified,
   so the repo no longer presents three competing deploy targets.
4. Rotate `EVM_WALLET_SECRET` / `EXCHANGE_HOT_WALLET_KEY` / relayer keys:
   they lived on the Termux device and in Replit envs. New values go into
   GitHub Secrets only — CI syncs them to worker secrets; they are never
   written to a file.

## 8. Rollback

- Worker: `npx wrangler rollback --env production` (instant, built-in).
  Workflow: re-run the last good deploy from the Actions tab.
- Pages: dash → orahdex-app → Deployments → Rollback to previous.
- DB: migrations are additive-only by policy here; destructive migrations
  require an expand/contract cycle and a manual approval gate — do not
  auto-apply them from CI.

## 9. Monitoring

- Worker logs: `npx wrangler tail --env production`
- Cron history: query `worker_cron_runs` (30-day retention, auto-pruned)
- Health: `GET https://api.orahdex.app/health` (db + heartbeat + secret
  presence). Point your existing uptime monitor at it; alert on non-200
  or on `worker-heartbeat` older than 5 minutes.
- Pages: enable web analytics in the Pages project settings.
