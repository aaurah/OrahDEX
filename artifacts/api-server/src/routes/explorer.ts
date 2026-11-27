import { Router, type IRouter, type Response as ExpressResponse } from "express";
import { pool } from "@workspace/db";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";

const router: IRouter = Router();
const WOC_BASE = BSV_NET.wocBase;
const FETCH_TIMEOUT_MS = 9_000;
const CACHE_TTL_MS = 20_000;
const RECENT_BLOCKS_CACHE_TTL_MS = 120_000;
const RECENT_BLOCKS_STALE_TTL_MS = 15 * 60_000;
const WOC_API_KEY_CACHE_TTL_MS = 5 * 60_000;
const WOC_API_KEY_MISSING_CACHE_TTL_MS = 30_000;

interface WocBlock {
  hash?: string;
  height?: number;
  confirmations?: number;
  size?: number;
  time?: number;
  txcount?: number;
  num_tx?: number;
  tx?: string[];
  pages?: { uri?: string[]; size?: number } | null;
  miner?: string;
  previousblockhash?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const recentBlocksStaleCache = new Map<string, CacheEntry<Record<string, unknown>>>();
const recentBlocksInFlight = new Map<string, Promise<Record<string, unknown>>>();
let wocApiKeyCache: CacheEntry<string> = { value: "", expiresAt: 0 };

function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
  if (responseCache.size > 250) {
    const now = Date.now();
    for (const [entryKey, entry] of responseCache) {
      if (entry.expiresAt <= now) responseCache.delete(entryKey);
    }
    if (responseCache.size > 250) {
      responseCache.delete(responseCache.keys().next().value as string);
    }
  }
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

class WocError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfterMs = 0) {
    super(message);
  }
}

async function getWocApiKey(): Promise<string> {
  const now = Date.now();
  if (wocApiKeyCache.expiresAt > now) return wocApiKeyCache.value;

  const envKey = (process.env.WHATSONCHAIN_API_KEY ?? process.env.WOC_API_KEY ?? "").trim();
  if (envKey) {
    wocApiKeyCache = { value: envKey, expiresAt: now + WOC_API_KEY_CACHE_TTL_MS };
    return envKey;
  }

  try {
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = 'whatsonchain_api_key' LIMIT 1`,
    );
    const key = (result.rows[0]?.value ?? "").trim();
    wocApiKeyCache = {
      value: key,
      expiresAt: now + (key ? WOC_API_KEY_CACHE_TTL_MS : WOC_API_KEY_MISSING_CACHE_TTL_MS),
    };
    return key;
  } catch {
    wocApiKeyCache = { value: "", expiresAt: now + WOC_API_KEY_MISSING_CACHE_TTL_MS };
    return "";
  }
}

async function fetchWoc<T>(path: string): Promise<{ data: T; response: globalThis.Response }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const apiKey = await getWocApiKey();
    const response = await fetch(`${WOC_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "OrahDEX-Explorer/1.0",
        ...(apiKey ? { "woc-api-key": apiKey } : {}),
      },
    });
    if (!response.ok) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 10_000)
        : 0;
      throw new WocError(response.status, `WhatsOnChain returned ${response.status}`, retryAfterMs);
    }
    return { data: await response.json() as T, response };
  } finally {
    clearTimeout(timer);
  }
}

function sendWocError(res: ExpressResponse, err: unknown): void {
  if (err instanceof WocError && err.status === 404) {
    res.status(404).json({ error: "No matching BSV record was found." });
    return;
  }
  res.status(502).json({ error: "The BSV data provider is temporarily unavailable." });
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : fallback;
}

function summarizeBlock(block: WocBlock) {
  return {
    height: Number(block.height ?? 0),
    hash: String(block.hash ?? ""),
    confirmations: Number(block.confirmations ?? 0),
    timestamp: Number(block.time ?? 0),
    sizeBytes: Number(block.size ?? 0),
    transactionCount: Number(block.txcount ?? block.num_tx ?? block.tx?.length ?? 0),
    miner: typeof block.miner === "string" ? block.miner : null,
    previousBlockHash: typeof block.previousblockhash === "string" ? block.previousblockhash : null,
  };
}

