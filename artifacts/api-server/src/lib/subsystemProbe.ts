/**
 * subsystemProbe.ts — OrahDEX External Subsystem Health Probes
 *
 * Actively tests every external dependency (RPC nodes, LE API, Stripe,
 * price engine freshness, BSV/WoC) and returns structured probe results.
 * Designed for the /api/admin/diagnostics endpoint and the self-healing engine.
 */

import { logger } from "./logger.js";

export type ProbeStatus = "ok" | "degraded" | "down";

export interface ProbeResult {
  name:       string;
  label:      string;
  status:     ProbeStatus;
  latencyMs:  number;
  detail:     string;
  error?:     string;
  checkedAt:  string;
}

/* ── Utility ──────────────────────────────────────────────────────────────── */

async function timed<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  return { value, latencyMs: Date.now() - start };
}

async function probe(
  name: string,
  label: string,
  fn: () => Promise<string>,
  timeoutMs = 6_000,
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { value: detail, latencyMs } = await timed(fn, timeoutMs);
    return { name, label, status: "ok", latencyMs, detail, checkedAt: new Date().toISOString() };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const status: ProbeStatus = latencyMs >= timeoutMs - 100 ? "degraded" : "down";
    return {
      name, label, status, latencyMs,
      detail: "—",
      error:  err?.message ?? String(err),
      checkedAt: new Date().toISOString(),
    };
  }
}

/* ── RPC chains ───────────────────────────────────────────────────────────── */

const EVM_CHAINS: Array<{ id: string; label: string; envVar: string; fallback: string }> = [
  { id: "eth",      label: "Ethereum Mainnet",  envVar: "ETH_RPC_URL",      fallback: "https://eth.llamarpc.com" },
  { id: "base",     label: "Base",               envVar: "BASE_RPC_URL",     fallback: "https://base.publicnode.com" },
  { id: "arbitrum", label: "Arbitrum One",       envVar: "ARB_RPC_URL",      fallback: "https://arbitrum-one.publicnode.com" },
  { id: "optimism", label: "Optimism",           envVar: "OP_RPC_URL",       fallback: "https://optimism.publicnode.com" },
  { id: "bnb",      label: "BNB Smart Chain",    envVar: "BSC_RPC_URL",      fallback: "https://bsc-dataseed.binance.org" },
  { id: "polygon",  label: "Polygon",            envVar: "POLYGON_RPC_URL",  fallback: "https://polygon-rpc.com" },
  { id: "avax",     label: "Avalanche C-Chain",  envVar: "AVAX_RPC_URL",     fallback: "https://api.avax.network/ext/bc/C/rpc" },
  { id: "sepolia",  label: "Sepolia Testnet",    envVar: "SEPOLIA_RPC_URL",  fallback: "https://sepolia.publicnode.com" },
];

