import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
function uid() { return crypto.randomUUID(); }

/* ── Constants ──────────────────────────────────────────────────────────────── */
const BSV_USD = 16; // rough peg for display
const INIT_VIRTUAL_BSV = 30;
// Bonding-curve virtual reserve: TOTAL_SUPPLY + 73_000_191 buffer
// (matches pump.fun-style initialisation — this is NOT a credential)
const TOTAL_SUPPLY = 1_000_000_000;
const INIT_VIRTUAL_TOKENS = TOTAL_SUPPLY + 73_000_191;

/* ── Seed data ──────────────────────────────────────────────────────────────── */
const SEED_CREATORS = [
  {
    address: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    username: "SatoshiArt", bio: "Aura is the presence you feel before the words arrive — calm power, quiet confidence. I build sovereign art on BSV, each one a trace of who I am and who I'm becoming.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=satoshi",
    cover_url: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=60",
    website: "OrahDEX.org", twitter: "satoshiart", instagram: "satoshiart.bsv", is_verified: true,
    follower_count: 12400, following_count: 318, post_count: 521,
    coin: { symbol: "SART", name: "SatoshiArt Coin", circ: 42_000_000, vbsv: 31.8, vtok: 1_031_000_191, price_usd: 0.00014, mcap: 5890, ath: 34100, holders: 135, trades: 2418, vol: 8820 },
  },
  {
    address: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234",
    username: "CipherPunk", bio: "Neon prophet. AI signal weaver. Every oracle sees a different future. BSV inscription artist.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=cipher",
    cover_url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&q=60",
    website: "", twitter: "cipherpunkbsv", instagram: "", is_verified: true,
    follower_count: 8920, following_count: 241, post_count: 312,
    coin: { symbol: "CIPHR", name: "CipherPunk Coin", circ: 28_500_000, vbsv: 30.9, vtok: 1_044_500_191, price_usd: 0.000088, mcap: 2508, ath: 12200, holders: 88, trades: 1102, vol: 3410 },
  },
  {
    address: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
    username: "KeepR_", bio: "Threshold keeper. AMM guardian. Governance sigil crafter on the immutable BSV chain.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=keeper",
    cover_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=60",
    website: "keepr.bsv", twitter: "keepr_bsv", instagram: "keepr.bsv", is_verified: true,
    follower_count: 21700, following_count: 89, post_count: 188,
    coin: { symbol: "KEEPR", name: "KeepR Coin", circ: 71_200_000, vbsv: 34.2, vtok: 1_001_800_191, price_usd: 0.00051, mcap: 36312, ath: 89400, holders: 312, trades: 5821, vol: 42100 },
  },
  {
    address: "0x4d5e6f7890abcdef1234567890abcdef12345678",
    username: "PixelSeer", bio: "On-chain watcher. I track every block, every tx. Pixel by pixel, I paint the truth of the chain.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=pixel",
    cover_url: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=60",
    website: "", twitter: "pixelseer", instagram: "", is_verified: false,
    follower_count: 3840, following_count: 512, post_count: 94,
    coin: { symbol: "PXLSR", name: "PixelSeer Coin", circ: 8_100_000, vbsv: 30.22, vtok: 1_064_900_191, price_usd: 0.0000285, mcap: 231, ath: 1880, holders: 29, trades: 341, vol: 510 },
  },
  {
    address: "0x5e6f7890abcdef1234567890abcdef1234567890",
    username: "ChromaVault", bio: "Generative art. Fluid simulation. Infinite forms. Each piece an inscription, each inscription a breath.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=chroma",
    cover_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=60",
    website: "chromavault.art", twitter: "chromavault", instagram: "chromavault.nft", is_verified: true,
    follower_count: 16200, following_count: 156, post_count: 407,
    coin: { symbol: "CHRMA", name: "ChromaVault Coin", circ: 55_400_000, vbsv: 32.7, vtok: 1_017_600_191, price_usd: 0.00032, mcap: 17728, ath: 44100, holders: 201, trades: 3912, vol: 22800 },
  },
  {
    address: "0x6f7890abcdef1234567890abcdef123456789012",
    username: "NakamotoGhost", bio: "I am the ghost in the genesis. Lineage artifact builder. My works evolve as the chain grows.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=nakamoto",
    cover_url: "https://images.unsplash.com/photo-1614728263952-84ea256f9d1d?w=800&q=60",
    website: "", twitter: "nakamotoghost", instagram: "", is_verified: true,
    follower_count: 34100, following_count: 44, post_count: 77,
    coin: { symbol: "NKGST", name: "NakamotoGhost Coin", circ: 88_700_000, vbsv: 38.1, vtok: 984_300_191, price_usd: 0.00122, mcap: 108214, ath: 312000, holders: 521, trades: 9210, vol: 88400 },
  },
];