async function getBlock(height: number): Promise<WocBlock> {
  const key = `block:${height}`;
  const cached = getCached<WocBlock>(key);
  if (cached) return cached;
  const { data } = await fetchWoc<WocBlock>(`/block/height/${height}`);
  if (!data || Number(data.height) !== height || !data.hash) {
    throw new WocError(404, "Block not found");
  }
  setCached(key, data, 30_000);
  return data;
}

async function getRecentBlock(height: number): Promise<WocBlock> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await getBlock(height);
    } catch (error) {
      const retryable = error instanceof WocError
        ? error.status === 429 || error.status >= 500
        : true;
      if (!retryable || attempt === 1) throw error;
      const delayMs = error instanceof WocError && error.retryAfterMs > 0
        ? error.retryAfterMs
        : error instanceof WocError && error.status === 429
          ? 1_200
          : 350;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Recent block lookup failed.");
}

async function getRecentBlocks(heights: number[]): Promise<WocBlock[]> {
  const blocks = new Array<WocBlock | undefined>(heights.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(2, heights.length) }, async () => {
    while (nextIndex < heights.length) {
      const index = nextIndex++;
      try {
        blocks[index] = await getRecentBlock(heights[index]);
      } catch {
        // Keep good blocks when the public provider rate-limits one lookup.
      }
    }
  });
  await Promise.all(workers);
  return blocks.filter((block): block is WocBlock => Boolean(block));
}

