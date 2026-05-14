/**
 * SimpleSwap API helper (v1).
 *
 * Supports two modes:
 *   A) USDT-in buy flow (legacy)  — quoteFromSS / getSsRange / createSsExchange
 *   B) General any→any swap       — quoteFromSSPair / getSsRangePair / createSsExchangePair
 *
 * Mode B unlocks SimpleSwap as a full meta-router competitor for all pairs.
 *
 * Auth: ?api_key=<KEY> query parameter (no header).
 * Docs: https://api.simpleswap.io/swagger
 */

import { logger } from "./logger.js";

const SS_BASE = "https://api.simpleswap.io";
const API_KEY = process.env.SIMPLESWAP_API_KEY ?? "";

/* OrahDEX coin symbol → SimpleSwap currency ticker.
   Tickers verified against SimpleSwap's `/get_all_currencies` endpoint. */
/* Verified live against /get_all_currencies + /get_estimated (May 2026).
   DOT is intentionally absent: SimpleSwap has no clean native-Polkadot ticker
   (only `dotassethub` / `dotbsc`), so DOT small-orders are unsupported; orders
   ≥ $122 still fulfill via LetsExchange. */
export const SS_COIN_TICKER: Record<string, string> = {
  BTC:   "btc",
  ETH:   "eth",
  BSV:   "bsv",
  BNB:   "bnb-bsc",
  SOL:   "sol",
  XRP:   "xrp",
  ADA:   "ada",
  DOGE:  "doge",
  AVAX:  "avaxc",
  MATIC: "pol",
  USDT:  "usdterc20",
  USDC:  "usdc",
  LINK:  "link",
  UNI:   "uni",
};

export function isSimpleSwapConfigured(): boolean {
  return API_KEY.length > 0;
}

async function ssRequest(
  path: string,
  params: Record<string, string | number | boolean> = {},
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (!API_KEY) {
    return { ok: false, status: 0, data: { error: "SIMPLESWAP_API_KEY not configured" } };
  }
  const qs = new URLSearchParams({ api_key: API_KEY });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const url = `${SS_BASE}${path}?${qs.toString()}`;

  // SSRF guard: verify the URL stays within the hardcoded API base.
  if (!url.startsWith(SS_BASE + "/")) {
    return { ok: false, status: 0, data: { error: "Invalid request path" } };
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message ?? "network error" } };
  }
}

// ─── General any→any helpers (Mode B) ────────────────────────────────────────

/**
 * Resolve a coin symbol to a SimpleSwap ticker.
 * Falls back to lowercase if not in the map (handles many coins automatically).
 */
export function toSsTicker(symbol: string): string {
  return SS_COIN_TICKER[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

/**
 * General quote: how many `to` coins do we get for `amount` of `from`?
 */
export async function quoteFromSSPair(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ estimatedAmount: number; minAmount: number | null; maxAmount: number | null } | null> {
  const tickerFrom = toSsTicker(from);
  const tickerTo   = toSsTicker(to);

  const [estimateRes, rangeRes] = await Promise.all([
    ssRequest("/get_estimated", { fixed: false, currency_from: tickerFrom, currency_to: tickerTo, amount }),
    ssRequest("/get_ranges",    { fixed: false, currency_from: tickerFrom, currency_to: tickerTo }),
  ]);

  if (!estimateRes.ok || estimateRes.data == null) return null;

  let estimatedAmount = 0;
  const ed = estimateRes.data;
  if (typeof ed === "string" || typeof ed === "number") {
    estimatedAmount = parseFloat(String(ed)) || 0;
  } else if (typeof ed === "object") {
    const d = ed as Record<string, unknown>;
    estimatedAmount = parseFloat(String(d.estimated_amount ?? d.amount ?? "")) || 0;
  }
  if (estimatedAmount <= 0) return null;

  let minAmount: number | null = null;
  let maxAmount: number | null = null;
  if (rangeRes.ok && rangeRes.data && typeof rangeRes.data === "object") {
    const rd = rangeRes.data as Record<string, unknown>;
    minAmount = rd.min != null ? parseFloat(String(rd.min)) || null : null;
    const maxRaw = rd.max != null ? parseFloat(String(rd.max)) : null;
    maxAmount = maxRaw && !Number.isNaN(maxRaw) && maxRaw > 0 ? maxRaw : null;
  }

  return { estimatedAmount, minAmount, maxAmount };
}

/**
 * General create exchange for any from→to pair.
 */
export async function createSsExchangePair(args: {
  from:       string;
  to:         string;
  amount:     number;
  address:    string;
  extraId?:   string;
}): Promise<{ ok: true; exchange: SsExchange } | { ok: false; error: string }> {
  const tickerFrom = toSsTicker(args.from);
  const tickerTo   = toSsTicker(args.to);

  const body = {
    fixed:                false,
    currency_from:        tickerFrom,
    currency_to:          tickerTo,
    amount:               parseFloat(args.amount.toFixed(8)),
    address_to:           args.address.trim(),
    extra_id_to:          args.extraId ?? "",
    user_refund_address:  "",
    user_refund_extra_id: "",
  };

  const { ok, status, data } = await ssRequest("/create_exchange", {}, "POST", body);
  if (!ok || !data || typeof data !== "object") {
    const d = data as Record<string, unknown> | null;
    const msg = (d?.message as string) ?? (d?.error as string) ?? `SimpleSwap HTTP ${status}`;
    logger.error({ msg, body }, "SimpleSwap: create_exchange (pair) failed");
    return { ok: false, error: msg };
  }

  const d = data as Record<string, unknown>;
  const id = String(d.id ?? "");
  const depositAddress = String(d.address_from ?? "");
  if (!id || !depositAddress) {
    return { ok: false, error: "SimpleSwap response missing id or address_from" };
  }
  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:   d.extra_id_from ? String(d.extra_id_from) : null,
      withdrawalAmount: d.amount_to     ? String(d.amount_to)     : null,
    },
  };
}

