import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// ── QuickNode endpoint helpers ────────────────────────────────────────────────
// Set these environment variables to your QuickNode HTTP endpoint URLs.
// The proxy falls back to free public RPCs when a QN endpoint is not set.

function qnEndpoint(chainId: number): string | undefined {
  const map: Record<number, string | undefined> = {
    1:     process.env["QN_ETH_ENDPOINT"],
    56:    process.env["QN_BSC_ENDPOINT"],
    137:   process.env["QN_MATIC_ENDPOINT"],
    8453:  process.env["QN_BASE_ENDPOINT"],
    42161: process.env["QN_ARB_ENDPOINT"],
    10:    process.env["QN_OP_ENDPOINT"],
    43114: process.env["QN_AVAX_ENDPOINT"],
  };
  return map[chainId];
}

const FALLBACK_RPCS: Record<number, string> = {
  1:     "https://ethereum.publicnode.com",
  56:    "https://bsc-dataseed.binance.org",
  137:   "https://polygon-bor.publicnode.com",
  8453:  "https://base.publicnode.com",
  42161: "https://arbitrum-one.publicnode.com",
  10:    "https://optimism.publicnode.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

// ── POST /api/rpc/:chainId ────────────────────────────────────────────────────
// JSON-RPC proxy — uses QuickNode when configured, falls back to public RPCs.
// Frontend Wallet/Swap pages fall back here for chains without a direct URL.
router.post("/rpc/:chainId", async (req, res) => {
  const chainId = parseInt(req.params["chainId"] ?? "", 10);
  if (isNaN(chainId)) {
    res.status(400).json({ error: "Invalid chainId" });
    return;
  }

  const endpoint = qnEndpoint(chainId) ?? FALLBACK_RPCS[chainId];
  if (!endpoint) {
    res.status(400).json({ error: `No RPC endpoint for chain ${chainId}` });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(10_000),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    logger.error({ err, chainId }, "RPC proxy error");
    res.status(502).json({ error: "RPC proxy error", chainId });
  }
});

// ── POST /api/quicknode/solana ────────────────────────────────────────────────
// Solana JSON-RPC proxy — uses QN_SOL_ENDPOINT.
router.post("/quicknode/solana", async (req, res) => {
  const endpoint = process.env["QN_SOL_ENDPOINT"];
  if (!endpoint) {
    res.status(503).json({ error: "QN_SOL_ENDPOINT not configured" });
    return;
  }
  try {
    const r = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    logger.error({ err }, "QuickNode Solana proxy error");
    res.status(502).json({ error: "QuickNode Solana proxy error" });
  }
});

// ── GET /api/quicknode/swap/price ─────────────────────────────────────────────
// QuickNode DeFi Swap Meta-Aggregation Add-on — price estimate (no calldata).
// Add-on 614 on QuickNode dashboard = 0x-based DEX aggregator.
// Required params: sellToken, buyToken, sellAmount, (optional) takerAddress, chainId
router.get("/quicknode/swap/price", async (req, res) => {
  const chainId = parseInt((req.query["chainId"] as string) ?? "1", 10);
  const endpoint = qnEndpoint(chainId);

  if (!endpoint) {
    res.status(503).json({ error: `QuickNode not configured for chain ${chainId}` });
    return;
  }

  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  const url = `${endpoint.replace(/\/$/, "")}/addon/614/swap/v1/price?${params}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    logger.error({ err, chainId }, "QuickNode swap price error");
    res.status(502).json({ error: "QuickNode swap price error" });
  }
});

// ── GET /api/quicknode/swap/quote ─────────────────────────────────────────────
// QuickNode DeFi Swap Add-on — firm quote with full swap calldata + approval info.
// Required params: sellToken, buyToken, sellAmount, takerAddress, chainId
router.get("/quicknode/swap/quote", async (req, res) => {
  const chainId = parseInt((req.query["chainId"] as string) ?? "1", 10);
  const endpoint = qnEndpoint(chainId);

  if (!endpoint) {
    res.status(503).json({ error: `QuickNode not configured for chain ${chainId}` });
    return;
  }

  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  const url = `${endpoint.replace(/\/$/, "")}/addon/614/swap/v1/quote?${params}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    logger.error({ err, chainId }, "QuickNode swap quote error");
    res.status(502).json({ error: "QuickNode swap quote error" });
  }
});

// ── GET /api/quicknode/status ─────────────────────────────────────────────────
// Reports which QuickNode endpoints are configured (no values exposed).
router.get("/quicknode/status", (_req, res) => {
  res.json({
    evm: {
      eth:       !!process.env["QN_ETH_ENDPOINT"],
      bsc:       !!process.env["QN_BSC_ENDPOINT"],
      base:      !!process.env["QN_BASE_ENDPOINT"],
      polygon:   !!process.env["QN_MATIC_ENDPOINT"],
      arbitrum:  !!process.env["QN_ARB_ENDPOINT"],
      optimism:  !!process.env["QN_OP_ENDPOINT"],
      avalanche: !!process.env["QN_AVAX_ENDPOINT"],
    },
    solana: !!process.env["QN_SOL_ENDPOINT"],
  });
});

export default router;
