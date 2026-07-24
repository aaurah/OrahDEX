import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Alchemy RPC URL builder ───────────────────────────────────────────────────
// Alchemy uses one API key across all chains; each chain has its own subdomain.
const ALCHEMY_CHAIN_HOSTS: Record<number, string> = {
  1:     "eth-mainnet.g.alchemy.com",
  56:    "bnb-mainnet.g.alchemy.com",
  137:   "polygon-mainnet.g.alchemy.com",
  8453:  "base-mainnet.g.alchemy.com",
  42161: "arb-mainnet.g.alchemy.com",
  10:    "opt-mainnet.g.alchemy.com",
  43114: "avax-mainnet.g.alchemy.com",
};

function alchemyUrl(chainId: number): string | undefined {
  const key  = process.env["ALCHEMY_API_KEY"];
  const host = ALCHEMY_CHAIN_HOSTS[chainId];
  if (!key || !host) return undefined;
  return `https://${host}/v2/${key}`;
}

const ALCHEMY_SOL_HOST = "solana-mainnet.g.alchemy.com";
function alchemySolUrl(): string | undefined {
  const key = process.env["ALCHEMY_API_KEY"];
  return key ? `https://${ALCHEMY_SOL_HOST}/v2/${key}` : undefined;
}

// ── QuickNode full-URL endpoint lookup (optional, overrides Alchemy) ──────────
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
  return map[chainId] || undefined;
}

// Priority: QuickNode (full URL) → Alchemy → public RPC
const FALLBACK_RPCS: Record<number, string> = {
  1:     "https://ethereum.publicnode.com",
  56:    "https://bsc-dataseed.binance.org",
  137:   "https://polygon-bor.publicnode.com",
  8453:  "https://base.publicnode.com",
  42161: "https://arbitrum-one.publicnode.com",
  10:    "https://optimism.publicnode.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

function rpcEndpoint(chainId: number): string | undefined {
  return qnEndpoint(chainId) ?? alchemyUrl(chainId) ?? FALLBACK_RPCS[chainId];
}

// ── POST /api/rpc/:chainId ────────────────────────────────────────────────────
// JSON-RPC proxy: QuickNode → Alchemy → public RPC fallback.
// The frontend Wallet/Swap pages fall back to this route so the Alchemy key
// is never exposed in client-side bundles.
router.post("/rpc/:chainId", async (req, res) => {
  const chainId = parseInt(req.params["chainId"] ?? "", 10);
  if (isNaN(chainId)) { res.status(400).json({ error: "Invalid chainId" }); return; }

  const endpoint = rpcEndpoint(chainId);
  if (!endpoint) { res.status(400).json({ error: `No RPC endpoint for chain ${chainId}` }); return; }

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

// ── POST /api/rpc/solana ──────────────────────────────────────────────────────
// Solana JSON-RPC proxy: QuickNode → Alchemy → public mainnet-beta.
router.post("/rpc/solana", async (req, res) => {
  const endpoint =
    process.env["QN_SOL_ENDPOINT"] ??
    alchemySolUrl() ??
    "https://api.mainnet-beta.solana.com";

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
    logger.error({ err }, "Solana RPC proxy error");
    res.status(502).json({ error: "Solana RPC proxy error" });
  }
});

// ── GET /api/quicknode/swap/price ─────────────────────────────────────────────
// QuickNode DeFi Swap Add-on (0x-based) price estimate — only works when a
// QuickNode endpoint with the add-on enabled is set via QN_*_ENDPOINT.
router.get("/quicknode/swap/price", async (req, res) => {
  const chainId = parseInt((req.query["chainId"] as string) ?? "1", 10);
  const endpoint = qnEndpoint(chainId);
  if (!endpoint) {
    res.status(503).json({ error: `QuickNode endpoint not configured for chain ${chainId}` });
    return;
  }
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  try {
    const r = await fetch(`${endpoint.replace(/\/$/, "")}/addon/614/swap/v1/price?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    logger.error({ err, chainId }, "QuickNode swap price error");
    res.status(502).json({ error: "QuickNode swap price error" });
  }
});

// ── GET /api/quicknode/swap/quote ─────────────────────────────────────────────
// QuickNode DeFi Swap Add-on firm quote with calldata.
router.get("/quicknode/swap/quote", async (req, res) => {
  const chainId = parseInt((req.query["chainId"] as string) ?? "1", 10);
  const endpoint = qnEndpoint(chainId);
  if (!endpoint) {
    res.status(503).json({ error: `QuickNode endpoint not configured for chain ${chainId}` });
    return;
  }
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  try {
    const r = await fetch(`${endpoint.replace(/\/$/, "")}/addon/614/swap/v1/quote?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    logger.error({ err, chainId }, "QuickNode swap quote error");
    res.status(502).json({ error: "QuickNode swap quote error" });
  }
});

// ── GET /api/quicknode/status ─────────────────────────────────────────────────
// Reports which providers are active per chain (no key values exposed).
router.get("/quicknode/status", (_req, res) => {
  const alchemyKey = !!process.env["ALCHEMY_API_KEY"];
  const chainStatus = (id: number) => {
    if (qnEndpoint(id))    return "quicknode";
    if (alchemyUrl(id))    return "alchemy";
    if (FALLBACK_RPCS[id]) return "public";
    return "none";
  };
  res.json({
    alchemy_key_set: alchemyKey,
    solana: process.env["QN_SOL_ENDPOINT"] ? "quicknode" : alchemyKey ? "alchemy" : "public",
    chains: {
      eth:       chainStatus(1),
      bsc:       chainStatus(56),
      base:      chainStatus(8453),
      polygon:   chainStatus(137),
      arbitrum:  chainStatus(42161),
      optimism:  chainStatus(10),
      avalanche: chainStatus(43114),
    },
  });
});

export default router;
