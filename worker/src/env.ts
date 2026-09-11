export interface Env {
  HYPERDRIVE: Hyperdrive;
  ENVIRONMENT: string;
  CANONICAL_DOMAIN: string;
  // Secrets (set via `wrangler secret put`, never committed):
  EVM_WEBHOOK_SECRET: string;
  STRIPE_WEBHOOK_SECRET: string;
  EXCHANGE_HOT_WALLET_KEY?: string;
  EVM_RELAYER_KEY?: string;
}
