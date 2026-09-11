/**
 * lifi.ts — LI.FI cross-chain DEX aggregator client
 *
 * LI.FI is a single API covering 69 chains, 34 bridges, and 36 exchange
 * aggregators (1inch, Paraswap, Odos, KyberSwap, Uniswap, Aerodrome, …).
 * No API key required. Non-custodial — user signs the returned tx.
 *
 * Docs: https://docs.li.fi/li.fi-api/li.fi-api
 */

import { logger } from "./logger.js";

const LIFI_BASE = "https://li.quest/v1";
const INTEGRATOR = "orahdex"; // identifies OrahDEX in LI.FI analytics

// ── Chain registry ─────────────────────────────────────────────────────────────
// Maps our canonical coin/chain symbols → LI.FI chain keys + IDs
export const LIFI_CHAINS: Record<string, { key: string; id: number }> = {
  ETH:      { key: "eth",  id: 1       },
  ETHEREUM: { key: "eth",  id: 1       },
  ARB:      { key: "arb",  id: 42161   },
  ARBITRUM: { key: "arb",  id: 42161   },
  OPT:      { key: "opt",  id: 10      },
  OP:       { key: "opt",  id: 10      },
  BASE:     { key: "bas",  id: 8453    },
  BAS:      { key: "bas",  id: 8453    },
  BSC:      { key: "bsc",  id: 56      },
  BNB:      { key: "bsc",  id: 56      },
  POL:      { key: "pol",  id: 137     },
  POLYGON:  { key: "pol",  id: 137     },
  MATIC:    { key: "pol",  id: 137     },
  AVA:      { key: "ava",  id: 43114   },
  AVAX:     { key: "ava",  id: 43114   },
  GNO:      { key: "dai",  id: 100     },
  SOL:      { key: "sol",  id: 1151111081099710 },
  LIN:      { key: "lin",  id: 59144   },
  LINEA:    { key: "lin",  id: 59144   },
  SCR:      { key: "scr",  id: 534352  },
  SCROLL:   { key: "scr",  id: 534352  },
  ZK:       { key: "era",  id: 324     },
  ZKSYNC:   { key: "era",  id: 324     },
  MNT:      { key: "mnt",  id: 5000    },
  MANTLE:   { key: "mnt",  id: 5000    },
  HYP:      { key: "hpl",  id: 1337    }, // Hyperliquid
};

// ── Token registry ─────────────────────────────────────────────────────────────
// Maps coin symbol → primary (chain, address, decimals) for quote routing.
// Address "0x0...0" = native coin on that chain.
const ZERO = "0x0000000000000000000000000000000000000000";

export interface LifiTokenInfo {
  chain:    string;   // LI.FI chain key (e.g. "eth")
  address:  string;   // token contract address or ZERO for native
  decimals: number;
  symbol:   string;
}

