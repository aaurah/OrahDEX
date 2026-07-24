import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid RPC provider chain: QuickNode → Alchemy → GetBlock → public RPC
//
// Every inbound JSON-RPC request is tried against each configured provider
// in priority order. The first successful (non-error) response wins.
// Failures (network, timeout, 429 rate-limit, 5xx) silently advance to the
// next provider. If all fail the last error is returned to the caller.
// ─────────────────────────────────────────────────────────────────────────────

// ── Provider URL builders ─────────────────────────────────────────────────────

function gbUrl(urlEnv: string, tokenEnv: string): string | undefined {
  const full  = process.env[urlEnv];
  const token = process.env[tokenEnv];
  if (full)  return full;
  if (token) return `https://go.getblock.io/${token}/`;
  return undefined;
}

const ALCHEMY_HOSTS: Record<number, string> = {
  1:     "eth-mainnet.g.alchemy.com",
  56:    "bnb-mainnet.g.alchemy.com",
  137:   "polygon-mainnet.g.alchemy.com",
  8453:  "base-mainnet.g.alchemy.com",
  42161: "arb-mainnet.g.alchemy.com",
  10:    "opt-mainnet.g.alchemy.com",
  43114: "avax-mainnet.g.alchemy.com",
};

const PUBLIC_RPCS: Record<number, string> = {
  1:     "https://ethereum.publicnode.com",
  56:    "https://bsc-dataseed.binance.org",
  137:   "https://polygon-bor.publicnode.com",
  8453:  "https://base.publicnode.com",
  42161: "https://arbitrum-one.publicnode.com",
  10:    "https://optimism.publicnode.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

// Returns an ordered list of { name, url } for a chain — all configured providers
function rpcProviders(chainId: number): { name: string; url: string }[] {
  const list: { name: string; url: string }[] = [];

  // 1. QuickNode
  const qnMap: Record<number, string | undefined> = {
    1:     process.env["QN_ETH_ENDPOINT"],
    56:    process.env["QN_BSC_ENDPOINT"],
    137:   process.env["QN_MATIC_ENDPOINT"],
    8453:  process.env["QN_BASE_ENDPOINT"],
    42161: process.env["QN_ARB_ENDPOINT"],
    10:    process.env["QN_OP_ENDPOINT"],
    43114: process.env["QN_AVAX_ENDPOINT"],
  };
  const qn = qnMap[chainId];
  if (qn) list.push({ name: "quicknode", url: qn });

  // 2. Alchemy
  const alchemyKey  = process.env["ALCHEMY_API_KEY"];
  const alchemyHost = ALCHEMY_HOSTS[chainId];
  if (alchemyKey && alchemyHost)
    list.push({ name: "alchemy", url: `https://${alchemyHost}/v2/${alchemyKey}` });

  // 3. GetBlock
  const gbMap: Record<number, [string, string]> = {
    1:     ["GB_ETH_URL",   "GB_ETH_TOKEN"],
    56:    ["GB_BSC_URL",   "GB_BSC_TOKEN"],
    137:   ["GB_MATIC_URL", "GB_MATIC_TOKEN"],
    8453:  ["GB_BASE_URL",  "GB_BASE_TOKEN"],
    42161: ["GB_ARB_URL",   "GB_ARB_TOKEN"],
    10:    ["GB_OP_URL",    "GB_OP_TOKEN"],
    43114: ["GB_AVAX_URL",  "GB_AVAX_TOKEN"],
  };
  const gbPair = gbMap[chainId];
  if (gbPair) {
    const gb = gbUrl(gbPair[0], gbPair[1]);
    if (gb) list.push({ name: "getblock", url: gb });
  }

  // 4. Public fallback
  const pub = PUBLIC_RPCS[chainId];
  if (pub) list.push({ name: "public", url: pub });

  return list;
}

function solanaProviders(): { name: string; url: string }[] {
  const list: { name: string; url: string }[] = [];
  if (process.env["QN_SOL_ENDPOINT"])
    list.push({ name: "quicknode", url: process.env["QN_SOL_ENDPOINT"]! });
  if (process.env["ALCHEMY_API_KEY"])
    list.push({ name: "alchemy", url: `https://solana-mainnet.g.alchemy.com/v2/${process.env["ALCHEMY_API_KEY"]}` });
  const gb = gbUrl("GB_SOL_URL", "GB_SOL_TOKEN");
  if (gb) list.push({ name: "getblock", url: gb });
  list.push({ name: "public", url: "https://api.mainnet-beta.solana.com" });
  return list;
}

// ── Core cascading fetch ──────────────────────────────────────────────────────
// Tries each provider in order. Advances on:
//   - Network / timeout errors
//   - HTTP 429 (rate limited)
//   - HTTP 5xx (server error)
// Returns on the first 2xx/4xx response (4xx = caller error, not provider error).

interface CascadeResult {
  status: number;
  body: unknown;
  provider: string;
  attempts: string[];
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function cascadeRpc(
  providers: { name: string; url: string }[],
  body: unknown,
  timeoutMs = 8_000,
): Promise<CascadeResult> {
  const attempts: string[] = [];
  let lastErr: unknown = new Error("No providers configured");

  for (const { name, url } of providers) {
    attempts.push(name);
    try {
      const r = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(timeoutMs),
      });

      if (RETRYABLE_STATUS.has(r.status)) {
        logger.warn({ provider: name, status: r.status }, "RPC provider returned retryable status — trying next");
        lastErr = new Error(`HTTP ${r.status} from ${name}`);
        continue;
      }

      const data = await r.json();
      return { status: r.status, body: data, provider: name, attempts };
    } catch (err) {
      logger.warn({ provider: name, err }, "RPC provider failed — trying next");
      lastErr = err;
    }
  }

  throw Object.assign(lastErr instanceof Error ? lastErr : new Error(String(lastErr)), { attempts });
}

