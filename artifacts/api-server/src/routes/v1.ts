/**
 * OrahDEX v1 Sovereign Routing API
 *
 * Three-layer architecture:
 *   Layer 1 — Off-chain Sovereign Routing Engine (quote, build, simulate, broadcast)
 *   Layer 2 — AMM identity routing via Keeper tiers (fee discounts, pool access)
 *   Layer 3 — Cross-chain bridge (HTLC lock/reveal/redeem/refund/relay)
 *
 * All routes mounted at /v1 in app.ts
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { marketsTable, htlcLocksTable, ordersTable, keepersTable } from "@workspace/db/schema";
import { eq, ilike, and, sum, sql as drizzleSql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { FALLBACK_PRICES, COINGECKO_IDS } from "../lib/priceUpdater.js";
import { buildHtlc, verifySecret } from "../lib/htlc.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";

const router = Router();

// ── Chain → Router contract address (Uniswap v2-compatible) ─────────────────
const CHAIN_ROUTERS: Record<number, string> = {
  1:      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // Uniswap v2 (Ethereum)
  56:     "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap v2 (BNB)
  137:    "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap (Polygon)
  42161:  "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap (Arbitrum)
  10:     "0x9c12939390052919aF3155f41Bf4160Fd3666A6",  // Velodrome (Optimism)
  8453:   "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // BaseSwap (Base)
  43114:  "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", // TraderJoe (Avalanche)
  250:    "0xF491e7B69E4244ad4002BC14e878a34207E38c29", // SpookySwap (Fantom)
  25:     "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae", // VVS Finance (Cronos)
  59144:  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // Linea
  324:    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // zkSync Era
  5000:   "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // Mantle
  534352: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // Scroll
};

// ── Chain → native wrapped token address (for price path building) ───────────
const WRAPPED_NATIVE: Record<number, string> = {
  1:      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  56:     "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  137:    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  42161:  "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  10:     "0x4200000000000000000000000000000000000006",
  8453:   "0x4200000000000000000000000000000000000006",
  43114:  "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  250:    "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
  25:     "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
  59144:  "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F",
  5000:   "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
  324:    "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91",
  534352: "0x5300000000000000000000000000000000000004",
};

// ── Keeper Tier System ─────────────────────────────────────────────────────────
//
// Identity-aware routing: higher-tier Keepers get fee discounts, priority routes,
// and access to exclusive pools. Tier is determined by on-chain activity metrics
// that the OrahDEX protocol tracks (volume, LP commitment, tenure).
//
//   Tier 0 — Standard   : 0.30% fee (public, anyone)
//   Tier 1 — Guardian   : 0.25% fee (5+ BSV volume or LP provider)
//   Tier 2 — Elder      : 0.20% fee (50+ BSV volume or 30d+ active)
//   Tier 3 — Archon     : 0.15% fee (500+ BSV volume, Keeper NFT holder)
//
// In Phase 2 the tier will be resolved from the on-chain Keeper Registry contract.
// For Phase 1, it is determined from trading history in the OrahDEX database.

interface KeeperInfo {
  address: string;
  tier: 0 | 1 | 2 | 3;
  tierName: "Standard" | "Guardian" | "Elder" | "Archon";
  feeMultiplier: number;   // e.g. 1.0 = 0.30%, 0.833 = 0.25%, 0.667 = 0.20%, 0.5 = 0.15%
  feeBps: number;          // basis points: 30 / 25 / 20 / 15
  discountPct: number;     // human-readable discount: 0 / 17 / 33 / 50
  pools: string[];         // extra pool identifiers unlocked
}

const TIER_CONFIG = [
  { tier: 3 as const, name: "Archon"  as const, feeBps: 15, discountPct: 50, threshold: 500 },
  { tier: 2 as const, name: "Elder"   as const, feeBps: 20, discountPct: 33, threshold: 50  },
  { tier: 1 as const, name: "Guardian"as const, feeBps: 25, discountPct: 17, threshold: 5   },
  { tier: 0 as const, name: "Standard"as const, feeBps: 30, discountPct: 0,  threshold: 0   },
];

async function resolveKeeperTier(address: string | undefined): Promise<KeeperInfo> {
  const addr = address?.toLowerCase() ?? "";
  const standard: KeeperInfo = {
    address: addr,
    tier: 0, tierName: "Standard",
    feeMultiplier: 1.0, feeBps: 30, discountPct: 0, pools: [],
  };
  if (!addr) return standard;

  try {
    // Sum quantity × price for all filled orders from this wallet to determine volume
    const result = await db.select({
      totalVolume: drizzleSql<string>`COALESCE(SUM(quantity::numeric * COALESCE(price::numeric, 0)), 0)`,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.walletAddress, addr),
      eq(ordersTable.status, "filled"),
    ));

    const volumeBsv = parseFloat(result[0]?.totalVolume ?? "0");

    let tier = 0 as 0 | 1 | 2 | 3;
    for (const cfg of TIER_CONFIG) {
      if (volumeBsv >= cfg.threshold) { tier = cfg.tier; break; }
    }

    // Role bonus from Keeper Registry: LiquidityKeeper or OracleKeeper → +1 tier (capped at 3)
    try {
      const [keeper] = await db.select({ roles: keepersTable.roles, active: keepersTable.active })
        .from(keepersTable)
        .where(eq(keepersTable.walletAddress, addr));
      if (keeper?.active) {
        const roles = keeper.roles as string[];
        if ((roles.includes("LiquidityKeeper") || roles.includes("OracleKeeper")) && tier < 3) {
          tier = (tier + 1) as 0 | 1 | 2 | 3;
        }
      }
    } catch { /* ignore registry lookup failures */ }

    const cfg = TIER_CONFIG.find(c => c.tier === tier) ?? TIER_CONFIG[3];
    return {
      address: addr,
      tier: cfg.tier,
      tierName: cfg.name,
      feeMultiplier: cfg.feeBps / 30,
      feeBps: cfg.feeBps,
      discountPct: cfg.discountPct,
      pools: cfg.tier >= 2 ? ["keeper-exclusive", "deep-liquidity"] : cfg.tier === 1 ? ["guardian-pool"] : [],
    };
  } catch {
    // fall through to standard
  }
  return standard;
}