/** GET /api/explorer/blocks — small, cached window of recent BSV blocks. */
router.get("/explorer/blocks", async (req, res) => {
  const limit = Math.min(12, Math.max(1, boundedInt(req.query.limit, 8, 12)));
  const cacheKey = `recent-blocks:${BSV_NET.network}:${limit}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json(cached);
    return;
  }

  const load = async (): Promise<Record<string, unknown>> => {
    const { data: chain } = await fetchWoc<{ blocks?: number; bestblockhash?: string }>("/chain/info");
    const height = Number(chain.blocks ?? 0);
    if (!Number.isSafeInteger(height) || height <= 0) {
      throw new WocError(503, "BSV chain height is not available yet.");
    }

    const heights = Array.from({ length: limit }, (_, index) => height - index).filter(value => value > 0);
    const fetchedBlocks = await getRecentBlocks(heights);
    if (fetchedBlocks.length === 0) {
      throw new WocError(503, "Recent BSV blocks could not be loaded.");
    }

    const payload = {
      network: BSV_NET.network,
      tipHeight: height,
      bestBlockHash: String(chain.bestblockhash ?? ""),
      blocks: fetchedBlocks.map(summarizeBlock),
      source: "WhatsOnChain",
      updatedAt: new Date().toISOString(),
    };
    setCached(cacheKey, payload, fetchedBlocks.length === heights.length ? RECENT_BLOCKS_CACHE_TTL_MS : 20_000);
    recentBlocksStaleCache.set(cacheKey, { value: payload, expiresAt: Date.now() + RECENT_BLOCKS_STALE_TTL_MS });
    return payload;
  };

  try {
    let request = recentBlocksInFlight.get(cacheKey);
    if (!request) {
      request = load().finally(() => recentBlocksInFlight.delete(cacheKey));
      recentBlocksInFlight.set(cacheKey, request);
    }
    const payload = await request;
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=180");
    res.json(payload);
  } catch (err) {
    const stale = recentBlocksStaleCache.get(cacheKey);
    if (stale && stale.expiresAt > Date.now()) {
      res.setHeader("Cache-Control", "public, max-age=15");
      res.json(stale.value);
      return;
    }
    sendWocError(res, err);
  }
});

/** GET /api/explorer/block/:height — bounded, paginated transaction IDs for a block. */
router.get("/explorer/block/:height", async (req, res) => {
  const height = Number(req.params.height);
  const limit = Math.min(100, Math.max(1, boundedInt(req.query.limit, 50, 100)));
  const offset = boundedInt(req.query.offset, 0, 10_000_000);
  if (!Number.isSafeInteger(height) || height < 0) {
    res.status(400).json({ error: "Block height must be a non-negative integer." });
    return;
  }

  try {
    const block = await getBlock(height);
    const firstPage = Array.isArray(block.tx) ? block.tx.filter(txid => /^[a-f0-9]{64}$/i.test(txid)) : [];
    const total = Number(block.txcount ?? block.num_tx ?? firstPage.length);
    const pageSize = Math.max(1, Number(block.pages?.size ?? 50_000));
    const transactions: string[] = [];
    let cursor = offset;

    if (cursor < firstPage.length) {
      const take = Math.min(limit, firstPage.length - cursor);
      transactions.push(...firstPage.slice(cursor, cursor + take));
      cursor += take;
    }

    while (transactions.length < limit && cursor < total) {
      const extendedOffset = Math.max(0, cursor - firstPage.length);
      const providerPage = Math.floor(extendedOffset / pageSize) + 1;
      const pageCount = block.pages?.uri?.length ?? 0;
      if (providerPage > pageCount) break;
      const { data: pageTxids } = await fetchWoc<string[]>(
        `/block/hash/${encodeURIComponent(String(block.hash))}/page/${providerPage}`,
      );
      if (!Array.isArray(pageTxids) || pageTxids.length === 0) break;
      const pageOffset = extendedOffset % pageSize;
      const chunk = pageTxids.slice(pageOffset, pageOffset + (limit - transactions.length))
        .filter(txid => /^[a-f0-9]{64}$/i.test(txid));
      if (chunk.length === 0) break;
      transactions.push(...chunk);
      cursor += chunk.length;
    }

    res.setHeader("Cache-Control", "public, max-age=15");
    res.json({
      block: summarizeBlock(block),
      transactions,
      offset,
      limit,
      totalTransactions: total,
      hasMore: offset + transactions.length < total && offset < 10_000_000,
    });
  } catch (err) {
    sendWocError(res, err);
  }
});

/** GET /api/explorer/tx/:txid — validated transaction details, without raw scripts. */
router.get("/explorer/tx/:txid", async (req, res) => {
  const txid = String(req.params.txid ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(txid)) {
    res.status(400).json({ error: "Transaction ID must be 64 hexadecimal characters." });
    return;
  }
  const cacheKey = `tx:${BSV_NET.network}:${txid}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(cached);
    return;
  }

  try {
    const { data } = await fetchWoc<Record<string, any>>(`/tx/hash/${txid}`);
    if (String(data.txid ?? data.hash ?? "").toLowerCase() !== txid) {
      res.status(404).json({ error: "No matching BSV transaction was found." });
      return;
    }
    const inputs = Array.isArray(data.vin) ? data.vin.map((input: any) => ({
      txid: typeof input.txid === "string" ? input.txid : null,
      outputIndex: Number.isInteger(input.vout) ? input.vout : null,
      coinbase: typeof input.coinbase === "string",
      addresses: Array.isArray(input.prevout?.scriptPubKey?.addresses)
        ? input.prevout.scriptPubKey.addresses.filter((address: unknown) => typeof address === "string")
        : [],
    })) : [];
    const outputs = Array.isArray(data.vout) ? data.vout.map((output: any) => ({
      index: Number(output.n ?? 0),
      valueBsv: Number(output.value ?? 0),
      addresses: Array.isArray(output.scriptPubKey?.addresses)
        ? output.scriptPubKey.addresses.filter((address: unknown) => typeof address === "string")
        : [],
      type: typeof output.scriptPubKey?.type === "string" ? output.scriptPubKey.type : null,
    })) : [];
    const payload = {
      txid,
      blockHeight: data.blockheight == null || !Number.isFinite(Number(data.blockheight))
        ? null : Number(data.blockheight),
      blockHash: typeof data.blockhash === "string" ? data.blockhash : null,
      confirmations: Number.isFinite(Number(data.confirmations)) ? Number(data.confirmations) : 0,
      timestamp: data.time == null && data.blocktime == null
        ? null
        : Number.isFinite(Number(data.time ?? data.blocktime))
          ? Number(data.time ?? data.blocktime)
          : null,
      sizeBytes: Number.isFinite(Number(data.size)) ? Number(data.size) : 0,
      inputs,
      outputs,
      totalOutputBsv: outputs.reduce((sum: number, output: { valueBsv: number }) => sum + output.valueBsv, 0),
      explorerUrl: `${BSV_NET.explorer}/tx/${txid}`,
    };
    setCached(cacheKey, payload, 30_000);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(payload);
  } catch (err) {
    sendWocError(res, err);
  }
});