export const TOKEN_REGISTRY: Record<string, LifiTokenInfo[]> = {
  ETH:   [
    { chain: "eth",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "arb",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "opt",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "bas",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "lin",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "scr",  address: ZERO, decimals: 18, symbol: "ETH" },
    { chain: "era",  address: ZERO, decimals: 18, symbol: "ETH" },
  ],
  USDC: [
    { chain: "eth",  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  symbol: "USDC" },
    { chain: "arb",  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6,  symbol: "USDC" },
    { chain: "bas",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  symbol: "USDC" },
    { chain: "opt",  address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6,  symbol: "USDC" },
    { chain: "pol",  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6,  symbol: "USDC" },
    { chain: "bsc",  address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, symbol: "USDC" },
    { chain: "ava",  address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6,  symbol: "USDC" },
  ],
  USDT: [
    { chain: "eth",  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  symbol: "USDT" },
    { chain: "arb",  address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6,  symbol: "USDT" },
    { chain: "bsc",  address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, symbol: "USDT" },
    { chain: "pol",  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  symbol: "USDT" },
    { chain: "opt",  address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6,  symbol: "USDT" },
    { chain: "ava",  address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6,  symbol: "USDT" },
    { chain: "lin",  address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93", decimals: 6,  symbol: "USDT" },
  ],
  BNB:   [{ chain: "bsc",  address: ZERO, decimals: 18, symbol: "BNB"  }],
  MATIC: [{ chain: "pol",  address: ZERO, decimals: 18, symbol: "MATIC" }],
  POL:   [{ chain: "pol",  address: ZERO, decimals: 18, symbol: "POL"  }],
  AVAX:  [{ chain: "ava",  address: ZERO, decimals: 18, symbol: "AVAX" }],
  SOL:   [{ chain: "sol",  address: ZERO, decimals: 9,  symbol: "SOL"  }],
  ARB:   [{ chain: "arb",  address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, symbol: "ARB" }],
  OP:    [{ chain: "opt",  address: "0x4200000000000000000000000000000000000042", decimals: 18, symbol: "OP"  }],
  WBTC:  [
    { chain: "eth",  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  symbol: "WBTC" },
    { chain: "arb",  address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8,  symbol: "WBTC" },
    { chain: "pol",  address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  symbol: "WBTC" },
  ],
  LINK:  [
    { chain: "eth",  address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, symbol: "LINK" },
    { chain: "arb",  address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18, symbol: "LINK" },
  ],
  UNI:   [{ chain: "eth",  address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, symbol: "UNI"  }],
  AAVE:  [{ chain: "eth",  address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18, symbol: "AAVE" }],
  DAI:   [
    { chain: "eth",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, symbol: "DAI" },
    { chain: "pol",  address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, symbol: "DAI" },
  ],
  WETH:  [
    { chain: "eth",  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, symbol: "WETH" },
    { chain: "arb",  address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, symbol: "WETH" },
  ],
  GNO:   [{ chain: "dai",  address: ZERO, decimals: 18, symbol: "GNO"  }],
  MNT:   [{ chain: "mnt",  address: ZERO, decimals: 18, symbol: "MNT"  }],
  LDO:   [{ chain: "eth",  address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", decimals: 18, symbol: "LDO"  }],
  CRV:   [{ chain: "eth",  address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18, symbol: "CRV"  }],
  SNX:   [{ chain: "eth",  address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18, symbol: "SNX"  }],
  PEPE:  [{ chain: "eth",  address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18, symbol: "PEPE" }],
  SHIB:  [{ chain: "eth",  address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18, symbol: "SHIB" }],
  DOGE:  [{ chain: "bsc",  address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", decimals: 8,  symbol: "DOGE" }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve our coin symbol to its primary LI.FI token info. */
export function resolveLifiToken(
  symbol: string,
  preferChain?: string,
): LifiTokenInfo | null {
  const infos = TOKEN_REGISTRY[symbol.toUpperCase()];
  if (!infos || infos.length === 0) return null;
  if (preferChain) {
    const match = infos.find(t => t.chain === preferChain.toLowerCase());
    if (match) return match;
  }
  return infos[0]; // primary
}

/** Convert human-readable amount to token smallest unit (BigInt as string). */
function toTokenUnits(amount: number, decimals: number): string {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor).toString();
}

/** Convert token smallest unit back to human-readable. */
function fromTokenUnits(raw: string, decimals: number): number {
  return parseInt(raw || "0", 10) / Math.pow(10, decimals);
}

/** Placeholder address used for price-only quotes (no real tx generated). */
const PLACEHOLDER_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
/** Return placeholder when addr is empty or is the zero address (both rejected by LI.FI). */
function safeAddr(addr?: string): string {
  if (!addr || addr === ZERO) return PLACEHOLDER_ADDRESS;
  return addr;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function liGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${LIFI_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("integrator", INTEGRATOR);

  const resp = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal:  AbortSignal.timeout(12_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`LI.FI ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

async function liPost<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(`${LIFI_BASE}${path}`);
  const resp = await fetch(url.toString(), {
    method:  "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LI.FI ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

/** Resolve a LI.FI chain key (e.g. "eth") to its numeric chain ID. */
function chainKeyToId(key: string): number {
  const entry = Object.values(LIFI_CHAINS).find(c => c.key === key.toLowerCase());
  return entry?.id ?? 1;
}

// ── Chains cache ──────────────────────────────────────────────────────────────

let chainsCache: { data: unknown[]; ts: number } | null = null;
const CHAINS_TTL = 24 * 60 * 60 * 1000;

export async function getLifiChains(): Promise<unknown[]> {
  if (chainsCache && Date.now() - chainsCache.ts < CHAINS_TTL) return chainsCache.data;
  try {
    const d = await liGet<{ chains: unknown[] }>("/chains");
    chainsCache = { data: d.chains ?? [], ts: Date.now() };
    return chainsCache.data;
  } catch (err: any) {
    logger.warn({ err: err.message }, "lifi: getLifiChains failed");
    return chainsCache?.data ?? [];
  }
}

// ── Tokens cache ──────────────────────────────────────────────────────────────

const tokensCache = new Map<string, { data: unknown[]; ts: number }>();
const TOKENS_TTL = 60 * 60 * 1000;

export async function getLifiTokensByChain(chainKey: string): Promise<unknown[]> {
  const entry = tokensCache.get(chainKey);
  if (entry && Date.now() - entry.ts < TOKENS_TTL) return entry.data;
  try {
    const d = await liGet<{ tokens: Record<string, unknown[]> }>("/tokens", { chains: chainKey });
    const tokens = Object.values(d.tokens ?? {})[0] ?? [];
    tokensCache.set(chainKey, { data: tokens as unknown[], ts: Date.now() });
    return tokens as unknown[];
  } catch (err: any) {
    logger.warn({ err: err.message, chainKey }, "lifi: getLifiTokensByChain failed");
    return entry?.data ?? [];
  }
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface LifiQuoteParams {
  fromSymbol:    string;
  toSymbol:      string;
  fromAmount:    number;           // human-readable (e.g. 1.5 ETH)
  fromAddress:   string;           // user's wallet address (required for tx generation)
  fromChain?:    string;           // override: LI.FI chain key (e.g. "eth")
  toChain?:      string;           // override: LI.FI chain key
  slippage?:     number;           // 0–1, default 0.005
  allowBridges?: string[];
  denyBridges?:  string[];
}

export interface LifiQuote {
  id:             string;
  tool:           string;          // winning bridge/DEX name
  toolDetails:    { name: string; logoURI?: string };
  fromChain:      string;
  toChain:        string;
  fromSymbol:     string;
  toSymbol:       string;
  fromAmount:     number;          // human-readable
  toAmount:       number;          // human-readable
  toAmountMin:    number;          // after slippage
  gasCostUsd:     number;
  feeCostUsd:     number;
  executionTime:  number;          // seconds estimate
  steps:          number;
  transactionRequest: {
    to:       string;
    data:     string;
    value:    string;
    gasLimit: string;
    chainId:  number;
    from:     string;
  };
  approvalAddress: string;        // user must approve this address to spend fromToken
  transactionId:   string;
}

export async function getLifiQuote(params: LifiQuoteParams): Promise<LifiQuote | null> {
  const { fromSymbol, toSymbol, fromAmount, fromAddress, slippage = 0.005 } = params;

  const fromToken = resolveLifiToken(fromSymbol, params.fromChain);
  const toToken   = resolveLifiToken(toSymbol,   params.toChain);

  if (!fromToken) {
    logger.debug({ fromSymbol }, "lifi: no token info for fromSymbol");
    return null;
  }
  if (!toToken) {
    logger.debug({ toSymbol }, "lifi: no token info for toSymbol");
    return null;
  }

  const fromAmountRaw = toTokenUnits(fromAmount, fromToken.decimals);
  // LI.FI rejects 0x000...0 for native tokens — use the symbol instead
  const fromTokenId = fromToken.address === ZERO ? fromToken.symbol : fromToken.address;
  const toTokenId   = toToken.address   === ZERO ? toToken.symbol   : toToken.address;

  try {
    const raw = await liGet<any>("/quote", {
      fromChain:   params.fromChain ?? fromToken.chain,
      toChain:     params.toChain   ?? toToken.chain,
      fromToken:   fromTokenId,
      toToken:     toTokenId,
      fromAmount:  fromAmountRaw,
      fromAddress: safeAddr(fromAddress),
      slippage:    String(slippage),
      ...(params.allowBridges ? { allowBridges: params.allowBridges.join(",") } : {}),
      ...(params.denyBridges  ? { denyBridges:  params.denyBridges.join(",")  } : {}),
    });

    if (raw.errors || raw.message) {
      logger.debug({ err: raw.message ?? raw.errors, fromSymbol, toSymbol }, "lifi: quote error");
      return null;
    }

    const est       = raw.estimate ?? {};
    const toAmtRaw  = String(est.toAmount      ?? "0");
    const toMinRaw  = String(est.toAmountMin   ?? toAmtRaw);
    const gasCosts  = (est.gasCosts  ?? []) as any[];
    const feeCosts  = (est.feeCosts  ?? []) as any[];
    const gasCostUsd  = gasCosts.reduce((s: number, g: any)  => s + parseFloat(g.amountUSD  ?? "0"), 0);
    const feeCostUsd  = feeCosts.reduce((s: number, f: any)  => s + parseFloat(f.amountUSD  ?? "0"), 0);
    const execTime    = parseInt(String(est.executionDuration ?? "60"), 10);
    const steps       = (raw.includedSteps ?? []).length as number;
    const txReq       = raw.transactionRequest ?? {};
    const approvalAddr = est.approvalAddress ?? txReq.to ?? "";

    return {
      id:              String(raw.id           ?? ""),
      tool:            String(raw.tool         ?? ""),
      toolDetails:     raw.toolDetails         ?? { name: raw.tool ?? "" },
      fromChain:       fromToken.chain,
      toChain:         toToken.chain,
      fromSymbol,
      toSymbol,
      fromAmount,
      toAmount:        fromTokenUnits(toAmtRaw, toToken.decimals),
      toAmountMin:     fromTokenUnits(toMinRaw, toToken.decimals),
      gasCostUsd,
      feeCostUsd,
      executionTime:   execTime,
      steps,
      transactionRequest: {
        to:       String(txReq.to       ?? ""),
        data:     String(txReq.data     ?? ""),
        value:    String(txReq.value    ?? "0"),
        gasLimit: String(txReq.gasLimit ?? "0"),
        chainId:  Number(txReq.chainId  ?? 1),
        from:     String(txReq.from     ?? fromAddress),
      },
      approvalAddress: approvalAddr,
      transactionId:   String(raw.id ?? ""),
    };
  } catch (err: any) {
    logger.warn({ err: err.message, fromSymbol, toSymbol }, "lifi: getLifiQuote failed");
    return null;
  }
}

// ── Multiple routes ───────────────────────────────────────────────────────────

export interface LifiRoutesParams extends Omit<LifiQuoteParams, "fromAddress"> {
  fromAddress?: string;
  maxRoutes?:   number;
}

export async function getLifiRoutes(params: LifiRoutesParams): Promise<LifiQuote[]> {
  const { fromSymbol, toSymbol, fromAmount, slippage = 0.005, maxRoutes = 5 } = params;

  const fromToken = resolveLifiToken(fromSymbol, params.fromChain);
  const toToken   = resolveLifiToken(toSymbol,   params.toChain);

  if (!fromToken || !toToken) return [];

  const fromAmountRaw = toTokenUnits(fromAmount, fromToken.decimals);
  const fromTokenId = fromToken.address === ZERO ? fromToken.symbol : fromToken.address;
  const toTokenId   = toToken.address   === ZERO ? toToken.symbol   : toToken.address;
  const fromChainKey = params.fromChain ?? fromToken.chain;
  const toChainKey   = params.toChain   ?? toToken.chain;

  try {
    const raw = await liPost<any>("/advanced/routes", {
      fromChainId:       chainKeyToId(fromChainKey),
      toChainId:         chainKeyToId(toChainKey),
      fromTokenAddress:  fromTokenId,
      toTokenAddress:    toTokenId,
      fromAmount:        fromAmountRaw,
      fromAddress:       safeAddr(params.fromAddress),
      options: {
        slippage,
        order:      "RECOMMENDED",
        integrator: INTEGRATOR,
      },
    });

    const routes = (raw.routes ?? []).slice(0, maxRoutes) as any[];
    return routes.map((r: any): LifiQuote => {
      const firstStep  = (r.steps ?? [])[0] ?? {};
      const est        = firstStep.estimate ?? {};
      const toAmtRaw   = String(r.toAmount ?? est.toAmount ?? "0");
      const gasCostUsd = parseFloat(String(r.gasCostUSD ?? "0"));
      return {
        id:           String(r.id ?? ""),
        tool:         String(firstStep.tool ?? ""),
        toolDetails:  firstStep.toolDetails ?? { name: firstStep.tool ?? "" },
        fromChain:    fromChainKey,
        toChain:      toChainKey,
        fromSymbol,
        toSymbol,
        fromAmount,
        toAmount:     fromTokenUnits(toAmtRaw, toToken.decimals),
        toAmountMin:  fromTokenUnits(String(r.toAmountMin ?? toAmtRaw), toToken.decimals),
        gasCostUsd,
        feeCostUsd:   0,
        executionTime: parseInt(String(est.executionDuration ?? "60"), 10),
        steps:        (r.steps ?? []).length as number,
        transactionRequest: { to: "", data: "", value: "0", gasLimit: "0", chainId: chainKeyToId(fromChainKey), from: "" },
        approvalAddress: "",
        transactionId:   String(r.id ?? ""),
      };
    });
  } catch (err: any) {
    logger.warn({ err: err.message, fromSymbol, toSymbol }, "lifi: getLifiRoutes failed");
    return [];
  }
}

// ── Transaction status ────────────────────────────────────────────────────────

export interface LifiTxStatus {
  transactionId: string;
  status:        "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?:    string;
  substatusMessage?: string;
  sending?:      { txHash: string; chainId: number };
  receiving?:    { txHash: string; chainId: number; amount?: string };
}

export async function getLifiTxStatus(txHash: string, fromChainId: number): Promise<LifiTxStatus | null> {
  try {
    const d = await liGet<any>("/status", {
      txHash,
      fromChain: String(fromChainId),
    });
    return {
      transactionId:    d.transactionId ?? txHash,
      status:           d.status         ?? "NOT_FOUND",
      substatus:        d.substatus,
      substatusMessage: d.substatusMessage,
      sending:          d.sending   ? { txHash: d.sending.txHash,   chainId: d.sending.chainId   } : undefined,
      receiving:        d.receiving ? { txHash: d.receiving.txHash, chainId: d.receiving.chainId,
                                        amount: d.receiving.amount } : undefined,
    };
  } catch (err: any) {
    logger.warn({ err: err.message, txHash }, "lifi: getLifiTxStatus failed");
    return null;
  }
}

// ── Convenience: get just the output amount for metaRouter comparison ─────────

export async function getLifiOutputAmount(
  fromSymbol: string,
  toSymbol:   string,
  amount:     number,
): Promise<{ toAmount: number; gasCostUsd: number; tool: string } | null> {
  try {
    const quote = await getLifiQuote({
      fromSymbol,
      toSymbol,
      fromAmount:  amount,
      fromAddress: PLACEHOLDER_ADDRESS,
    });
    if (!quote || quote.toAmount <= 0) return null;
    return { toAmount: quote.toAmount, gasCostUsd: quote.gasCostUsd, tool: quote.tool };
  } catch {
    return null;
  }
}