let creatorsSeeded = false;

async function ensureCreatorsSeeded() {
  if (creatorsSeeded) return;
  try {
    const r = await pool.query("SELECT address FROM creator_profiles LIMIT 1");
    if (r.rows.length > 0) { creatorsSeeded = true; return; }
    for (const c of SEED_CREATORS) {
      await pool.query(
        `INSERT INTO creator_profiles (address, username, bio, avatar_url, cover_url, website, twitter, instagram, is_verified, follower_count, following_count, post_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [c.address, c.username, c.bio, c.avatar_url, c.cover_url, c.website, c.twitter, c.instagram, c.is_verified, c.follower_count, c.following_count, c.post_count],
      );
      const cn = c.coin;
      const mcap = (cn.circ * cn.price_usd).toFixed(2);
      await pool.query(
        `INSERT INTO creator_coins (creator_address, symbol, name, circulating_supply, virtual_bsv, virtual_tokens, price_bsv, price_usd, market_cap_usd, ath_usd, volume_24h_usd, holder_count, trade_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [c.address, cn.symbol, cn.name, cn.circ, cn.vbsv, cn.vtok, (cn.price_usd / BSV_USD).toFixed(12), cn.price_usd, mcap, cn.ath / BSV_USD, cn.vol, cn.holders, cn.trades],
      );
      // seed top holders
      for (let i = 0; i < 3; i++) {
        const fakeHolder = `0x${Math.random().toString(16).slice(2).padEnd(40, "0")}`;
        const pct = [0.08, 0.05, 0.03][i];
        await pool.query(
          `INSERT INTO coin_holdings (id, coin_creator, holder, amount, avg_buy_price_bsv) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [uid(), c.address, fakeHolder, Math.floor(cn.circ * pct), (cn.price_usd / BSV_USD * 0.7).toFixed(12)],
        );
      }
    }
    creatorsSeeded = true;
    logger.info("Creator coins seeded");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Creator seed failed");
  }
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

/* ── GET /social/creators ─────────────────────────────────────────────────── */
router.get("/social/creators", async (req, res) => {
  await ensureCreatorsSeeded();
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
  await ensureCreatorsSeeded();
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

    const [{ rows: posts }, { rows: topHolders }, { rows: trades }] = await Promise.all([
      pool.query("SELECT * FROM social_posts WHERE creator = $1 ORDER BY created_at DESC", [address]),
      pool.query("SELECT holder, amount FROM coin_holdings WHERE coin_creator = $1 ORDER BY amount DESC LIMIT 5", [address]),
      pool.query("SELECT * FROM coin_trades WHERE coin_creator = $1 ORDER BY created_at DESC LIMIT 20", [address]),
    ]);

    const profile = { ...profiles[0], post_count: posts.length };
    res.json({ profile, posts, topHolders, trades });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/creators/:address/update ────────────────────────────────── */
router.post("/social/creators/:address/update", async (req, res) => {
  try {
    const { address } = req.params;
    const { username, bio, avatar_url, cover_url, website, twitter, instagram } = req.body as Record<string, string>;
    await pool.query(
      `INSERT INTO creator_profiles (address, username, bio, avatar_url, cover_url, website, twitter, instagram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (address) DO UPDATE SET
         username = COALESCE(EXCLUDED.username, creator_profiles.username),
         bio = COALESCE(EXCLUDED.bio, creator_profiles.bio),
         avatar_url = COALESCE(EXCLUDED.avatar_url, creator_profiles.avatar_url),
         cover_url = COALESCE(EXCLUDED.cover_url, creator_profiles.cover_url),
         website = COALESCE(EXCLUDED.website, creator_profiles.website),
         twitter = COALESCE(EXCLUDED.twitter, creator_profiles.twitter),
         instagram = COALESCE(EXCLUDED.instagram, creator_profiles.instagram),
         updated_at = NOW()`,
      [address, username, bio, avatar_url, cover_url, website, twitter, instagram],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/creators/:address/trade ─────────────────────────────────── */
router.post("/social/creators/:address/trade", async (req, res) => {
  try {
    const { address } = req.params;
    const { trader, trade_type, bsv_amount, token_amount } = req.body as Record<string, any>;
    if (!trader || !trade_type) { res.status(400).json({ error: "trader and trade_type required" }); return; }

    const { rows: coins } = await pool.query("SELECT * FROM creator_coins WHERE creator_address = $1", [address]);
    if (!coins.length) { res.status(404).json({ error: "Coin not found" }); return; }
    const coin = coins[0];

    const vBsv = parseFloat(coin.virtual_bsv);
    const vTok = parseFloat(coin.virtual_tokens);
    const circulating = parseFloat(coin.circulating_supply);

    let newVBsv: number, newVTok: number, tokensExchanged: number, bsvExchanged: number, pricePerToken: number;

    if (trade_type === "buy") {
      const bsvIn = parseFloat(bsv_amount) || 0.01;
      const calc = calcBuy(vBsv, vTok, bsvIn);
      newVBsv = calc.newVBsv; newVTok = calc.newVTok;
      tokensExchanged = calc.tokensOut; bsvExchanged = bsvIn;
      pricePerToken = calc.pricePerToken;

      // update holding
      await pool.query(
        `INSERT INTO coin_holdings (id, coin_creator, holder, amount, avg_buy_price_bsv)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (coin_creator, holder) DO UPDATE SET
           amount = coin_holdings.amount + EXCLUDED.amount,
           avg_buy_price_bsv = (coin_holdings.avg_buy_price_bsv * coin_holdings.amount + EXCLUDED.avg_buy_price_bsv * EXCLUDED.amount) / (coin_holdings.amount + EXCLUDED.amount),
           updated_at = NOW()`,
        [uid(), address, trader, tokensExchanged, pricePerToken.toFixed(12)],
      );
    } else {
      const tokensIn = parseFloat(token_amount) || 1000;
      const calc = calcSell(vBsv, vTok, tokensIn);
      newVBsv = calc.newVBsv; newVTok = calc.newVTok;
      tokensExchanged = tokensIn; bsvExchanged = calc.bsvOut;
      pricePerToken = calc.pricePerToken;

      await pool.query(
        `UPDATE coin_holdings SET amount = GREATEST(0, amount - $1), updated_at = NOW()
         WHERE coin_creator = $2 AND holder = $3`,
        [tokensExchanged, address, trader],
      );
    }

    const newPrice = newVBsv / newVTok;
    const newPriceUsd = newPrice * BSV_USD;
    const newCirculating = trade_type === "buy" ? circulating + tokensExchanged : circulating - tokensExchanged;
    const newMcap = (newPriceUsd * newCirculating).toFixed(2);
    const newAth = Math.max(parseFloat(coin.ath_usd ?? "0"), newPriceUsd);

    const { rows: holdersCount } = await pool.query(
      "SELECT COUNT(*) as cnt FROM coin_holdings WHERE coin_creator = $1 AND amount > 0", [address],
    );

    await pool.query(
      `UPDATE creator_coins SET virtual_bsv = $1, virtual_tokens = $2, price_bsv = $3, price_usd = $4,
       market_cap_usd = $5, ath_usd = $6, circulating_supply = $7,
       volume_24h_usd = volume_24h_usd + $8, trade_count = trade_count + 1,
       holder_count = $9 WHERE creator_address = $10`,
      [newVBsv.toFixed(8), Math.floor(newVTok), newPrice.toFixed(12), newPriceUsd.toFixed(8),
       newMcap, newAth.toFixed(8), Math.max(0, newCirculating), (bsvExchanged * BSV_USD).toFixed(2),
       holdersCount[0].cnt, address],
    );

    await pool.query(
      `INSERT INTO coin_trades (id, coin_creator, trader, trade_type, bsv_amount, token_amount, price_bsv, price_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uid(), address, trader, trade_type, bsvExchanged.toFixed(8), tokensExchanged, newPrice.toFixed(12), newPriceUsd.toFixed(8)],
    );

    res.json({
      success: true,
      tokensExchanged,
      bsvExchanged: bsvExchanged.toFixed(8),
      newPrice: newPriceUsd,
      newMarketCap: newMcap,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
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

    if (type === "buy") {
      const bsvIn = parseFloat(bsv_amount ?? "0.01");
      const calc = calcBuy(vBsv, vTok, bsvIn);
      res.json({ tokensOut: calc.tokensOut, fee: calc.fee, priceImpact: (bsvIn / vBsv * 100).toFixed(2) });
    } else {
      const tokensIn = parseFloat(token_amount ?? "1000000");
      const calc = calcSell(vBsv, vTok, tokensIn);
      res.json({ bsvOut: calc.bsvOut.toFixed(8), fee: calc.fee, priceImpact: (tokensIn / vTok * 100).toFixed(2) });
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
  await ensureCreatorsSeeded();
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
  await ensureCreatorsSeeded();
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

export default router;
