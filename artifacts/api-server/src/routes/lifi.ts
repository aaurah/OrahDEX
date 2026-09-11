/**
 * lifi.ts — LI.FI cross-chain DEX aggregator routes
 *
 * GET  /api/lifi/quote        — best route for a swap (returns signed tx)
 * GET  /api/lifi/routes       — multiple routes for comparison
 * GET  /api/lifi/chains       — all 69 supported chains
 * GET  /api/lifi/tokens       — tokens for a chain (?chain=eth)
 * GET  /api/lifi/status       — tx status (?txHash=0x...&fromChainId=1)
 * GET  /api/lifi/supported    — check if a coin pair is supported
 */

import { Router } from "express";
import {
  getLifiQuote,
  getLifiRoutes,
  getLifiChains,
  getLifiTokensByChain,
  getLifiTxStatus,
  resolveLifiToken,
  TOKEN_REGISTRY,
  LIFI_CHAINS,
} from "../lib/lifi.js";

const router = Router();

// ── GET /api/lifi/quote ───────────────────────────────────────────────────────
router.get("/lifi/quote", async (req, res) => {
  const fromSymbol  = String(req.query.from        ?? "").toUpperCase();
  const toSymbol    = String(req.query.to          ?? "").toUpperCase();
  const amtRaw      = parseFloat(String(req.query.amount  ?? "0"));
  const fromAddress = String(req.query.fromAddress ?? "");
  const fromChain   = String(req.query.fromChain   ?? "").toLowerCase() || undefined;
  const toChain     = String(req.query.toChain     ?? "").toLowerCase() || undefined;
  const slippage    = parseFloat(String(req.query.slippage ?? "0.005"));

  if (!fromSymbol || !toSymbol || fromSymbol === toSymbol) {
    res.status(400).json({ error: "from and to required and must differ" });
    return;
  }
  if (!isFinite(amtRaw) || amtRaw <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  try {
    const quote = await getLifiQuote({
      fromSymbol, toSymbol,
      fromAmount:  amtRaw,
      fromAddress,
      fromChain,
      toChain,
      slippage:    isFinite(slippage) ? slippage : 0.005,
    });

    if (!quote) {
      res.status(404).json({
        error:    "No LI.FI route found for this pair",
        fromSymbol, toSymbol,
        hint:     "Pair may not be supported. Try /api/lifi/supported to check.",
      });
      return;
    }

    res.json({ ...quote, source: "lifi", executionType: "onchain" });
  } catch (err: any) {
    res.status(502).json({ error: "LI.FI API unavailable", detail: err?.message });
  }
});

// ── GET /api/lifi/routes ──────────────────────────────────────────────────────
router.get("/lifi/routes", async (req, res) => {
  const fromSymbol  = String(req.query.from        ?? "").toUpperCase();
  const toSymbol    = String(req.query.to          ?? "").toUpperCase();
  const amtRaw      = parseFloat(String(req.query.amount  ?? "0"));
  const fromAddress = String(req.query.fromAddress ?? "") || undefined;
  const fromChain   = String(req.query.fromChain   ?? "").toLowerCase() || undefined;
  const toChain     = String(req.query.toChain     ?? "").toLowerCase() || undefined;
  const maxRoutes   = Math.min(parseInt(String(req.query.maxRoutes ?? "5"), 10), 10);

  if (!fromSymbol || !toSymbol || !isFinite(amtRaw) || amtRaw <= 0) {
    res.status(400).json({ error: "from, to and amount required" });
    return;
  }

  try {
    const routes = await getLifiRoutes({
      fromSymbol, toSymbol, fromAmount: amtRaw,
      fromAddress, fromChain, toChain, maxRoutes,
    });

    res.json({
      routes,
      count:         routes.length,
      fromSymbol,
      toSymbol,
      fromAmount:    amtRaw,
      source:        "lifi",
      executionType: "onchain",
    });
  } catch (err: any) {
    res.status(502).json({ error: "LI.FI API unavailable", detail: err?.message });
  }
});

// ── GET /api/lifi/chains ──────────────────────────────────────────────────────
router.get("/lifi/chains", async (_req, res) => {
  try {
    const chains = await getLifiChains();
    res.json({ chains, count: chains.length, source: "lifi" });
  } catch (err: any) {
    res.status(502).json({ error: "LI.FI API unavailable", detail: err?.message });
  }
});

// ── GET /api/lifi/tokens ──────────────────────────────────────────────────────
router.get("/lifi/tokens", async (req, res) => {
  const chain = String(req.query.chain ?? "eth").toLowerCase();
  try {
    const tokens = await getLifiTokensByChain(chain);
    res.json({ tokens, count: tokens.length, chain, source: "lifi" });
  } catch (err: any) {
    res.status(502).json({ error: "LI.FI API unavailable", detail: err?.message });
  }
});

// ── GET /api/lifi/status ──────────────────────────────────────────────────────
router.get("/lifi/status", async (req, res) => {
  const txHash      = String(req.query.txHash      ?? "");
  const fromChainId = parseInt(String(req.query.fromChainId ?? "1"), 10);

  if (!txHash || !txHash.startsWith("0x")) {
    res.status(400).json({ error: "txHash required (must start with 0x)" });
    return;
  }

  try {
    const status = await getLifiTxStatus(txHash, fromChainId);
    if (!status) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(status);
  } catch (err: any) {
    res.status(502).json({ error: "LI.FI API unavailable", detail: err?.message });
  }
});

// ── GET /api/lifi/supported ───────────────────────────────────────────────────
// Quick check: does LI.FI know about these tokens?
router.get("/lifi/supported", (req, res) => {
  const from = String(req.query.from ?? "").toUpperCase();
  const to   = String(req.query.to   ?? "").toUpperCase();

  const knownCoins  = Object.keys(TOKEN_REGISTRY);
  const knownChains = Object.keys(LIFI_CHAINS);

  const fromInfo = from ? resolveLifiToken(from) : null;
  const toInfo   = to   ? resolveLifiToken(to)   : null;

  res.json({
    from:          from || undefined,
    to:            to   || undefined,
    fromSupported: fromInfo !== null,
    toSupported:   toInfo   !== null,
    pairSupported: fromInfo !== null && toInfo !== null,
    fromChain:     fromInfo?.chain,
    toChain:       toInfo?.chain,
    crossChain:    fromInfo?.chain !== toInfo?.chain,
    knownCoins:    knownCoins.length,
    knownChains:   knownChains.length,
    note:          "Token registry covers major assets. For exotic tokens, use /api/lifi/tokens",
  });
});

export default router;