/** GET /api/explorer/address/:address/history — confirmed BSV activity by address. */
router.get("/explorer/address/:address/history", async (req, res) => {
  const address = String(req.params.address ?? "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(address)) {
    res.status(400).json({ error: "Enter a valid BSV address." });
    return;
  }
  const limit = Math.min(50, Math.max(1, boundedInt(req.query.limit, 25, 50)));
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (token && (token.length > 512 || /[\u0000-\u001f\u007f]/.test(token))) {
    res.status(400).json({ error: "Invalid address-history page token." });
    return;
  }

  try {
    const query = new URLSearchParams({ order: "desc", limit: String(limit) });
    if (token) query.set("token", token);
    const { data, response } = await fetchWoc<Record<string, any>>(
      `/address/${encodeURIComponent(address)}/confirmed/history?${query.toString()}`,
    );
    const items = Array.isArray(data.result) ? data.result
      .filter((item: any) => /^[a-f0-9]{64}$/i.test(String(item.tx_hash ?? "")))
      .map((item: any) => ({
        txid: String(item.tx_hash).toLowerCase(),
        blockHeight: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
      })) : [];
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json({
      address,
      items,
      nextToken: String(data.nextPageToken ?? response.headers.get("next-page") ?? "") || null,
      source: "WhatsOnChain",
    });
  } catch (err) {
    sendWocError(res, err);
  }
});