async function probeRpc(chain: (typeof EVM_CHAINS)[number]): Promise<ProbeResult> {
  const url = process.env[chain.envVar] ?? chain.fallback;
  const isCustom = !!process.env[chain.envVar];

  return probe(
    `rpc:${chain.id}`,
    `${chain.label} RPC${isCustom ? "" : " (public)"}`,
    async () => {
      const r = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal:  AbortSignal.timeout(5_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { result?: string; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      const block = parseInt(j.result ?? "0x0", 16);
      return `block ${block.toLocaleString()} · ${isCustom ? "custom node" : "public node"}`;
    },
    5_500,
  );
}

export async function probeAllRpc(): Promise<ProbeResult[]> {
  return Promise.all(EVM_CHAINS.map(probeRpc));
}

/* ── LetsExchange API ─────────────────────────────────────────────────────── */

export async function probeLetsExchange(): Promise<ProbeResult> {
  const hasKey = !!process.env["LETSEXCHANGE_API_KEY"];
  return probe(
    "letsexchange",
    "LetsExchange API",
    async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (hasKey) headers["Authorization"] = `Bearer ${process.env["LETSEXCHANGE_API_KEY"]}`;
      const r = await fetch("https://api.letsexchange.io/api/v2/coins", {
        headers,
        signal: AbortSignal.timeout(6_000),
      });
      if (r.status === 403) return `Reachable (API key required for full access)`;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as unknown[];
      return `${data.length} coins available · key ${hasKey ? "configured" : "not set"}`;
    },
  );
}

/* ── Stripe API ───────────────────────────────────────────────────────────── */

export async function probeStripe(): Promise<ProbeResult> {
  const hasKey = !!process.env["STRIPE_SECRET_KEY"];
  if (!hasKey) {
    return {
      name: "stripe", label: "Stripe API", status: "degraded",
      latencyMs: 0, detail: "STRIPE_SECRET_KEY not configured",
      checkedAt: new Date().toISOString(),
    };
  }
  return probe(
    "stripe",
    "Stripe API",
    async () => {
      const r = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${process.env["STRIPE_SECRET_KEY"]}` },
        signal: AbortSignal.timeout(6_000),
      });
      if (r.status === 401) throw new Error("Invalid API key");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { object?: string; available?: Array<{ currency: string; amount: number }> };
      const currency = j.available?.[0]?.currency?.toUpperCase() ?? "USD";
      return `Stripe connected · ${currency} account reachable`;
    },
  );
}

/* ── BSV / WhatsOnChain ───────────────────────────────────────────────────── */

export async function probeBsvChain(): Promise<ProbeResult> {
  return probe(
    "bsv",
    "BSV / WhatsOnChain",
    async () => {
      const r = await fetch("https://api.whatsonchain.com/v1/bsv/main/chain/info", {
        signal: AbortSignal.timeout(5_000),
        headers: { "User-Agent": "OrahDEX/1.0" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { blocks?: number; headers?: number };
      return `block ${(j.blocks ?? j.headers ?? 0).toLocaleString()}`;
    },
  );
}

/* ── Database ─────────────────────────────────────────────────────────────── */

export async function probeDatabase(): Promise<ProbeResult> {
  return probe(
    "database",
    "PostgreSQL Database",
    async () => {
      const { pool } = await import("@workspace/db");
      const start = Date.now();
      const { rows } = await pool.query<{ version: string }>("SELECT version() AS version");
      const latencyMs = Date.now() - start;
      const ver = rows[0]?.version?.split(" ").slice(0, 2).join(" ") ?? "unknown";
      const quality = latencyMs < 50 ? "fast" : latencyMs < 200 ? "normal" : "slow";
      return `${ver} · ${latencyMs}ms (${quality})`;
    },
  );
}

/* ── Price engine freshness ───────────────────────────────────────────────── */

let _lastPriceCheck = 0;
let _priceCount     = 0;

export function recordPriceEngineRun(count: number) {
  _lastPriceCheck = Date.now();
  _priceCount     = count;
}

export async function probePriceEngine(): Promise<ProbeResult> {
  const staleSec = _lastPriceCheck ? Math.floor((Date.now() - _lastPriceCheck) / 1000) : null;

  let status: ProbeStatus;
  let detail: string;

  if (staleSec === null) {
    status = "degraded";
    detail = "No price run recorded since startup";
  } else if (staleSec > 300) {
    status = "down";
    detail = `Last price update ${staleSec}s ago (>${Math.floor(staleSec / 60)}m)`;
  } else if (staleSec > 120) {
    status = "degraded";
    detail = `Last price update ${staleSec}s ago`;
  } else {
    status = "ok";
    detail = `${_priceCount} prices · updated ${staleSec}s ago`;
  }

  return {
    name: "price-engine", label: "Price Engine",
    status, latencyMs: 0, detail,
    checkedAt: new Date().toISOString(),
  };
}

/* ── Webhook receiver ─────────────────────────────────────────────────────── */

export async function probeWebhookReceiver(): Promise<ProbeResult> {
  const hasHmacSecret  = !!(process.env["EVM_WEBHOOK_SECRET"] ?? process.env["QUICKNODE_WEBHOOK_SECRET"]);
  const hasStripeSecret = !!process.env["STRIPE_WEBHOOK_SECRET"];
  const hasDomain       = !!process.env["REPLIT_DEV_DOMAIN"];
  const domain          = process.env["REPLIT_DEV_DOMAIN"] ?? "unknown";

  const parts = [
    `EVM HMAC: ${hasHmacSecret ? "configured" : "⚠ not set (unsigned only)"}`,
    `Stripe sig: ${hasStripeSecret ? "configured" : "⚠ not set (insecure)"}`,
    hasDomain ? `domain: ${domain}` : "domain: unknown",
  ];

  const status: ProbeStatus =
    (!hasHmacSecret || !hasStripeSecret) ? "degraded" : "ok";

  return {
    name: "webhook", label: "Webhook Receiver",
    status, latencyMs: 0,
    detail: parts.join(" · "),
    checkedAt: new Date().toISOString(),
  };
}

/* ── Swap router ──────────────────────────────────────────────────────────── */

export async function probeSwapRouter(): Promise<ProbeResult> {
  return probe(
    "swap-router",
    "Swap Router (LE Pairs DB)",
    async () => {
      const { pool } = await import("@workspace/db");
      const { rows } = await pool.query<{ cnt: string }>(
        "SELECT COUNT(*) AS cnt FROM le_pairs WHERE is_active = true",
      );
      const cnt = parseInt(rows[0]?.cnt ?? "0", 10);
      if (cnt < 50) throw new Error(`Only ${cnt} active LE pairs seeded — may need sync`);
      return `${cnt.toLocaleString()} active swap pairs seeded`;
    },
  );
}

/* ── Run all probes ───────────────────────────────────────────────────────── */

export interface SubsystemReport {
  status:      "ok" | "degraded" | "critical";
  checkedAt:   string;
  totalMs:     number;
  summary:     { ok: number; degraded: number; down: number };
  probes:      ProbeResult[];
  rpc:         ProbeResult[];
}

export async function runAllProbes(): Promise<SubsystemReport> {
  const start = Date.now();

  const [
    dbResult,
    leResult,
    stripeResult,
    bsvResult,
    priceResult,
    webhookResult,
    swapResult,
    rpcResults,
  ] = await Promise.all([
    probeDatabase(),
    probeLetsExchange(),
    probeStripe(),
    probeBsvChain(),
    probePriceEngine(),
    probeWebhookReceiver(),
    probeSwapRouter(),
    probeAllRpc(),
  ]);

  const probes = [dbResult, leResult, stripeResult, bsvResult, priceResult, webhookResult, swapResult];
  const allResults = [...probes, ...rpcResults];

  const downCount     = allResults.filter(r => r.status === "down").length;
  const degradedCount = allResults.filter(r => r.status === "degraded").length;
  const okCount       = allResults.filter(r => r.status === "ok").length;

  const status: SubsystemReport["status"] =
    downCount > 3     ? "critical"  :
    downCount > 0     ? "degraded"  :
    degradedCount > 0 ? "degraded"  : "ok";

  logger.info(
    { status, ok: okCount, degraded: degradedCount, down: downCount },
    "[SubsystemProbe] probe run complete",
  );

  return {
    status,
    checkedAt: new Date().toISOString(),
    totalMs:   Date.now() - start,
    summary:   { ok: okCount, degraded: degradedCount, down: downCount },
    probes,
    rpc: rpcResults,
  };
}
