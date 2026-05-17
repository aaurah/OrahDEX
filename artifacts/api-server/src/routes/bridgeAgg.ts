/**
 * /api/bridge-agg — Rabby-style bridge quote aggregator
 *
 * POST /api/bridge-agg/quote     — fan-out to all providers, score & return
 * POST /api/bridge-agg/build-tx  — build tx payload for wallet to sign
 * GET  /api/bridge-agg/chains    — supported chains
 * GET  /api/bridge-agg/tokens    — tokens per chain
 */

import { Router, type Request, type Response } from "express";
import { getQuotesAcrossProviders, getProvider } from "../services/quoteAggregator.js";
import type { BridgeQuoteParams, BuildTxParams } from "../bridges/IBridgeProvider.js";

const router = Router();

// ── Supported chains ──────────────────────────────────────────────────────────

export const BRIDGE_CHAINS = [
  { id: 1,     name: "Ethereum",  nativeSymbol: "ETH",  color: "#627EEA", logo: "ETH"  },
  { id: 8453,  name: "Base",      nativeSymbol: "ETH",  color: "#0052FF", logo: "ETH"  },
  { id: 42161, name: "Arbitrum",  nativeSymbol: "ETH",  color: "#28A0F0", logo: "ETH"  },
  { id: 10,    name: "Optimism",  nativeSymbol: "ETH",  color: "#FF0420", logo: "ETH"  },
  { id: 137,   name: "Polygon",   nativeSymbol: "POL",  color: "#8247E5", logo: "MATIC"},
  { id: 56,    name: "BNB Chain", nativeSymbol: "BNB",  color: "#F0B90B", logo: "BNB"  },
  { id: 43114, name: "Avalanche", nativeSymbol: "AVAX", color: "#E84142", logo: "AVAX" },
];

// ── Supported tokens per chain ────────────────────────────────────────────────

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const BRIDGE_TOKENS: Record<number, { symbol: string; name: string; address: string; decimals: number; isNative?: boolean }[]> = {
  1: [
    { symbol: "ETH",  name: "Ethereum",   address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped BTC",address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    { symbol: "DAI",  name: "Dai",        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18},
  ],
  8453: [
    { symbol: "ETH",  name: "Ethereum",   address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
  ],
  42161: [
    { symbol: "ETH",  name: "Ethereum",   address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped BTC",address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
  ],
  10: [
    { symbol: "ETH",  name: "Ethereum",   address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
  ],
  137: [
    { symbol: "POL",  name: "Polygon",    address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped BTC",address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
  ],
  56: [
    { symbol: "BNB",  name: "BNB",        address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDT", name: "Tether",     address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18},
    { symbol: "USDC", name: "USD Coin",   address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18},
  ],
  43114: [
    { symbol: "AVAX", name: "Avalanche",  address: NATIVE,                                     decimals: 18, isNative: true },
    { symbol: "USDC", name: "USD Coin",   address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    { symbol: "USDT", name: "Tether",     address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toWei(amount: string, decimals: number): string {
  try {
    const parts = amount.split(".");
    const whole = parts[0] ?? "0";
    const frac  = (parts[1] ?? "").padEnd(decimals, "0").slice(0, decimals);
    return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0")).toString();
  } catch { return "0"; }
}

function fromWei(wei: string, decimals: number): string {
  try {
    const n = BigInt(wei);
    const d = 10n ** BigInt(decimals);
    const whole = (n / d).toString();
    let frac = (n % d).toString().padStart(decimals, "0");
    frac = frac.replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
  } catch { return "0"; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/chains", (_req: Request, res: Response) => {
  res.json({ chains: BRIDGE_CHAINS });
});

router.get("/tokens/:chainId", (req: Request, res: Response) => {
  const chainId = parseInt(req.params.chainId, 10);
  const tokens = BRIDGE_TOKENS[chainId] ?? [];
  res.json({ tokens });
});

router.post("/quote", async (req: Request, res: Response) => {
  const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, amountIn } = req.body as {
    fromChainId?: number; toChainId?: number;
    fromTokenAddress?: string; toTokenAddress?: string;
    amountIn?: string;
  };

  if (!fromChainId || !toChainId || !fromTokenAddress || !toTokenAddress || !amountIn) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (fromChainId === toChainId) {
    res.status(400).json({ error: "Source and destination chains must differ" });
    return;
  }

  // Find token decimals for human→wei conversion
  const fromToken = BRIDGE_TOKENS[fromChainId]?.find(t => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
  const toToken   = BRIDGE_TOKENS[toChainId]?.find(t => t.address.toLowerCase() === toTokenAddress.toLowerCase());
  const decimals  = fromToken?.decimals ?? 18;
  const toDecimals = toToken?.decimals ?? 18;

  const amountInWei = amountIn.includes(".")
    ? toWei(amountIn, decimals)
    : amountIn;

  const params: BridgeQuoteParams = { fromChainId, toChainId, fromTokenAddress, toTokenAddress, amountIn: amountInWei };
  const { quotes, bestQuote } = await getQuotesAcrossProviders(params);

  // Annotate with human-readable amounts
  const readable = quotes.map(q => ({
    ...q,
    amountInHuman:  fromWei(q.amountIn, decimals),
    amountOutHuman: fromWei(q.amountOut, toDecimals),
    feeHuman:       fromWei(q.fee, decimals),
  }));

  res.json({
    quotes: readable,
    bestQuote: bestQuote ? { ...bestQuote, amountInHuman: fromWei(bestQuote.amountIn, decimals), amountOutHuman: fromWei(bestQuote.amountOut, toDecimals), feeHuman: fromWei(bestQuote.fee, decimals) } : null,
  });
});

router.post("/build-tx", async (req: Request, res: Response) => {
  const { providerId, fromChainId, toChainId, fromTokenAddress, toTokenAddress, amountIn, userAddress, quote } = req.body as {
    providerId?: string; fromChainId?: number; toChainId?: number;
    fromTokenAddress?: string; toTokenAddress?: string;
    amountIn?: string; userAddress?: string; quote?: unknown;
  };

  if (!providerId || !fromChainId || !toChainId || !fromTokenAddress || !toTokenAddress || !amountIn || !userAddress || !quote) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const provider = getProvider(providerId);
  if (!provider) {
    res.status(404).json({ error: `Unknown provider: ${providerId}` });
    return;
  }

  const fromToken = BRIDGE_TOKENS[fromChainId]?.find(t => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
  const decimals  = fromToken?.decimals ?? 18;
  const amountInWei = amountIn.includes(".") ? toWei(amountIn, decimals) : amountIn;

  const params: BuildTxParams = {
    fromChainId, toChainId, fromTokenAddress, toTokenAddress,
    amountIn: amountInWei, userAddress,
    quote: quote as import("../bridges/IBridgeProvider.js").BridgeQuote,
  };

  const tx = await provider.buildTx(params);
  res.json({ tx, warning: "This is a mock transaction — do not sign on mainnet." });
});

export default router;
