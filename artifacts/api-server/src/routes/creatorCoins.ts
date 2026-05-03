import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { issueTradeChallenge, verifyTradeSignature } from "../lib/walletAuth.js";
import { isInternalEvmWallet } from "../lib/internalEvmWallet.js";

function isEvmAddress(s: unknown): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}

const router: IRouter = Router();
function uid() { return crypto.randomUUID(); }

/* ── Constants ──────────────────────────────────────────────────────────────── */
const BSV_USD = 16; // rough peg for display
const INIT_VIRTUAL_BSV = 30;
// Bonding-curve virtual reserve: TOTAL_SUPPLY + 73_000_191 buffer
// (matches pump.fun-style initialisation — this is NOT a credential)
const TOTAL_SUPPLY = 1_000_000_000;
const INIT_VIRTUAL_TOKENS = TOTAL_SUPPLY + 73_000_191;
const POSTGRES_UNDEFINED_COLUMN_ERROR = "42703";


/* ── Multi-asset payment helpers ───────────────────────────────────────────── */
/**
 * Look up live USD price for an asset symbol from the markets table.
 * Returns null if the asset has no USD pair (caller should reject the trade).
 * BSV always returns the rough peg used elsewhere in this module.
 */
async function getAssetUsdPrice(symbol: string): Promise<number | null> {
  const s = symbol.toUpperCase();
  if (s === "USDT" || s === "USDC" || s === "USD") return 1;
  // Prefer USDT pair, fall back to USDC.
  const { rows } = await pool.query(
    `SELECT last_price FROM markets
     WHERE base_asset = $1 AND quote_asset IN ('USDT','USDC')
     ORDER BY CASE quote_asset WHEN 'USDT' THEN 0 ELSE 1 END
     LIMIT 1`,
    [s],
  );
  const px = parseFloat(rows[0]?.last_price ?? "0");
  return Number.isFinite(px) && px > 0 ? px : null;
}

/* ── vAMM helpers ──────────────────────────────────────────────────────────── */
function calcBuy(vBsv: number, vTok: number, bsvIn: number) {
  const fee = bsvIn * 0.01;
  const bsvAfterFee = bsvIn - fee;
  const k = vBsv * vTok;
  const newVBsv = vBsv + bsvAfterFee;
  const newVTok = k / newVBsv;
  const tokensOut = vTok - newVTok;
  const pricePerToken = bsvIn / tokensOut;
  return { tokensOut: Math.floor(tokensOut), newVBsv, newVTok, fee, pricePerToken };
}

function calcSell(vBsv: number, vTok: number, tokensIn: number) {
  const k = vBsv * vTok;
  const newVTok = vTok + tokensIn;
  const newVBsv = k / newVTok;
  const rawBsv = vBsv - newVBsv;
  const fee = rawBsv * 0.01;
  const bsvOut = rawBsv - fee;
  const pricePerToken = rawBsv / tokensIn;
  return { bsvOut, newVBsv, newVTok, fee, pricePerToken };
}

type SqlClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  release: () => void;
};