// ── Status helper — names of configured providers per chain ───────────────────
function providerNames(chainId: number): string[] {
  return rpcProviders(chainId).map(p => p.name);
}
function primaryProvider(chainId: number): string {
  return rpcProviders(chainId)[0]?.name ?? "none";
}
function primarySolanaProvider(): string {
  return solanaProviders()[0]?.name ?? "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/rpc/:chain — cascading JSON-RPC proxy
// Accepts either a numeric EVM chainId (e.g. "1", "8453") or the string "solana".
router.post("/rpc/:chain", async (req, res) => {
  const chain = req.params["chain"] ?? "";

  // ── Solana ────────────────────────────────────────────────────────────────
  if (chain === "solana") {
    const providers = solanaProviders();
    try {
      const result = await cascadeRpc(providers, req.body);
      res.set("X-RPC-Provider", result.provider);
      if (result.attempts.length > 1) res.set("X-RPC-Attempts", result.attempts.join(","));
      res.status(result.status).json(result.body);
    } catch (err: unknown) {
      const attempts = (err as { attempts?: string[] }).attempts ?? [];
      logger.error({ err, attempts }, "All Solana RPC providers failed");
      res.status(502).json({ error: "All Solana RPC providers failed", attempts });
    }
    return;
  }

  // ── EVM (numeric chainId) ─────────────────────────────────────────────────
  const chainId = parseInt(chain, 10);
  if (isNaN(chainId)) { res.status(400).json({ error: "Invalid chainId — use a numeric EVM chainId or 'solana'" }); return; }

  const providers = rpcProviders(chainId);
  if (!providers.length) { res.status(400).json({ error: `No RPC endpoint for chain ${chainId}` }); return; }

  try {
    const result = await cascadeRpc(providers, req.body);
    res.set("X-RPC-Provider", result.provider);
    if (result.attempts.length > 1) res.set("X-RPC-Attempts", result.attempts.join(","));
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    const attempts = (err as { attempts?: string[] }).attempts ?? [];
    logger.error({ err, chainId, attempts }, "All RPC providers failed");
    res.status(502).json({ error: "All RPC providers failed", chainId, attempts });
  }
});

// GET /api/quicknode/swap/price — QuickNode 0x Swap add-on (addon 614)
router.get("/quicknode/swap/price", async (req, res) => {
  const chainId = parseInt((req.query["chainId"] as string) ?? "1", 10);
  const qn = rpcProviders(chainId).find(p => p.name === "quicknode");
  if (!qn) {
    res.status(503).json({ error: `QuickNode endpoint not configured for chain ${chainId}` });
    return;
  }
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  try {
    const r = await fetch(`${qn.url.replace(/\/$/, "")}/addon/614/swap/v1/price?${params}`, {
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
  const qn = rpcProviders(chainId).find(p => p.name === "quicknode");
  if (!qn) {
    res.status(503).json({ error: `QuickNode endpoint not configured for chain ${chainId}` });
    return;
  }
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete("chainId");
  try {
    const r = await fetch(`${qn.url.replace(/\/$/, "")}/addon/614/swap/v1/quote?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    logger.error({ err, chainId }, "QuickNode swap quote error");
    res.status(502).json({ error: "QuickNode swap quote error" });
  }
});

// GET /api/quicknode/status — full hybrid provider status
router.get("/quicknode/status", (_req, res) => {
  const CHAINS = [1, 56, 8453, 137, 42161, 10, 43114] as const;
  const chainNames: Record<number, string> = {
    1: "eth", 56: "bsc", 8453: "base", 137: "polygon",
    42161: "arbitrum", 10: "optimism", 43114: "avalanche",
  };

  const chains: Record<string, { primary: string; fallbacks: string[] }> = {};
  for (const id of CHAINS) {
    const names = providerNames(id);
    chains[chainNames[id]!] = { primary: names[0] ?? "none", fallbacks: names.slice(1) };
  }

  const solNames = solanaProviders().map(p => p.name);

  res.json({
    providers: {
      quicknode: CHAINS.some(id => !!rpcProviders(id).find(p => p.name === "quicknode")),
      alchemy:   !!process.env["ALCHEMY_API_KEY"],
      getblock:  CHAINS.some(id => !!rpcProviders(id).find(p => p.name === "getblock")),
    },
    chains,
    solana: { primary: solNames[0] ?? "none", fallbacks: solNames.slice(1) },
  });
});

export default router;
