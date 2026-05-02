// Stripe client — reads keys from environment secrets (STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY)
// Falls back to Replit Connectors proxy if env vars are not set.
import Stripe from "stripe";

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (secretKey && publishableKey) {
    return { secretKey, publishableKey };
  }

  // ── Fallback: Replit Connectors proxy ────────────────────────────────────
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in Secrets."
    );
  }

  const isProduction =
    process.env.STRIPE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Replit-Token": xReplitToken,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Stripe credentials fetch failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    items?: Array<{ settings?: { publishable?: string; secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.publishable || !settings?.secret) {
    throw new Error(
      `Stripe ${targetEnvironment} connection not found. ` +
      "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in Secrets."
    );
  }

  return {
    publishableKey: settings.publishable,
    secretKey: settings.secret,
  };
}

// WARNING: Never cache this client — tokens may rotate.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

// StripeSync for webhook processing (lazy singleton — reset on module reload)
let _stripeSync: any = null;

export async function getStripeSync() {
  if (!_stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const { secretKey } = await getCredentials();
    _stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return _stripeSync;
}