async function resolveColumn(
  client: SqlClient,
  table: string,
  candidates: string[],
): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = ANY($2::text[])`,
    [table, candidates],
  );
  const available = new Set((rows as Array<{ column_name: string }>).map((r) => r.column_name));
  for (const col of candidates) {
    if (available.has(col)) return col;
  }
  return null;
}

/* ── GET /social/creators ─────────────────────────────────────────────────── */
router.get("/social/creators", async (req, res) => {

  try {
    const { q, sort = "market_cap" } = req.query as Record<string, string>;
    const offset = parseInt((req.query.offset as string) ?? "0", 10);
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "20", 10), 50);

    let where = "WHERE 1=1";
    const params: any[] = [];
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (cp.username ILIKE $${params.length} OR cp.bio ILIKE $${params.length})`;
    }

    const orderBy = sort === "newest" ? "cp.created_at DESC" : sort === "followers" ? "cp.follower_count DESC" : "cc.market_cap_usd DESC";
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT cp.*, cc.symbol, cc.name as coin_name, cc.price_usd, cc.market_cap_usd, cc.ath_usd, cc.volume_24h_usd, cc.holder_count, cc.circulating_supply, cc.virtual_bsv, cc.virtual_tokens, cc.price_bsv
       FROM creator_profiles cp
       LEFT JOIN creator_coins cc ON cp.address = cc.creator_address
       ${where} ORDER BY ${orderBy} LIMIT $${params.length-1} OFFSET $${params.length}`,
      params,
    );
    res.json({ creators: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/creators/:address ───────────────────────────────────────── */
router.get("/social/creators/:address", async (req, res) => {

  try {
    const { address } = req.params;
    const { rows: profiles } = await pool.query(
      `SELECT cp.*, cc.symbol, cc.name as coin_name, cc.price_usd, cc.market_cap_usd, cc.ath_usd, cc.volume_24h_usd, cc.holder_count, cc.trade_count, cc.circulating_supply, cc.virtual_bsv, cc.virtual_tokens, cc.price_bsv, cc.total_supply
       FROM creator_profiles cp
       LEFT JOIN creator_coins cc ON cp.address = cc.creator_address
       WHERE cp.address = $1`, [address],
    );

    if (!profiles.length) {
      // auto-create profile
      await pool.query(
        `INSERT INTO creator_profiles (address, username) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [address, address.slice(0, 10)],
      );
      const symbol = address.slice(2, 7).toUpperCase();
      await pool.query(
        `INSERT INTO creator_coins (creator_address, symbol, name, virtual_bsv, virtual_tokens) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [address, symbol, `${symbol} Creator Coin`, INIT_VIRTUAL_BSV, INIT_VIRTUAL_TOKENS],
      );
      const { rows: newProfile } = await pool.query(
        `SELECT cp.*, cc.symbol, cc.name as coin_name, cc.price_usd, cc.market_cap_usd, cc.ath_usd, cc.virtual_bsv, cc.virtual_tokens, cc.price_bsv, cc.holder_count, cc.circulating_supply, cc.total_supply
         FROM creator_profiles cp LEFT JOIN creator_coins cc ON cp.address = cc.creator_address WHERE cp.address = $1`, [address],
      );
      const { rows: posts } = await pool.query("SELECT * FROM social_posts WHERE creator = $1 ORDER BY created_at DESC", [address]);
      const profile = newProfile[0] ?? null;
      if (profile) profile.post_count = posts.length;
      res.json({ profile, posts, topHolders: [], trades: [] });
      return;
    }

    const [{ rows: posts }, { rows: topHolders }, { rows: trades }, { rows: nftStats }, { rows: nftHolders }] = await Promise.all([
      pool.query("SELECT * FROM social_posts WHERE creator = $1 ORDER BY created_at DESC", [address]),
      pool.query("SELECT holder, amount FROM coin_holdings WHERE coin_creator = $1 ORDER BY amount DESC LIMIT 5", [address]),
      pool.query("SELECT * FROM coin_trades WHERE coin_creator = $1 ORDER BY created_at DESC LIMIT 20", [address]),
      // NFT market cap: sum of (mint_count * mint_price_usd) across all posts
      pool.query(
        `SELECT COALESCE(SUM(mint_count * mint_price_usd), 0) AS nft_market_cap_usd
         FROM social_posts WHERE creator = $1`, [address],
      ),
      // NFT holders: distinct minters across all creator's posts
      pool.query(
        `SELECT COUNT(DISTINCT pm.minter) AS nft_holder_count
         FROM post_mints pm
         JOIN social_posts sp ON pm.post_id = sp.id
         WHERE sp.creator = $1`, [address],
      ),
    ]);

    const nftMarketCap = parseFloat(nftStats[0]?.nft_market_cap_usd ?? 0);
    const nftHolderCount = parseInt(nftHolders[0]?.nft_holder_count ?? 0, 10);

    const raw = profiles[0];
    const profile = {
      ...raw,
      post_count: posts.length,
      // If DEX coin has no market cap yet, use NFT mint value instead
      market_cap_usd: (raw.market_cap_usd > 0 ? raw.market_cap_usd : 0) + nftMarketCap,
      ath_usd: Math.max(raw.ath_usd ?? 0, nftMarketCap),
      // If DEX coin has no holders yet, show NFT buyers instead
      holder_count: Math.max(raw.holder_count ?? 0, nftHolderCount),
    };
    res.json({ profile, posts, topHolders, trades });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/creators/:address/update ────────────────────────────────── */
router.post("/social/creators/:address/update", async (req, res) => {
  try {
    const addr = (req.params.address ?? "").toLowerCase();
    if (!addr) return res.status(400).json({ error: "address required" });
    const body = req.body as Record<string, string | null | undefined>;
    // Treat undefined as "leave alone"; treat empty string / null as "explicit clear".
    const norm = (v: string | null | undefined) =>
      v === undefined ? undefined : (v === null || v === "" ? null : v);
    const fields = {
      username:  norm(body.username),
      bio:       norm(body.bio),
      avatar_url:norm(body.avatar_url),
      cover_url: norm(body.cover_url),
      website:   norm(body.website),
      twitter:   norm(body.twitter),
      instagram: norm(body.instagram),
    };
    // Update by lowercased address (canonical) — collapses any case-variant rows.
    const sets: string[] = []; const vals: unknown[] = [addr]; let i = 2;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    if (sets.length === 0) return res.json({ success: true });
    sets.push("updated_at = NOW()");

    const { rowCount } = await pool.query(
      `UPDATE creator_profiles SET ${sets.join(", ")} WHERE LOWER(address) = $1`,
      vals,
    );
    if (rowCount === 0) {
      // First-time profile create
      await pool.query(
        `INSERT INTO creator_profiles (address, username, bio, avatar_url, cover_url, website, twitter, instagram)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (address) DO NOTHING`,
        [addr, fields.username, fields.bio, fields.avatar_url, fields.cover_url, fields.website, fields.twitter, fields.instagram],
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("creator update failed:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* ── POST /social/trade/challenge ─────────────────────────────────────────── */
// Mint a single-use, 5-minute signing challenge for a creator-coin trade.
// External EVM wallets must sign this and pass nonce+signature to /trade.
router.post("/social/trade/challenge", (req, res) => {
  try {
    const { walletAddress, creator, side, amount, asset } = req.body as Record<string, any>;
    if (!isEvmAddress(walletAddress)) { res.status(400).json({ error: "walletAddress must be a 0x… EVM address" }); return; }
    if (!isEvmAddress(creator) && typeof creator !== "string") { res.status(400).json({ error: "creator is required" }); return; }
    if (side !== "buy" && side !== "sell") { res.status(400).json({ error: "side must be buy or sell" }); return; }
    const amt = String(amount ?? "");
    if (!amt || !Number.isFinite(parseFloat(amt))) { res.status(400).json({ error: "amount is required" }); return; }
    const a = String(asset ?? "BSV").toUpperCase();
    const challenge = issueTradeChallenge({ walletAddress, creator: String(creator), side, amount: amt, asset: a });
    res.json(challenge);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to issue challenge" });
  }
});

/* ── POST /social/creators/:address/trade ─────────────────────────────────── */
router.post("/social/creators/:address/trade", async (req, res) => {
  try {
    // ── Require a signed challenge for external EVM traders ────────────────
    const reqTrader = (req.body as any)?.trader;
    if (isEvmAddress(reqTrader)) {
      const internal = await isInternalEvmWallet(reqTrader);
      const sig   = (req.body as any)?.signature;
      const nonce = (req.body as any)?.nonce;
      if (!internal) {
        if (typeof sig !== "string" || typeof nonce !== "string") {
          const recheck = await isInternalEvmWallet(reqTrader);
          if (!recheck) {
            res.status(401).json({ error: "Signed challenge required. Call POST /api/social/trade/challenge first." });
            return;
          }
        } else {
          const side = (req.body as any)?.trade_type;
          const amount = side === "buy"
            ? String((req.body as any)?.bsv_amount ?? "")
            : String((req.body as any)?.token_amount ?? "");
          const asset = String((req.body as any)?.payment_asset ?? "BSV").toUpperCase();
          try {
            verifyTradeSignature({
              walletAddress: reqTrader, nonce, signature: sig,
              creator: req.params.address, side, amount, asset,
            });
          } catch (e: any) {
            res.status(401).json({ error: e?.message ?? "Invalid signature" });
            return;
          }
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { address } = req.params;
      const { trader, trade_type, bsv_amount, token_amount, payment_asset } = req.body as Record<string, any>;
      const payAsset = String(payment_asset ?? "BSV").toUpperCase();
      // Conversion ratio: 1 unit of payAsset = `payAssetPerBsv` BSV.
      // For payAsset = BSV this is 1. For others we use live USD prices.
      let payAssetPerBsv = 1;
      if (payAsset !== "BSV") {
        const [payUsd, bsvUsd] = await Promise.all([getAssetUsdPrice(payAsset), getAssetUsdPrice("BSV")]);
        if (!payUsd || !bsvUsd) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `No live price for ${payAsset} or BSV` });
          return;
        }
        payAssetPerBsv = payUsd / bsvUsd;
      }
      if (!trader || !trade_type) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "trader and trade_type required" });
        return;
      }
      if (trade_type !== "buy" && trade_type !== "sell") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid trade_type" });
        return;
      }

      const { rows: coins } = await client.query("SELECT * FROM creator_coins WHERE creator_address = $1", [address]);
      if (!coins.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Coin not found" });
        return;
      }
      const coin = coins[0];

      const vBsv = parseFloat(coin.virtual_bsv);
      const vTok = parseFloat(coin.virtual_tokens);
      const circulating = parseFloat(coin.circulating_supply);

      let newVBsv: number, newVTok: number, tokensExchanged: number, bsvExchanged: number, pricePerToken: number;

      if (trade_type === "buy") {
        // Client sends `bsv_amount` as the amount in payAsset units (named for legacy reasons).
        const payIn = parseFloat(String(bsv_amount));
        if (!Number.isFinite(payIn) || payIn <= 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "amount must be greater than 0" });
          return;
        }
        const bsvIn = payIn * payAssetPerBsv;

        const { rows: bsvRows } = await client.query(
          // Seeded funds are demo liquidity and should not be spendable by users.
          `SELECT GREATEST(0, available - COALESCE(seeded, 0)) AS available
           FROM user_balances
           WHERE wallet_address = $1 AND asset_symbol = $2
          FOR UPDATE`,
          [trader, payAsset],
        );
        if (!bsvRows.length) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `Insufficient ${payAsset} balance` });
          return;
        }
        const availablePay = parseFloat((bsvRows[0] as { available?: string } | undefined)?.available ?? "0");
        if (availablePay < payIn) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `Insufficient ${payAsset} balance` });
          return;
        }

        const calc = calcBuy(vBsv, vTok, bsvIn);
        newVBsv = calc.newVBsv; newVTok = calc.newVTok;
        tokensExchanged = calc.tokensOut; bsvExchanged = bsvIn;
        pricePerToken = calc.pricePerToken;

        await client.query(
          `UPDATE user_balances
           SET available = available - $1, updated_at = NOW()
           WHERE wallet_address = $2 AND asset_symbol = $3`,
          [payIn.toFixed(18), trader, payAsset],
        );

        // update holding
        await client.query(
          `INSERT INTO coin_holdings (id, coin_creator, holder, amount, avg_buy_price_bsv)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (coin_creator, holder) DO UPDATE SET
             amount = coin_holdings.amount + EXCLUDED.amount,
             avg_buy_price_bsv = (coin_holdings.avg_buy_price_bsv * coin_holdings.amount + EXCLUDED.avg_buy_price_bsv * EXCLUDED.amount) / (coin_holdings.amount + EXCLUDED.amount),
             updated_at = NOW()`,
          [uid(), address, trader, tokensExchanged, pricePerToken.toFixed(12)],
        );
      } else {
        const tokensIn = parseFloat(String(token_amount));
        if (!Number.isFinite(tokensIn) || tokensIn <= 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "token_amount must be greater than 0" });
          return;
        }

        const { rows: holdingRows } = await client.query(
          `SELECT amount
           FROM coin_holdings
           WHERE coin_creator = $1 AND holder = $2
          FOR UPDATE`,
          [address, trader],
        );
        if (!holdingRows.length) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Insufficient token balance" });
          return;
        }
        const held = parseFloat((holdingRows[0] as { amount?: string } | undefined)?.amount ?? "0");
        if (held < tokensIn) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Insufficient token balance" });
          return;
        }

        const calc = calcSell(vBsv, vTok, tokensIn);
        newVBsv = calc.newVBsv; newVTok = calc.newVTok;
        tokensExchanged = tokensIn; bsvExchanged = calc.bsvOut;
        pricePerToken = calc.pricePerToken;

        await client.query(
          `UPDATE coin_holdings SET amount = amount - $1, updated_at = NOW()
            WHERE coin_creator = $2 AND holder = $3`,
          [tokensExchanged, address, trader],
        );

        // Credit proceeds in the same payment asset the user is trading with.
        const payOut = bsvExchanged / payAssetPerBsv;
        await client.query(
          `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
           VALUES ($1, $3, $2, '0', NOW())
           ON CONFLICT (wallet_address, asset_symbol)
           DO UPDATE SET available = user_balances.available + $2, updated_at = NOW()`,
          [trader, payOut.toFixed(18), payAsset],
        );
      }

      const newPrice = newVBsv / newVTok;
      const newPriceUsd = newPrice * BSV_USD;
      const newCirculating = trade_type === "buy" ? circulating + tokensExchanged : circulating - tokensExchanged;
      const newMcap = (newPriceUsd * newCirculating).toFixed(2);
      const newAth = Math.max(parseFloat(coin.ath_usd ?? "0"), newPriceUsd);

      const { rows: holdersCount } = await client.query(
        "SELECT COUNT(*) as cnt FROM coin_holdings WHERE coin_creator = $1 AND amount > 0", [address],
      );

      await client.query(
        `UPDATE creator_coins SET virtual_bsv = $1, virtual_tokens = $2, price_bsv = $3, price_usd = $4,
         market_cap_usd = $5, ath_usd = $6, circulating_supply = $7,
         volume_24h_usd = volume_24h_usd + $8, trade_count = trade_count + 1,
         holder_count = $9 WHERE creator_address = $10`,
        [newVBsv.toFixed(8), Math.floor(newVTok), newPrice.toFixed(12), newPriceUsd.toFixed(8),
         newMcap, newAth.toFixed(8), Math.max(0, newCirculating), (bsvExchanged * BSV_USD).toFixed(2),
         holdersCount[0].cnt, address],
      );

      await client.query(
        `INSERT INTO coin_trades (id, coin_creator, trader, trade_type, bsv_amount, token_amount, price_bsv, price_usd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uid(), address, trader, trade_type, bsvExchanged.toFixed(8), tokensExchanged, newPrice.toFixed(12), newPriceUsd.toFixed(8)],
      );

      await client.query("COMMIT");
      res.json({
        success: true,
        tokensExchanged,
        bsvExchanged: bsvExchanged.toFixed(8),
        newPrice: newPriceUsd,
        newMarketCap: newMcap,
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      logger.error({ err, address: req.params.address }, "Creator coin trade failed");
      res.status(500).json({ error: "Trade failed" });
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.error({ err, address: req.params.address }, "Creator coin trade connection failed");
    res.status(500).json({ error: "Trade failed" });
  }
});