/** GET /api/explorer/activity — recent exchange events with personal fields omitted. */
router.get("/explorer/activity", async (req, res) => {
  const limit = Math.min(50, Math.max(1, boundedInt(req.query.limit, 25, 50)));
  const offset = Math.min(2_000, boundedInt(req.query.offset, 0, 2_000));
  const scanLimit = offset + limit + 1;

  try {
    const result = await pool.query<{
      id: string;
      category: string;
      summary: string;
      status: string;
      pair: string | null;
      amount: string | null;
      asset: string | null;
      network: string | null;
      txid: string | null;
      block_height: number | null;
      created_at: Date;
    }>(
      `WITH activity AS (
        SELECT md5('trade:' || t.id) AS id, 'Trade'::text AS category,
               t.side || ' ' || t.symbol AS summary, 'completed'::text AS status,
               t.symbol AS pair, t.quantity::text AS amount,
               split_part(t.symbol, '/', 1) AS asset, 'Exchange'::text AS network,
               CASE WHEN t.txid ~* '^[a-f0-9]{64}$' THEN lower(t.txid) ELSE NULL END AS txid,
               NULL::integer AS block_height, t.timestamp::timestamptz AS created_at
          FROM (SELECT id, side, symbol, quantity, txid, timestamp
                  FROM trades ORDER BY timestamp DESC LIMIT $1) t
        UNION ALL
        SELECT md5('order:' || o.id), 'Order'::text,
               o.side || ' ' || o.symbol, o.status, o.symbol, o.quantity::text,
               split_part(o.symbol, '/', 1), COALESCE(o.network_type, 'exchange'),
               CASE WHEN o.txid ~* '^[a-f0-9]{64}$' THEN lower(o.txid) ELSE NULL END,
               NULL::integer, o.created_at::timestamptz
          FROM (SELECT id, side, symbol, status, quantity, network_type, txid, created_at
                  FROM orders ORDER BY created_at DESC LIMIT $1) o
        UNION ALL
        SELECT md5('withdrawal:' || w.id::text), 'Withdrawal'::text,
               w.asset || ' withdrawal', w.status, NULL::text, w.amount::text,
               w.asset, w.network,
               CASE
                 WHEN w.arc_txid ~* '^[a-f0-9]{64}$' THEN lower(w.arc_txid)
                 WHEN w.txid ~* '^[a-f0-9]{64}$' THEN lower(w.txid)
                 ELSE NULL
               END,
               NULL::integer, w.created_at::timestamptz
          FROM (SELECT id, asset, status, amount, network, arc_txid, txid, created_at
                  FROM withdrawal_requests ORDER BY created_at DESC LIMIT $1) w
        UNION ALL
        SELECT md5('deposit:' || d.txid), 'BSV deposit'::text,
               'BSV deposit', d.status, NULL::text, (d.amount_sat::numeric / 100000000)::text,
               'BSV', 'BSV', lower(d.txid), d.block_height, d.detected_at
          FROM (SELECT txid, bsv_address, status, amount_sat, block_height, detected_at
                  FROM bsv_pending_deposits ORDER BY detected_at DESC LIMIT $1) d
        UNION ALL
        SELECT md5('htlc:' || h.id), 'Bridge lock'::text, 'BSV bridge lock',
               h.status, NULL::text, h.amount_bsv::text, 'BSV', 'BSV',
               CASE WHEN h.funding_txid ~* '^[a-f0-9]{64}$' THEN lower(h.funding_txid) ELSE NULL END,
               h.created_at_block, h.created_at::timestamptz
          FROM (SELECT id, status, amount_bsv, funding_txid, created_at_block, created_at
                  FROM htlc_locks ORDER BY created_at DESC LIMIT $1) h
        UNION ALL
        SELECT md5('intent:' || i.id || ':' || tx.kind), 'Bridge intent · ' || tx.kind,
               i.token_in || ' → ' || i.token_out, i.status,
               i.token_in || '/' || i.token_out,
               (i.amount_in_sat::numeric / 100000000)::text, i.token_in, 'BSV',
               lower(tx.txid), NULL::integer, i.created_at::timestamptz
          FROM (SELECT id, token_in, token_out, status, amount_in_sat, funding_txid,
                       claim_txid, refund_txid, audit_txid, arc_txid, created_at
                  FROM bsv_intent_sessions ORDER BY created_at DESC LIMIT $1) i
          CROSS JOIN LATERAL (VALUES
            ('funding'::text, i.funding_txid),
            ('claim'::text, i.claim_txid),
            ('refund'::text, i.refund_txid),
            ('audit'::text, i.audit_txid),
            ('ARC'::text, i.arc_txid)
          ) AS tx(kind, txid)
         WHERE tx.txid IS NOT NULL AND tx.txid ~* '^[a-f0-9]{64}$'
        UNION ALL
        SELECT md5('evm-bsv:' || s.id), 'EVM → BSV swap'::text,
               s.token_in || ' → BSV', s.status, s.token_in || '/BSV',
               s.estimated_bsv_out, 'BSV', 'BSV', lower(s.solver_bsv_txid),
               NULL::integer, s.created_at::timestamptz
          FROM (SELECT id, token_in, status, estimated_bsv_out, solver_bsv_txid, created_at
                  FROM evm_to_bsv_swaps ORDER BY created_at DESC LIMIT $1) s
         WHERE s.solver_bsv_txid ~* '^[a-f0-9]{64}$'
        UNION ALL
        SELECT md5('external-swap:' || s.id), 'External swap'::text,
               s.from_coin || ' → ' || s.to_coin, s.status,
               s.from_coin || '/' || s.to_coin, s.from_amount::text,
               s.from_coin, s.venue,
               CASE WHEN s.venue_tx_id ~* '^[a-f0-9]{64}$' THEN lower(s.venue_tx_id) ELSE NULL END,
               NULL::integer, s.created_at::timestamptz
          FROM (SELECT id, from_coin, to_coin, status, from_amount, venue, venue_tx_id, created_at
                  FROM external_swaps ORDER BY created_at DESC LIMIT $1) s
         UNION ALL
         SELECT md5('copy-trade:' || c.id), 'Copy trade'::text,
                c.side || ' ' || c.symbol, c.status, c.symbol, c.quantity::text,
                c.symbol, 'Exchange'::text,
                CASE WHEN c.txid ~* '^[a-f0-9]{64}$' THEN lower(c.txid) ELSE NULL END,
                NULL::integer, c.executed_at::timestamptz
           FROM (SELECT id, symbol, side, quantity, txid, status, executed_at
                   FROM copy_vault_trades ORDER BY executed_at DESC LIMIT $1) c
         UNION ALL
         SELECT md5('le-swap:' || l.id), 'LetsExchange swap'::text,
                l.coin_from || ' → ' || l.coin_to, l.status,
                l.coin_from || '/' || l.coin_to, l.deposit_amount::text,
                l.coin_from, COALESCE(l.network_from, 'External'),
                NULL::text, NULL::integer, l.created_at::timestamptz
           FROM (SELECT id, coin_from, coin_to, network_from, deposit_amount, status, created_at
                   FROM le_swaps ORDER BY created_at DESC LIMIT $1) l
         UNION ALL
         SELECT md5('creator-trade:' || t.id), 'Community token trade'::text,
                COALESCE(NULLIF(c.symbol, ''), 'Community token') || ' ' || t.trade_type,
                'completed'::text, COALESCE(NULLIF(c.symbol, ''), 'Community token'),
                t.bsv_amount::text, 'BSV'::text, 'OrahDEX'::text,
                NULL::text, NULL::integer, t.created_at::timestamptz
           FROM (SELECT id, coin_creator, trade_type, bsv_amount, created_at
                   FROM coin_trades ORDER BY created_at DESC LIMIT $1) t
           LEFT JOIN creator_coins c ON lower(c.creator_address) = lower(t.coin_creator)
         UNION ALL
         SELECT md5('nft-activity:' || n.id), 'NFT marketplace'::text,
                'NFT ' || n.type, 'recorded'::text, NULL::text,
                n.price::text, n.currency,
                CASE WHEN lower(COALESCE(n.chain, '')) LIKE '%bsv%' THEN 'BSV' ELSE n.chain END,
                CASE WHEN n.tx_hash ~* '^[a-f0-9]{64}$' THEN lower(n.tx_hash) ELSE NULL END,
                NULL::integer, n.created_at::timestamptz
           FROM (SELECT id, type, price, currency, tx_hash, chain, created_at
                   FROM nft_activity ORDER BY created_at DESC LIMIT $1) n
         UNION ALL
         SELECT md5('social-nft-mint:' || m.id), 'Social NFT mint'::text,
                'Social NFT minted', 'completed'::text, NULL::text,
                m.price::text, m.currency,
                CASE WHEN lower(COALESCE(p.chain, '')) LIKE '%bsv%' THEN 'BSV' ELSE p.chain END,
                CASE WHEN m.tx_hash ~* '^[a-f0-9]{64}$' THEN lower(m.tx_hash) ELSE NULL END,
                NULL::integer, m.created_at::timestamptz
           FROM (SELECT id, post_id, price, currency, tx_hash, created_at
                   FROM post_mints ORDER BY created_at DESC LIMIT $1) m
           LEFT JOIN social_posts p ON p.id = m.post_id
        UNION ALL
        SELECT md5('overlay:' || r.txid), 'OrahDEX settlement'::text,
               'OrahDEX on-chain settlement',
               CASE WHEN r.block_height IS NULL THEN 'observed' ELSE 'confirmed' END,
               NULL::text, NULL::text, 'BSV', 'BSV', lower(r.txid),
               r.block_height, r.indexed_at
          FROM (SELECT txid, block_height, indexed_at
                  FROM overlay_records ORDER BY indexed_at DESC LIMIT $1) r
      )
      SELECT id, category, summary, status, pair, amount, asset, network,
             txid, block_height, created_at
        FROM activity
       ORDER BY created_at DESC, id ASC
       LIMIT $2 OFFSET $3`,
      [scanLimit, limit + 1, offset],
    );
    const hasMore = result.rows.length > limit && offset + limit < 2_000;
    const items = result.rows.slice(0, limit).map(row => ({
      id: row.id,
      category: row.category,
      summary: row.summary,
      status: row.status,
      pair: row.pair,
      amount: row.amount,
      asset: row.asset,
      network: row.network,
      txid: row.txid,
      blockHeight: row.block_height,
      createdAt: row.created_at,
       onChain: Boolean(row.txid && row.network?.toLowerCase() === "bsv"),
    }));
    res.setHeader("Cache-Control", "public, max-age=10, stale-while-revalidate=20");
    res.json({ items, limit, offset, hasMore, scope: "public exchange activity" });
  } catch {
    res.status(500).json({ error: "Exchange activity is temporarily unavailable." });
  }
});

export default router;
