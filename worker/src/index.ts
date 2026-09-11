import { Hono } from "hono";
import type { Env } from "./env";
import { withDb } from "./db";
import { verifyWebhookSignature, extractEventId } from "./hmac";
import { runCron } from "./reconcilers";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({ service: "orahdex-exchange", environment: c.env.ENVIRONMENT })
);

app.get("/health", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};
  let dbOk = false;
  try {
    const { rows } = await withDb(c.env, async (db) => {
      const r = await db.query(`SELECT now() AS db_time`);
      const hb = await db.query(
        `SELECT last_beat FROM worker_heartbeat WHERE id = 1`
      );
      return { r, hb };
    });
    checks["database"] = "ok";
    checks["worker-heartbeat"] =
      rows.hb.rows[0] &&
      Date.now() - new Date(rows.hb.rows[0].last_beat as string).getTime() < 5 * 60 * 1000
        ? "ok"
        : "error";
    dbOk = true;
  } catch {
    checks["database"] = "error";
    checks["worker-heartbeat"] = "error";
  }

  const status = dbOk ? "healthy" : "degraded";
  return c.json(
    {
      status,
      environment: c.env.ENVIRONMENT,
      checks,
      hasEvmSecret: Boolean(c.env.EVM_WEBHOOK_SECRET),
      hasStripeSecret: Boolean(c.env.STRIPE_WEBHOOK_SECRET),
      hotWalletConfigured: Boolean(c.env.EXCHANGE_HOT_WALLET_KEY),
    },
    dbOk ? 200 : 503
  );
});

/**
 * EVM webhook — raw body, single canonical header, constant-time HMAC,
 * idempotent by provider event id. Enqueue/extend handler logic where marked.
 */
app.post("/api/webhooks/evm", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("x-webhook-signature") ?? null;
  const valid = verifyWebhookSignature(raw, c.env.EVM_WEBHOOK_SECRET, signature);
  const eventId = extractEventId(raw, "id") ?? `unsigned-${crypto.randomUUID()}`;

  await withDb(c.env, async (db) => {
    await db.query(
      `INSERT INTO webhook_events (source, event_id, signature_valid, payload)
       VALUES ('evm', $1, $2, $3::jsonb)
       ON CONFLICT (source, event_id) DO NOTHING`,
      [eventId, valid, raw]
    );
  });

  if (!valid) {
    return c.json({ received: false, reason: "invalid-signature" }, 401);
  }
  if (!extractEventId(raw, "id")) {
    return c.json({ received: false, reason: "missing-event-id" }, 400);
  }
  // TODO(port): dispatch to confirmation-service / deposit watcher logic
  // previously in artifacts/api-server/src/lib/. Keep it idempotent — this
  // endpoint retries.
  return c.json({ received: true, eventId });
});

/** Stripe webhook — same contract, Stripe's secret. */
app.post("/api/stripe/webhook", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("x-webhook-signature") ?? null;
  const valid = verifyWebhookSignature(raw, c.env.STRIPE_WEBHOOK_SECRET, signature);
  const eventId = extractEventId(raw, "id") ?? `unsigned-${crypto.randomUUID()}`;

  await withDb(c.env, async (db) => {
    await db.query(
      `INSERT INTO webhook_events (source, event_id, signature_valid, payload)
       VALUES ('stripe', $1, $2, $3::jsonb)
       ON CONFLICT (source, event_id) DO NOTHING`,
      [eventId, valid, raw]
    );
  });

  if (!valid) {
    return c.json({ received: false, reason: "invalid-signature" }, 401);
  }
  // TODO(port): license-credit / payment reconciliation logic goes here.
  return c.json({ received: true, eventId });
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env, event.cron));
  },
};