/* ── GET /social/quote/:address ───────────────────────────────────────────── */
router.get("/social/quote/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const { type = "buy", bsv_amount, token_amount } = req.query as Record<string, string>;
    const { rows: coins } = await pool.query("SELECT * FROM creator_coins WHERE creator_address = $1", [address]);
    if (!coins.length) { res.status(404).json({ error: "Coin not found" }); return; }
    const coin = coins[0];
    const vBsv = parseFloat(coin.virtual_bsv);
    const vTok = parseFloat(coin.virtual_tokens);

    const payAsset = String((req.query.payment_asset as string) ?? "BSV").toUpperCase();
    let payAssetPerBsv = 1;
    if (payAsset !== "BSV") {
      const [payUsd, bsvUsd] = await Promise.all([getAssetUsdPrice(payAsset), getAssetUsdPrice("BSV")]);
      if (!payUsd || !bsvUsd) { res.status(400).json({ error: `No live price for ${payAsset}` }); return; }
      payAssetPerBsv = payUsd / bsvUsd;
    }

    if (type === "buy") {
      const payIn = parseFloat(bsv_amount ?? "0.01");
      const bsvIn = payIn * payAssetPerBsv;
      const calc = calcBuy(vBsv, vTok, bsvIn);
      res.json({ tokensOut: calc.tokensOut, fee: calc.fee, priceImpact: (bsvIn / vBsv * 100).toFixed(2) });
    } else {
      const tokensIn = parseFloat(token_amount ?? "1000000");
      const calc = calcSell(vBsv, vTok, tokensIn);
      const payOut = calc.bsvOut / payAssetPerBsv;
      res.json({ bsvOut: payOut.toFixed(18), fee: calc.fee, priceImpact: (tokensIn / vTok * 100).toFixed(2) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/follow ──────────────────────────────────────────────────── */
router.post("/social/follow", async (req, res) => {
  try {
    const { follower, following } = req.body as Record<string, string>;
    if (!follower || !following) { res.status(400).json({ error: "follower and following required" }); return; }

    const { rows: existing } = await pool.query(
      "SELECT id FROM social_follows WHERE follower = $1 AND following = $2", [follower, following],
    );
    if (existing.length > 0) {
      await pool.query("DELETE FROM social_follows WHERE follower = $1 AND following = $2", [follower, following]);
      await pool.query("UPDATE creator_profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE address = $1", [following]);
      await pool.query("UPDATE creator_profiles SET following_count = GREATEST(0, following_count - 1) WHERE address = $1", [follower]);
      res.json({ following: false });
    } else {
      await pool.query("INSERT INTO social_follows (id, follower, following) VALUES ($1,$2,$3)", [uid(), follower, following]);
      await pool.query("UPDATE creator_profiles SET follower_count = follower_count + 1 WHERE address = $1", [following]);
      await pool.query("UPDATE creator_profiles SET following_count = following_count + 1 WHERE address = $1", [follower]);
      res.json({ following: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/creators/:address/holders ──────────────────────────────── */
router.get("/social/creators/:address/holders", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.holder, ch.amount, cp.username
       FROM coin_holdings ch
       LEFT JOIN creator_profiles cp ON ch.holder = cp.address
       WHERE ch.coin_creator = $1 AND ch.amount > 0
       ORDER BY ch.amount DESC LIMIT 50`, [req.params.address],
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/creators/:address/followers ─────────────────────────────── */
router.get("/social/creators/:address/followers", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sf.follower as address, cp.username, cp.avatar_url, cp.is_verified
       FROM social_follows sf
       LEFT JOIN creator_profiles cp ON sf.follower = cp.address
       WHERE sf.following = $1
       ORDER BY sf.created_at DESC LIMIT 100`, [req.params.address],
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/creators/:address/following ─────────────────────────────── */
router.get("/social/creators/:address/following", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sf.following as address, cp.username, cp.avatar_url, cp.is_verified
       FROM social_follows sf
       LEFT JOIN creator_profiles cp ON sf.following = cp.address
       WHERE sf.follower = $1
       ORDER BY sf.created_at DESC LIMIT 100`, [req.params.address],
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/holdings/:address ───────────────────────────────────────── */
router.get("/social/holdings/:address", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.*, cp.username, cc.symbol, cc.price_usd, cc.market_cap_usd
       FROM coin_holdings ch
       JOIN creator_profiles cp ON ch.coin_creator = cp.address
       JOIN creator_coins cc ON ch.coin_creator = cc.creator_address
       WHERE ch.holder = $1 AND ch.amount > 0
       ORDER BY (ch.amount::numeric * cc.price_usd::numeric) DESC`, [req.params.address],
    );
    res.json({ holdings: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/holdings/:holderAddress/coin/:creatorAddress ─────────────── */
router.get("/social/holdings/:holderAddress/coin/:creatorAddress", async (req, res) => {
  try {
    const { holderAddress, creatorAddress } = req.params;
    const { rows } = await pool.query(
      "SELECT amount FROM coin_holdings WHERE holder = $1 AND coin_creator = $2",
      [holderAddress, creatorAddress],
    );
    res.json({ amount: parseFloat(rows[0]?.amount ?? "0") });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/search ───────────────────────────────────────────────────── */
router.get("/social/search", async (req, res) => {

  try {
    const { q = "" } = req.query as Record<string, string>;
    const term = `%${q}%`;
    const [{ rows: creators }, { rows: posts }] = await Promise.all([
      pool.query(
        `SELECT cp.address, cp.username, cp.avatar_url, cp.is_verified, cp.follower_count,
                cc.symbol, cc.price_usd, cc.market_cap_usd
         FROM creator_profiles cp LEFT JOIN creator_coins cc ON cp.address = cc.creator_address
         WHERE cp.username ILIKE $1 OR cp.bio ILIKE $1 LIMIT 10`, [term],
      ),
      pool.query(
        `SELECT id, title, image_url, mint_price, mint_currency, creator_name, is_verified, mint_count
         FROM social_posts WHERE title ILIKE $1 OR description ILIKE $1 OR creator_name ILIKE $1
         ORDER BY mint_count DESC LIMIT 10`, [term],
      ),
    ]);
    res.json({ creators, posts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/trending-coins ──────────────────────────────────────────── */
router.get("/social/trending-coins", async (req, res) => {

  try {
    const { rows } = await pool.query(
      `SELECT cp.address, cp.username, cp.avatar_url, cp.is_verified,
              cc.symbol, cc.price_usd, cc.market_cap_usd, cc.volume_24h_usd, cc.holder_count, cc.trade_count
       FROM creator_profiles cp JOIN creator_coins cc ON cp.address = cc.creator_address
       ORDER BY cc.volume_24h_usd DESC LIMIT 20`,
    );
    res.json({ coins: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── DELETE /social/creators/:address ────────────────────────────────────── */
router.delete("/social/creators/:address", async (req, res) => {
  let client: SqlClient | null = null;
  try {
    client = await pool.connect() as SqlClient;
    const { address } = req.params;
    const { confirm } = req.body as Record<string, string>;
    if (confirm !== "DELETE") {
      res.status(400).json({ error: "Confirmation required — send { confirm: 'DELETE' }" });
      return;
    }
    await client.query("BEGIN");

    const postOwnerColumn = await resolveColumn(client, "social_posts", ["creator", "author"]);
    const commentAuthorColumn = await resolveColumn(client, "post_comments", ["wallet_address", "author"]);

    await client.query("DELETE FROM social_follows WHERE follower = $1 OR following = $1", [address]);
    await client.query("DELETE FROM post_likes WHERE wallet_address = $1", [address]);
    await client.query("DELETE FROM post_mints WHERE minter = $1", [address]);

    if (commentAuthorColumn) {
      if (commentAuthorColumn === "wallet_address") {
        await client.query("DELETE FROM post_comments WHERE wallet_address = $1", [address]);
      } else if (commentAuthorColumn === "author") {
        await client.query("DELETE FROM post_comments WHERE author = $1", [address]);
      }
    }

    if (postOwnerColumn) {
      if (postOwnerColumn === "creator") {
        await client.query(
          `DELETE FROM post_likes WHERE post_id IN (SELECT id FROM social_posts WHERE creator = $1)`,
          [address],
        );
        await client.query(
          `DELETE FROM post_mints WHERE post_id IN (SELECT id FROM social_posts WHERE creator = $1)`,
          [address],
        );
        await client.query(
          `DELETE FROM post_comments WHERE post_id IN (SELECT id FROM social_posts WHERE creator = $1)`,
          [address],
        );
        await client.query("DELETE FROM social_posts WHERE creator = $1", [address]);
      } else if (postOwnerColumn === "author") {
        await client.query(
          `DELETE FROM post_likes WHERE post_id IN (SELECT id FROM social_posts WHERE author = $1)`,
          [address],
        );
        await client.query(
          `DELETE FROM post_mints WHERE post_id IN (SELECT id FROM social_posts WHERE author = $1)`,
          [address],
        );
        await client.query(
          `DELETE FROM post_comments WHERE post_id IN (SELECT id FROM social_posts WHERE author = $1)`,
          [address],
        );
        await client.query("DELETE FROM social_posts WHERE author = $1", [address]);
      }
    }

    await client.query("DELETE FROM coin_holdings WHERE holder = $1 OR coin_creator = $1", [address]);
    await client.query("DELETE FROM creator_coins WHERE creator_address = $1", [address]);
    await client.query("DELETE FROM creator_profiles WHERE address = $1", [address]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK");
    logger.error({ err }, "delete creator profile failed");
    res.status(500).json({ error: err?.message });
  } finally {
    client?.release();
  }
});

export default router;