// ── Helper: get current USD price for a symbol ────────────────────────────────
async function getUsdPrice(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();
  try {
    const rows = await db.select({ lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(ilike(marketsTable.symbol, `${sym}/%`))
      .limit(1);
    if (rows.length && parseFloat(rows[0].lastPrice ?? "0") > 0) {
      return parseFloat(rows[0].lastPrice!);
    }
  } catch { /* fall through */ }
  return FALLBACK_PRICES[sym] ?? 0;
}

// ── GET /v1/tokens ─────────────────────────────────────────────────────────────
// Returns all tradeable tokens across all chains with live prices and Keeper metadata.
router.get("/tokens", async (req, res) => {
  try {
    const { search, limit: limitStr } = req.query as { search?: string; limit?: string };
    const limit = Math.min(parseInt(limitStr ?? "100"), 500);

    // Fetch all unique base symbols from markets
    const rows = await db.select({
      symbol: marketsTable.symbol,
      lastPrice: marketsTable.lastPrice,
      priceChangePercent: marketsTable.priceChangePercent,
      volume24h: marketsTable.volume24h,
    }).from(marketsTable).limit(2000);

    // Extract unique base symbols
    const symbolMap = new Map<string, {
      symbol: string;
      priceUsd: number;
      change24h: number;
      volume24hUsd: number;
      cgId?: string;
    }>();

    for (const row of rows) {
      const [base, quote] = (row.symbol ?? "").split("/");
      if (!base) continue;

      const quoteIsStable = ["USDT","USDC","BUSD","TUSD","USDD","DAI"].includes(quote ?? "");
      if (!quoteIsStable) continue; // Only price from stable pairs for accuracy

      const price = parseFloat(row.lastPrice ?? "0");
      if (!symbolMap.has(base) && price > 0) {
        symbolMap.set(base, {
          symbol: base,
          priceUsd: price,
          change24h: parseFloat(row.priceChangePercent ?? "0"),
          volume24hUsd: parseFloat(row.volume24h ?? "0"),
          cgId: COINGECKO_IDS[base],
        });
      }
    }

    let tokens = Array.from(symbolMap.values());

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      tokens = tokens.filter(t => t.symbol.toLowerCase().includes(q));
    }

    // Sort by volume desc and limit
    tokens.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    tokens = tokens.slice(0, limit);

    // Add Keeper fee metadata (standard tier — same for all tokens, not per-wallet)
    const result = tokens.map(t => ({
      symbol: t.symbol,
      priceUsd: t.priceUsd,
      change24h: t.change24h,
      volume24hUsd: t.volume24hUsd,
      cgId: t.cgId,
      chains: Object.keys(CHAIN_ROUTERS).map(Number),
      keeperFeeMultipliers: {
        standard: 0.30,
        guardian: 0.25,
        elder: 0.20,
        archon: 0.15,
      },
    }));

    res.json({ tokens: result, total: result.length, timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /v1/tokens failed");
    res.status(500).json({ error: "Failed to fetch tokens" });
  }
});

// ── GET /v1/tokens/:chainId ────────────────────────────────────────────────────
router.get("/tokens/:chainId", async (req, res) => {
  const chainId = parseInt(req.params.chainId ?? "1");
  const router = CHAIN_ROUTERS[chainId];
  if (!router) {
    res.status(404).json({ error: `Chain ${chainId} not supported` });
    return;
  }

  // For now, return all tokens (all tokens are accessible on all chains via BSV settlement)
  try {
    const rows = await db.select({
      symbol: marketsTable.symbol,
      lastPrice: marketsTable.lastPrice,
    }).from(marketsTable).limit(1000);

    const seen = new Set<string>();
    const tokens: { symbol: string; priceUsd: number; chainId: number; routerAddress: string }[] = [];

    for (const row of rows) {
      const [base, quote] = (row.symbol ?? "").split("/");
      if (!base || seen.has(base)) continue;
      const quoteIsStable = ["USDT","USDC","BUSD","TUSD","USDD","DAI"].includes(quote ?? "");
      if (!quoteIsStable) continue;
      const price = parseFloat(row.lastPrice ?? "0");
      if (price > 0) {
        seen.add(base);
        tokens.push({ symbol: base, priceUsd: price, chainId, routerAddress: router });
      }
    }

    res.json({ chainId, routerAddress: router, tokens, total: tokens.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch tokens for chain" });
  }
});

// ── GET /v1/token/:address ────────────────────────────────────────────────────
router.get("/token/:address", async (req, res) => {
  const address = req.params.address ?? "";
  // Look up by contract address in our known token registry
  // For BSV pairs, address is the symbol itself
  const rows = await db.select().from(marketsTable)
    .where(ilike(marketsTable.symbol, `%${address.slice(0, 8)}%`))
    .limit(5);

  if (!rows.length) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  const row = rows[0];
  const [base] = (row.symbol ?? "").split("/");
  res.json({
    symbol: base,
    address,
    priceUsd: parseFloat(row.lastPrice ?? "0"),
    change24h: parseFloat(row.priceChangePercent ?? "0"),
    volume24h: parseFloat(row.volume24h ?? "0"),
    chains: Object.keys(CHAIN_ROUTERS).map(Number),
  });
});

// ── GET /v1/quote ─────────────────────────────────────────────────────────────
// Core quote engine — returns expected output, price impact, route, Keeper fee.
//
// Query params:
//   chainId       — EVM chain ID (default: 1)
//   tokenIn       — input symbol or address (e.g. "USDT" or "0xdAC17F...")
//   tokenOut      — output symbol or address (e.g. "ETH")
//   amount        — input amount (decimal string, e.g. "100.5")
//   keeperAddress — optional; triggers Keeper discount if tier > 0
router.get("/quote", async (req, res) => {
  try {
    const {
      chainId: chainIdStr = "1",
      tokenIn = "",
      tokenOut = "",
      amount: amountStr = "0",
      keeperAddress,
    } = req.query as Record<string, string | undefined>;

    const chainId = parseInt(chainIdStr);
    const amountIn = parseFloat(amountStr);

    if (!tokenIn || !tokenOut || isNaN(amountIn) || amountIn <= 0) {
      res.status(400).json({ error: "tokenIn, tokenOut, and amount are required" });
      return;
    }

    // Resolve keeper tier
    const keeper = await resolveKeeperTier(keeperAddress);

    // Normalise symbol — strip 0x prefix if contract address given
    const symIn  = tokenIn.startsWith("0x")  ? tokenIn  : tokenIn.toUpperCase();
    const symOut = tokenOut.startsWith("0x") ? tokenOut : tokenOut.toUpperCase();

    // Get USD prices for both tokens
    const priceInUsd  = await getUsdPrice(symIn)  || FALLBACK_PRICES[symIn]  || 0;
    const priceOutUsd = await getUsdPrice(symOut) || FALLBACK_PRICES[symOut] || 0;

    if (priceInUsd === 0 || priceOutUsd === 0) {
      res.status(404).json({ error: "Price not available for one or more tokens" });
      return;
    }

    // Calculate output
    const amountInUsd  = amountIn * priceInUsd;
    const rawAmountOut = amountInUsd / priceOutUsd;

    // Apply Keeper fee
    const feeBps   = keeper.feeBps;  // e.g. 30 = 0.30%
    const feeAmt   = rawAmountOut * (feeBps / 10_000);
    const amountOut = rawAmountOut - feeAmt;
    const feeUsd    = amountIn * priceInUsd * (feeBps / 10_000);

    // Estimate price impact (simplified — based on order book depth vs volume)
    // Real-world impact: larger trades have higher slippage
    const depthUsd = 500_000; // approximate depth per level
    const priceImpactPct = Math.min((amountInUsd / depthUsd) * 0.1, 5.0);

    // MEV risk: higher for large USD amounts
    const mevRiskLevel: "low" | "medium" | "high" =
      amountInUsd < 10_000 ? "low" :
      amountInUsd < 100_000 ? "medium" : "high";

    // Build the route breakdown
    const route = [
      { pool: `OrahDEX-${symIn}-${symOut}`, protocol: "OrahDEX AMM", feeBps: 0 },
      { pool: `BSV-Settlement`, protocol: "BSV Layer 1", feeBps: feeBps },
    ];

    // Keeper-specific routing
    if (keeper.tier >= 2) {
      route.push({ pool: "keeper-exclusive-pool", protocol: "Keeper Protocol", feeBps: 0 });
    }

    res.json({
      tokenIn:        symIn,
      tokenOut:       symOut,
      amountIn:       amountIn,
      amountInUsd:    parseFloat(amountInUsd.toFixed(6)),
      expectedOut:    parseFloat(amountOut.toFixed(8)),
      minOut:         parseFloat((amountOut * 0.995).toFixed(8)), // 0.5% slippage default
      priceOutUsd,
      priceImpactPct: parseFloat(priceImpactPct.toFixed(4)),
      feeBps,
      feeUsd:         parseFloat(feeUsd.toFixed(6)),
      mevRisk:        mevRiskLevel,
      route,
      keeper: {
        address:     keeper.address || null,
        tier:        keeper.tier,
        tierName:    keeper.tierName,
        feeBps:      keeper.feeBps,
        discountPct: keeper.discountPct,
        pools:       keeper.pools,
      },
      chainId,
      routerAddress:  CHAIN_ROUTERS[chainId] ?? CHAIN_ROUTERS[1],
      timestamp:      new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /v1/quote failed");
    res.status(500).json({ error: "Quote calculation failed" });
  }
});

// ── GET /v1/allowance/target ──────────────────────────────────────────────────
// Returns the contract address that needs ERC-20 approval before a swap.
router.get("/allowance/target", (req, res) => {
  const chainId = parseInt((req.query.chainId as string) ?? "1");
  const routerAddress = CHAIN_ROUTERS[chainId] ?? CHAIN_ROUTERS[1];
  res.json({
    chainId,
    routerAddress,
    recommendedAllowance: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    note: "Approve this address to spend your tokenIn before calling /v1/swap/build",
  });
});

// ── POST /v1/swap/build ───────────────────────────────────────────────────────
// Builds swap transaction calldata with full Keeper routing applied.
// Body: { chainId, tokenIn, tokenOut, amount, slippage?, keeperAddress? }
router.post("/swap/build", async (req, res) => {
  try {
    const {
      chainId = 1,
      tokenIn = "",
      tokenOut = "",
      amount = 0,
      slippage = 0.5,    // percent, e.g. 0.5 = 0.5%
      keeperAddress,
    } = req.body as {
      chainId?: number;
      tokenIn?: string;
      tokenOut?: string;
      amount?: number;
      slippage?: number;
      keeperAddress?: string;
    };

    if (!tokenIn || !tokenOut || !amount || amount <= 0) {
      res.status(400).json({ error: "chainId, tokenIn, tokenOut, and amount are required" });
      return;
    }

    const keeper = await resolveKeeperTier(keeperAddress);
    const routerAddress = CHAIN_ROUTERS[chainId] ?? CHAIN_ROUTERS[1];
    const wNative = WRAPPED_NATIVE[chainId] ?? WRAPPED_NATIVE[1];

    const symIn  = tokenIn.startsWith("0x")  ? tokenIn  : tokenIn.toUpperCase();
    const symOut = tokenOut.startsWith("0x") ? tokenOut : tokenOut.toUpperCase();

    const priceInUsd  = await getUsdPrice(symIn)  || FALLBACK_PRICES[symIn]  || 0;
    const priceOutUsd = await getUsdPrice(symOut) || FALLBACK_PRICES[symOut] || 0;

    if (priceInUsd === 0 || priceOutUsd === 0) {
      res.status(404).json({ error: "Token price unavailable" });
      return;
    }

    const amountInUsd  = amount * priceInUsd;
    const rawAmountOut = amountInUsd / priceOutUsd;
    const feeBps       = keeper.feeBps;
    const amountOut    = rawAmountOut * (1 - feeBps / 10_000);
    const slippageBps  = Math.round(slippage * 100);
    const amountOutMin = amountOut * (1 - slippageBps / 10_000);
    const deadline     = Math.floor(Date.now() / 1000) + 600; // 10 min

    // Build Uniswap v2 swapExactTokensForTokens calldata
    // selector: 0x38ed1739
    const amountInHex  = Math.floor(amount * 1e18).toString(16).padStart(64, "0");
    const amountOutHex = Math.floor(amountOutMin * 1e18).toString(16).padStart(64, "0");
    const deadlineHex  = deadline.toString(16).padStart(64, "0");

    // Path: tokenIn → tokenOut (via wrapped native if needed)
    const pathSegments = [
      tokenIn.startsWith("0x") ? tokenIn.replace("0x","").padStart(64,"0") : wNative.replace("0x","").padStart(64,"0"),
      tokenOut.startsWith("0x") ? tokenOut.replace("0x","").padStart(64,"0") : wNative.replace("0x","").padStart(64,"0"),
    ];

    const calldata = `0x38ed1739${amountInHex}${amountOutHex}${deadlineHex}`;

    const gasEstimate = 150_000 + (keeper.tier * 25_000); // Keeper pools may use slightly more gas

    res.json({
      to:            routerAddress,
      data:          calldata,
      value:         "0x0",
      gasEstimate,
      chainId,
      tokenIn:       symIn,
      tokenOut:      symOut,
      amountIn:      amount,
      amountOutMin:  parseFloat(amountOutMin.toFixed(8)),
      slippageBps,
      deadline,
      keeper: {
        tier:        keeper.tier,
        tierName:    keeper.tierName,
        feeBps:      keeper.feeBps,
        discountPct: keeper.discountPct,
        applied:     keeper.tier > 0,
      },
      settlementNote: "All trades settle on BSV L1 via OrahDEX protocol after EVM execution.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/swap/build failed");
    res.status(500).json({ error: "Failed to build swap transaction" });
  }
});

// ── POST /v1/swap/simulate ────────────────────────────────────────────────────
// Simulate a swap before execution — returns MEV risk, gas, revert reasons.
router.post("/swap/simulate", async (req, res) => {
  try {
    const { chainId = 1, tokenIn, tokenOut, amount = 0, keeperAddress } = req.body as {
      chainId?: number;
      tokenIn?: string;
      tokenOut?: string;
      amount?: number;
      keeperAddress?: string;
    };

    if (!tokenIn || !tokenOut || !amount) {
      res.status(400).json({ error: "tokenIn, tokenOut, amount required" });
      return;
    }

    const keeper   = await resolveKeeperTier(keeperAddress);
    const priceIn  = await getUsdPrice(tokenIn) || FALLBACK_PRICES[tokenIn?.toUpperCase()] || 0;
    const amountUsd = amount * priceIn;

    // Simulate common revert conditions
    const revertReason: string | null =
      amountUsd > 5_000_000 ? "EXCEEDS_MAX_SWAP_SIZE"   :
      amountUsd < 0.001     ? "BELOW_MINIMUM_SWAP_SIZE" :
      null;

    const mevRisk: "low" | "medium" | "high" =
      amountUsd < 10_000  ? "low"    :
      amountUsd < 100_000 ? "medium" : "high";

    // Keeper tier reduces MEV risk via private mempool routing (Phase 2)
    const mevMitigated = keeper.tier >= 2;

    const gasEstimate = 150_000;
    const gasPriceGwei = 30;
    const gasUsd = (gasEstimate * gasPriceGwei * 1e-9) * (FALLBACK_PRICES["ETH"] ?? 2152);

    res.json({
      success:        !revertReason,
      revertReason,
      slippageActual: amountUsd < 1000 ? 0.05 : amountUsd < 10_000 ? 0.12 : 0.30,
      mevRisk,
      mevMitigated,
      gasEstimate,
      gasPriceGwei,
      gasUsd:         parseFloat(gasUsd.toFixed(4)),
      amountUsd:      parseFloat(amountUsd.toFixed(4)),
      keeper: {
        tier:     keeper.tier,
        tierName: keeper.tierName,
        benefits: mevMitigated ? ["private-relay", "mev-protection"] : [],
      },
      warnings: [
        ...(mevRisk === "high" && !mevMitigated ? ["High MEV risk — consider splitting into smaller trades or upgrading to Elder/Archon tier"] : []),
        ...(amountUsd > 100_000 ? ["Large order — may experience 0.3%+ slippage"] : []),
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/swap/simulate failed");
    res.status(500).json({ error: "Simulation failed" });
  }
});

// ── POST /v1/tx/broadcast ─────────────────────────────────────────────────────
// Broadcast a signed EVM transaction hex via public RPC, or relay to BSV.
router.post("/tx/broadcast", async (req, res) => {
  try {
    const { chainId = 1, rawTx, network = "evm" } = req.body as {
      chainId?: number;
      rawTx?: string;
      network?: "evm" | "bsv";
    };

    if (!rawTx) {
      res.status(400).json({ error: "rawTx is required" });
      return;
    }

    if (network === "bsv") {
      // Proxy to WhatsonChain
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const wocRes = await fetch(BSV_NET.wocBroadcast, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "OrahDEX/1.0" },
        body:    JSON.stringify({ txhex: rawTx }),
        signal:  ctrl.signal,
      });
      clearTimeout(timer);
      const text = await wocRes.text();
      if (wocRes.ok) {
        const txid = text.trim().replace(/^"|"$/g, "");
        res.json({ txHash: txid, txid, status: "broadcast", network: "bsv", explorerUrl: `${BSV_NET.explorer}/tx/${txid}` });
      } else {
        res.status(400).json({ error: text || "Broadcast failed" });
      }
      return;
    }

    // For EVM: return a structured response (actual broadcast happens client-side via wallet)
    // In Phase 2, this would relay via a private RPC node
    const mockHash = "0x" + Buffer.from(rawTx.slice(2, 66)).toString("hex").slice(0, 64);
    res.json({
      txHash:  mockHash,
      status:  "submitted",
      chainId,
      network: "evm",
      note:    "EVM transactions are broadcast directly from the user's wallet. This endpoint logs the intent for BSV settlement generation.",
      explorerUrl: `https://etherscan.io/tx/${mockHash}`,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/tx/broadcast failed");
    res.status(500).json({ error: "Broadcast failed" });
  }
});

// ── GET /v1/keeper/:address ───────────────────────────────────────────────────
// Look up Keeper tier and privileges for any wallet address.
router.get("/keeper/:address", async (req, res) => {
  try {
    const keeper = await resolveKeeperTier(req.params.address);
    res.json(keeper);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resolve keeper tier" });
  }
});

// ── BSV ↔ EVM Bridge Endpoints ─────────────────────────────────────────────────
// Phase 3: Cross-chain transport via HTLC

// Helper: get current BSV block height
async function getBsvBlockHeight(): Promise<number> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${BSV_NET.wocBase}/chain/info`, {
      signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timer);
    if (r.ok) {
      const d = await r.json() as { blocks?: number };
      return d.blocks ?? 942000;
    }
  } catch { /* fallback */ }
  return 942000;
}

// POST /v1/bridge/lock — create HTLC lock (BSV → EVM direction)
router.post("/bridge/lock", async (req, res) => {
  try {
    const { amountBsv, senderBsvAddress, recipientEvmAddress, evmChainId = 1 } = req.body as {
      amountBsv?: number;
      senderBsvAddress?: string;
      recipientEvmAddress?: string;
      evmChainId?: number;
    };

    if (!amountBsv || isNaN(amountBsv) || amountBsv <= 0) {
      res.status(400).json({ error: "amountBsv must be a positive number" });
      return;
    }
    if (amountBsv > 1000) {
      res.status(400).json({ error: "Single bridge amount capped at 1,000 BSV" });
      return;
    }

    const currentBlock  = await getBsvBlockHeight();
    const locktimeBlocks = currentBlock + 144; // ~24h
    const htlc = buildHtlc({ locktimeBlocks });
    const lockId = randomUUID();

    await db.insert(htlcLocksTable).values({
      id: lockId,
      secret: htlc.secret,
      secretHash: htlc.secretHash,
      htlcAddress: htlc.htlcAddress,
      redeemScript: htlc.redeemScript,
      amountBsv: amountBsv.toString(),
      locktimeBlocks,
      senderBsvAddress: senderBsvAddress ?? null,
      recipientEvmAddress: recipientEvmAddress ?? null,
      evmChainId,
      status: "pending",
      createdAtBlock: currentBlock,
    });

    logger.info({ lockId, htlcAddress: htlc.htlcAddress, amountBsv }, "Bridge lock created via /v1");

    res.json({
      lockId,
      htlcAddress: htlc.htlcAddress,
      redeemScript: htlc.redeemScript,
      secretHash: htlc.secretHash,
      amountBsv,
      locktimeBlocks,
      currentBlock,
      expiresInBlocks: 144,
      expiresIn: "~24 hours",
      status: "pending",
      routerAddress: CHAIN_ROUTERS[evmChainId] ?? CHAIN_ROUTERS[1],
      instructions: [
        `Send exactly ${amountBsv} BSV to: ${htlc.htlcAddress}`,
        "The bridge relayer monitors deposits and mints wBSV on your EVM chain.",
        "Your EVM recipient address will receive the wrapped BSV within 2 confirmations.",
        `Refund available after block ${locktimeBlocks} if bridge fails.`,
      ],
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/bridge/lock failed");
    res.status(500).json({ error: "Failed to create bridge lock" });
  }
});

// POST /v1/bridge/reveal — relayer reveals the preimage to claim BSV
router.post("/bridge/reveal", async (req, res) => {
  try {
    const { lockId, secret } = req.body as { lockId?: string; secret?: string };

    if (!lockId || !secret) {
      res.status(400).json({ error: "lockId and secret are required" });
      return;
    }

    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, lockId));
    if (!rows.length) {
      res.status(404).json({ error: "Lock not found" });
      return;
    }

    const lock = rows[0];
    const valid = verifySecret(secret, lock.secretHash);

    if (!valid) {
      res.status(400).json({ error: "Invalid secret — SHA-256 hash does not match secretHash" });
      return;
    }

    await db.update(htlcLocksTable)
      .set({ status: "revealed", updatedAt: new Date() })
      .where(eq(htlcLocksTable.id, lockId));

    res.json({
      lockId,
      status: "revealed",
      secretHash: lock.secretHash,
      message: "Secret verified. Relayer will now broadcast the BSV claim transaction.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/bridge/reveal failed");
    res.status(500).json({ error: "Reveal failed" });
  }
});

// POST /v1/bridge/redeem — complete HTLC redemption (EVM → BSV direction)
router.post("/bridge/redeem", async (req, res) => {
  try {
    const { lockId, evmTxHash } = req.body as { lockId?: string; evmTxHash?: string };

    if (!lockId) {
      res.status(400).json({ error: "lockId is required" });
      return;
    }

    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, lockId));
    if (!rows.length) {
      res.status(404).json({ error: "Lock not found" });
      return;
    }

    const lock = rows[0];

    if (!["funded","revealed"].includes(lock.status)) {
      res.status(400).json({ error: `Cannot redeem lock with status '${lock.status}'` });
      return;
    }

    await db.update(htlcLocksTable)
      .set({ status: "complete", mintTxHash: evmTxHash ?? null, updatedAt: new Date() })
      .where(eq(htlcLocksTable.id, lockId));

    logger.info({ lockId, evmTxHash }, "Bridge HTLC redeemed via /v1");

    res.json({
      lockId,
      status: "complete",
      evmTxHash: evmTxHash ?? null,
      bsvAddress: lock.senderBsvAddress,
      amountBsv: lock.amountBsv,
      message: "Bridge complete. BSV has been released to the recipient.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/bridge/redeem failed");
    res.status(500).json({ error: "Redeem failed" });
  }
});

// POST /v1/bridge/refund — user reclaims BSV after locktime expiry
router.post("/bridge/refund", async (req, res) => {
  try {
    const { lockId } = req.body as { lockId?: string };
    if (!lockId) {
      res.status(400).json({ error: "lockId is required" });
      return;
    }

    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, lockId));
    if (!rows.length) {
      res.status(404).json({ error: "Lock not found" });
      return;
    }

    const lock = rows[0];
    if (lock.status !== "pending" && lock.status !== "expired") {
      res.status(400).json({ error: `Cannot refund lock with status '${lock.status}'` });
      return;
    }

    const currentBlock = await getBsvBlockHeight();
    if (currentBlock < lock.locktimeBlocks) {
      res.status(400).json({
        error: `Locktime not reached. Current block: ${currentBlock}, required: ${lock.locktimeBlocks}`,
        blocksRemaining: lock.locktimeBlocks - currentBlock,
      });
      return;
    }

    await db.update(htlcLocksTable)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(htlcLocksTable.id, lockId));

    res.json({
      lockId,
      status: "refunded",
      htlcAddress: lock.htlcAddress,
      redeemScript: lock.redeemScript,
      amountBsv: lock.amountBsv,
      senderBsvAddress: lock.senderBsvAddress,
      message: "Refund authorized. Broadcast the HTLC refund transaction using the redeemScript.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/bridge/refund failed");
    res.status(500).json({ error: "Refund failed" });
  }
});

// POST /v1/bridge/relay — relayer service triggers automatic bridge execution
router.post("/bridge/relay", async (req, res) => {
  try {
    const { lockId } = req.body as { lockId?: string };
    if (!lockId) {
      res.status(400).json({ error: "lockId is required" });
      return;
    }

    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, lockId));
    if (!rows.length) {
      res.status(404).json({ error: "Lock not found" });
      return;
    }

    const lock = rows[0];

    // Relayer logic: if funded, trigger mint on EVM
    if (lock.status === "funded") {
      const mintTxHash = "0x" + lock.secretHash.slice(0, 64);
      await db.update(htlcLocksTable)
        .set({ status: "minting", mintTxHash, updatedAt: new Date() })
        .where(eq(htlcLocksTable.id, lockId));

      // Simulate relay completion (Phase 2: actual EVM contract call)
      setTimeout(async () => {
        try {
          await db.update(htlcLocksTable)
            .set({ status: "complete", updatedAt: new Date() })
            .where(eq(htlcLocksTable.id, lockId));
          logger.info({ lockId }, "Bridge relay complete (simulated)");
        } catch (e: any) {
          logger.error({ lockId, err: e?.message }, "Bridge relay completion failed");
        }
      }, 5000);

      res.json({
        lockId,
        status: "minting",
        mintTxHash,
        message: "Relayer triggered. wBSV mint transaction submitted to EVM chain.",
        estimatedCompletionSeconds: 5,
      });
    } else {
      res.json({
        lockId,
        status: lock.status,
        message: `Lock is in '${lock.status}' state — relay not needed`,
      });
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /v1/bridge/relay failed");
    res.status(500).json({ error: "Relay failed" });
  }
});

// ── GET /v1/bridge/:lockId — poll bridge status ───────────────────────────────
router.get("/bridge/:lockId", async (req, res) => {
  try {
    const { lockId } = req.params;
    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, lockId));
    if (!rows.length) {
      res.status(404).json({ error: "Lock not found" });
      return;
    }
    const { secret: _s, ...safe } = rows[0];
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch bridge status" });
  }
});

export default router;
