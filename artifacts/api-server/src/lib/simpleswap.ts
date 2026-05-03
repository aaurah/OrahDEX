/**
 * SimpleSwap API helper (v1).
 *
 * Used as the small-order fulfillment backend ($10–$121 USD).
 * Same operational model as LetsExchange:
 *   1. Quote   — GET /get_estimated      (preview crypto-out for given USDT-in)
 *   2. Create  — POST /create_exchange   (returns USDT deposit address)
 *   3. Status  — GET /get_exchange       (poll for finished/failed)
 *
 * After creation, the OrahDEX operator funds the deposit address with USDT-ERC20
 * from the hot wallet to trigger the user's withdrawal.
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
