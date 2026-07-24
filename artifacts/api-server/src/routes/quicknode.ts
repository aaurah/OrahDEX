import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid RPC provider chain
//
// Priority per chain: QuickNode → Alchemy → GetBlock → public RPC
//
// ── 1. QuickNode ──────────────────────────────────────────────────────────────
// Set QN_*_ENDPOINT to your full QuickNode HTTP endpoint URL.
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

// ── 2. Alchemy ────────────────────────────────────────────────────────────────
// ALCHEMY_API_KEY covers all chains via per-chain subdomains.
const ALCHEMY_HOSTS: Record<number, string> = {
  1:     "eth-mainnet.g.alchemy.com",
  56:    "bnb-mainnet.g.alchemy.com",
  137:   "polygon-mainnet.g.alchemy.com",
  8453:  "base-mainnet.g.alchemy.com",
  42161: "arb-mainnet.g.alchemy.com",
  10:    "opt-mainnet.g.alchemy.com",
  43114: "avax-mainnet.g.alchemy.com",
};
function alchemyUrl(chainId: number): string | undefined {
  const key = process.env["ALCHEMY_API_KEY"];
  const host = ALCHEMY_HOSTS[chainId];
  return key && host ? `https://${host}/v2/${key}` : undefined;
}
function alchemySolUrl(): string | undefined {
  const key = process.env["ALCHEMY_API_KEY"];
  return key ? `https://solana-mainnet.g.alchemy.com/v2/${key}` : undefined;
}

// ── 3. GetBlock ───────────────────────────────────────────────────────────────
// Supports two formats:
//   GB_*_URL   = full endpoint URL (e.g. https://shared.ap-southeast-1.getblock.io/<TOKEN>)
//   GB_*_TOKEN = access token only → constructs https://go.getblock.io/<TOKEN>/
// Full URL takes precedence (needed for regional shared endpoints).
function gbUrl(urlEnv: string, tokenEnv: string): string | undefined {
  const full  = process.env[urlEnv];
  const token = process.env[tokenEnv];
  if (full)  return full;
  if (token) return `https://go.getblock.io/${token}/`;
  return undefined;
}

function getblockUrl(chainId: number): string | undefined {
  const pairs: Record<number, [string, string]> = {
    1:     ["GB_ETH_URL",   "GB_ETH_TOKEN"],
    56:    ["GB_BSC_URL",   "GB_BSC_TOKEN"],
    137:   ["GB_MATIC_URL", "GB_MATIC_TOKEN"],
    8453:  ["GB_BASE_URL",  "GB_BASE_TOKEN"],
    42161: ["GB_ARB_URL",   "GB_ARB_TOKEN"],
    10:    ["GB_OP_URL",    "GB_OP_TOKEN"],
    43114: ["GB_AVAX_URL",  "GB_AVAX_TOKEN"],
  };
  const p = pairs[chainId];
  return p ? gbUrl(p[0], p[1]) : undefined;
}
function getblockSolUrl(): string | undefined {
  return gbUrl("GB_SOL_URL", "GB_SOL_TOKEN");
}

// ── 4. Public fallback ────────────────────────────────────────────────────────
const PUBLIC_RPCS: Record<number, string> = {
  1:     "https://ethereum.publicnode.com",
  56:    "https://bsc-dataseed.binance.org",
  137:   "https://polygon-bor.publicnode.com",
  8453:  "https://base.publicnode.com",
  42161: "https://arbitrum-one.publicnode.com",
  10:    "https://optimism.publicnode.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

// ── Resolve best available endpoint ──────────────────────────────────────────
function rpcEndpoint(chainId: number): string | undefined {
  return (
    qnEndpoint(chainId)   ??
    alchemyUrl(chainId)   ??
    getblockUrl(chainId)  ??
    PUBLIC_RPCS[chainId]
  );
}
function solanaEndpoint(): string {
  return (
    process.env["QN_SOL_ENDPOINT"] ??
    alchemySolUrl()                 ??
    getblockSolUrl()                ??
    "https://api.mainnet-beta.solana.com"
  );
}

// Helper — which provider is active for a chain
function providerName(chainId: number): string {
  if (qnEndpoint(chainId))  return "quicknode";
  if (alchemyUrl(chainId))  return "alchemy";
  if (getblockUrl(chainId)) return "getblock";
  if (PUBLIC_RPCS[chainId]) return "public";
  return "none";
}
function solanaProviderName(): string {
  if (process.env["QN_SOL_ENDPOINT"]) return "quicknode";
  if (alchemySolUrl())                return "alchemy";
  if (getblockSolUrl())               return "getblock";
  return "public";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/rpc/:chainId — JSON-RPC proxy (hybrid: QN → Alchemy → GetBlock → public)
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

// POST /api/rpc/solana — Solana JSON-RPC proxy (hybrid chain)
router.post("/rpc/solana", async (req, res) => {
  const endpoint = solanaEndpoint();
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

// GET /api/quicknode/swap/price — QuickNode 0x Swap add-on (addon 614)
// Only available when a QN_*_ENDPOINT with the add-on enabled is configured.
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

// GET /api/quicknode/swap/quote — QuickNode 0x Swap add-on firm quote + calldata
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

// GET /api/quicknode/status — hybrid provider status (no key values exposed)
router.get("/quicknode/status", (_req, res) => {
  const hasQn      = [1,56,8453,137,42161,10,43114].some(id => !!qnEndpoint(id));
  const hasAlchemy = !!process.env["ALCHEMY_API_KEY"];
  const hasGb      = [1,56,8453,137,42161,10,43114].some(id => !!getblockUrl(id));
  res.json({
    providers: { quicknode: hasQn, alchemy: hasAlchemy, getblock: hasGb },
    chains: {
      eth:       providerName(1),
      bsc:       providerName(56),
      base:      providerName(8453),
      polygon:   providerName(137),
      arbitrum:  providerName(42161),
      optimism:  providerName(10),
      avalanche: providerName(43114),
    },
    solana: solanaProviderName(),
  });
});

export default router;