// ─── Legacy USDT-in helpers (Mode A) ─────────────────────────────────────────

/* Quote: how many target-coin do we get for `netUsdt` USDT-ERC20?
   Returns ratePerCoin = USD price the customer effectively pays per unit. */
export async function quoteFromSS(
  coinSymbol: string,
  netUsdt: number,
): Promise<{ coinAmount: number; ratePerCoin: number } | null> {
  const ticker = SS_COIN_TICKER[coinSymbol.toUpperCase()];
  if (!ticker) return null;

  const { ok, data } = await ssRequest("/get_estimated", {
    fixed:         false,
    currency_from: "usdterc20",
    currency_to:   ticker,
    amount:        netUsdt.toFixed(4),
  });
  if (!ok || data == null) return null;

  /* SimpleSwap returns either a bare numeric string or { estimated_amount }.
     Handle both shapes defensively. */
  let coinAmount = 0;
  if (typeof data === "string" || typeof data === "number") {
    coinAmount = parseFloat(String(data)) || 0;
  } else if (typeof data === "object") {
    const d = data as Record<string, unknown>;
    coinAmount = parseFloat(String(d.estimated_amount ?? d.amount ?? "")) || 0;
  }

  if (coinAmount <= 0) return null;
  return { coinAmount, ratePerCoin: netUsdt / coinAmount };
}

/* Min/max swap range (in USDT) for a given pair.
   Used to gate orders before creating a Stripe PI. */
export async function getSsRange(
  coinSymbol: string,
): Promise<{ min: number; max: number | null } | null> {
  const ticker = SS_COIN_TICKER[coinSymbol.toUpperCase()];
  if (!ticker) return null;
  const { ok, data } = await ssRequest("/get_ranges", {
    fixed:         false,
    currency_from: "usdterc20",
    currency_to:   ticker,
  });
  if (!ok || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const min = parseFloat(String(d.min ?? "")) || 0;
  const maxRaw = d.max == null ? null : parseFloat(String(d.max));
  const max = maxRaw && !Number.isNaN(maxRaw) && maxRaw > 0 ? maxRaw : null;
  return { min, max };
}

export interface SsExchange {
  id:              string;
  depositAddress:  string;          // where OrahDEX must send USDT
  depositExtraId:  string | null;
  withdrawalAmount: string | null;  // estimated coin user receives
}

export async function createSsExchange(args: {
  coinSymbol:      string;
  netUsdt:         number;
  walletAddress:   string;
  walletExtraId?:  string;
}): Promise<{ ok: true; exchange: SsExchange } | { ok: false; error: string }> {
  const ticker = SS_COIN_TICKER[args.coinSymbol.toUpperCase()];
  if (!ticker) return { ok: false, error: `No SimpleSwap ticker for ${args.coinSymbol}` };

  const body = {
    fixed:                  false,
    currency_from:          "usdterc20",
    currency_to:            ticker,
    amount:                 parseFloat(args.netUsdt.toFixed(4)),
    address_to:             args.walletAddress.trim(),
    extra_id_to:            args.walletExtraId ?? "",
    user_refund_address:    "",
    user_refund_extra_id:   "",
  };

  const { ok, status, data } = await ssRequest("/create_exchange", {}, "POST", body);
  if (!ok || !data || typeof data !== "object") {
    const d = data as Record<string, unknown> | null;
    const msg = (d?.message as string) ?? (d?.error as string) ?? `SimpleSwap HTTP ${status}`;
    logger.error({ msg, body }, "SimpleSwap: create_exchange failed");
    return { ok: false, error: msg };
  }

  const d = data as Record<string, unknown>;
  const id = String(d.id ?? "");
  const depositAddress = String(d.address_from ?? "");
  if (!id || !depositAddress) {
    return { ok: false, error: "SimpleSwap response missing id or address_from" };
  }
  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:  d.extra_id_from ? String(d.extra_id_from) : null,
      withdrawalAmount: d.amount_to ? String(d.amount_to) : null,
    },
  };
}

export async function getSsExchange(id: string): Promise<{
  status: string;
  txTo:   string | null;
} | null> {
  const { ok, data } = await ssRequest("/get_exchange", { id });
  if (!ok || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    status: String(d.status ?? ""),
    txTo:   d.tx_to ? String(d.tx_to) : null,
  };
}
