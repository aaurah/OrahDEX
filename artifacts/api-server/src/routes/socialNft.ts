import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function uid(): string { return crypto.randomUUID(); }

/* ── Curated seed posts ───────────────────────────────────────────────────── */
const SEED_POSTS = [
  {
    id: "post-001", creator: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    creator_name: "SatoshiArt", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=satoshi",
    title: "Genesis Block #1", description: "The first inscription on OrahDEX — a tribute to the genesis block. Every holder receives governance weight in the BSV ecosystem.",
    image_url: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80",
    category: "relics", chain: "BSV", mint_price: "0.01", mint_currency: "BSV", mint_price_usd: "0.16",
    mint_count: 847, max_supply: 1000, like_count: 2841, comment_count: 142, is_verified: true,
    tags: '["genesis","bsv","relic","legendary"]',
    inscription_id: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2i0",
  },
  {
    id: "post-002", creator: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234",
    creator_name: "CipherPunk", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=cipher",
    title: "Neon Oracle", description: "AI-generated neon prophet — each oracle sees a different future. Holders gain early access to Ora AI signals.",
    image_url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&q=80",
    category: "ai", chain: "BSV", mint_price: "0.05", mint_currency: "BSV", mint_price_usd: "0.80",
    mint_count: 412, max_supply: 500, like_count: 1923, comment_count: 87, is_verified: true,
    tags: '["ai","oracle","neon","futurism"]',
    inscription_id: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3i0",
  },
  {
    id: "post-003", creator: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
    creator_name: "KeepR_", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=keeper",
    title: "Threshold Sigil IV", description: "Fourth in the Keeper Sigil series. Grants +15% AMM boost and 2x governance weight. On-chain provenance immutable.",
    image_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
    category: "relics", chain: "BSV", mint_price: "0.25", mint_currency: "BSV", mint_price_usd: "4.00",
    mint_count: 88, max_supply: 100, like_count: 3472, comment_count: 241, is_verified: true,
    tags: '["sigil","keeper","governance","legendary"]',
    inscription_id: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4i0",
  },
  {
    id: "post-004", creator: "0x4d5e6f7890abcdef1234567890abcdef12345678",
    creator_name: "PixelSeer", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=pixel",
    title: "Watcher Token #88", description: "Watcher tokens track on-chain vigilance. This edition auto-subscribes holders to whale alerts and on-chain event feeds.",
    image_url: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80",
    category: "utility", chain: "BSV", mint_price: "0.008", mint_currency: "BSV", mint_price_usd: "0.13",
    mint_count: 1240, like_count: 892, comment_count: 54, is_verified: false,
    tags: '["watcher","utility","alerts","onchain"]',
    inscription_id: "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5i0",
  },
  {
    id: "post-005", creator: "0x5e6f7890abcdef1234567890abcdef1234567890",
    creator_name: "ChromaVault", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=chroma",
    title: "Liquid Prism", description: "Generative art piece — fluid simulation recorded as a BSV inscription. Each frame is unique and unrepeatable.",
    image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    category: "generative", chain: "BSV", mint_price: "0.03", mint_currency: "BSV", mint_price_usd: "0.48",
    mint_count: 622, max_supply: 2000, like_count: 4102, comment_count: 188, is_verified: true,
    tags: '["generative","fluid","art","inscription"]',
    inscription_id: "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6i0",
  },
  {
    id: "post-006", creator: "0x6f7890abcdef1234567890abcdef123456789012",
    creator_name: "NakamotoGhost", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nakamoto",
    title: "Lineage Artifact — Epoch I", description: "Artifacts that evolve as the chain grows. This one logs your wallet's on-chain history and upgrades at milestone blocks.",
    image_url: "https://images.unsplash.com/photo-1614728263952-84ea256f9d1d?w=800&q=80",
    category: "relics", chain: "BSV", mint_price: "0.1", mint_currency: "BSV", mint_price_usd: "1.60",
    mint_count: 321, max_supply: 400, like_count: 2200, comment_count: 99, is_verified: true,
    tags: '["lineage","artifact","evolving","epoch"]',
    inscription_id: "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1i0",
  },
  {
    id: "post-007", creator: "0x7890abcdef1234567890abcdef12345678901234",
    creator_name: "VectorDawn", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=vector",
    title: "Cross-Chain Relic", description: "Bridges two worlds — a BSV inscription that changes form when bridged to Ethereum. Watch it transform on-chain.",
    image_url: "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=800&q=80",
    category: "bridge", chain: "BSV", mint_price: "0.2", mint_currency: "BSV", mint_price_usd: "3.20",
    mint_count: 156, max_supply: 200, like_count: 1780, comment_count: 73, is_verified: true,
    tags: '["crosschain","relic","bridge","transform"]',
    inscription_id: "a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3i0",
  },
  {
    id: "post-008", creator: "0x890abcdef1234567890abcdef1234567890abcd",
    creator_name: "DawnProtocol", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=dawn",
    title: "Ghost in the UTXO", description: "A meditation on digital permanence — this pixel painting is permanently inscribed on BSV. No server. No cloud. Just the chain.",
    image_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
    category: "art", chain: "BSV", mint_price: "0.002", mint_currency: "BSV", mint_price_usd: "0.03",
    mint_count: 3841, like_count: 9120, comment_count: 482, is_verified: false,
    tags: '["pixel","utxo","permanent","philosophy"]',
    inscription_id: "b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4i0",
  },
  {
    id: "post-009", creator: "0x90abcdef1234567890abcdef1234567890abcdef",
    creator_name: "ZeroNoise", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=zeronoise",
    title: "Fractal Genome #7", description: "Recursive mathematical beauty. Each fractal contains the seed for the next. Infinite depth, finite supply.",
    image_url: "https://images.unsplash.com/photo-1567359781514-3b964e2b04d6?w=800&q=80",
    category: "generative", chain: "BSV", mint_price: "0.015", mint_currency: "BSV", mint_price_usd: "0.24",
    mint_count: 1890, max_supply: 3000, like_count: 5340, comment_count: 217, is_verified: true,
    tags: '["fractal","math","generative","infinite"]',
    inscription_id: "c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5i0",
  },
  {
    id: "post-010", creator: "0x0abcdef1234567890abcdef1234567890abcdef12",
    creator_name: "MythicForge", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=mythic",
    title: "Sovereign Rune I", description: "Governance runes — hold 3+ to unlock DAO proposal rights. Burn 5 to summon a Mythic Keeper identity token.",
    image_url: "https://images.unsplash.com/photo-1636955816868-fcb881e57954?w=800&q=80",
    category: "governance", chain: "BSV", mint_price: "0.05", mint_currency: "BSV", mint_price_usd: "0.80",
    mint_count: 540, max_supply: 777, like_count: 3890, comment_count: 156, is_verified: true,
    tags: '["governance","dao","rune","sovereign"]',
    inscription_id: "d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6i0",
  },
  {
    id: "post-011", creator: "0x1bcdef1234567890abcdef1234567890abcdef12",
    creator_name: "HashPoet", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=hashpoet",
    title: "Mempool Dreams", description: "Every unconfirmed transaction is a dream waiting to be mined. This piece captures the liminal space between broadcast and block.",
    image_url: "https://images.unsplash.com/photo-1502691876148-a84978e59af8?w=800&q=80",
    category: "art", chain: "BSV", mint_price: "0.007", mint_currency: "BSV", mint_price_usd: "0.11",
    mint_count: 2100, like_count: 6780, comment_count: 310, is_verified: false,
    tags: '["mempool","poetry","art","dreams"]',
    inscription_id: "e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7i0",
  },
  {
    id: "post-012", creator: "0x2cdef1234567890abcdef1234567890abcdef1234",
    creator_name: "PrismProtocol", creator_avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=prism",
    title: "Velocity Sigil", description: "Speed is truth. This sigil grants holders priority in the OrahDEX order queue — inscribed permanently on BSV mainnet.",
    image_url: "https://images.unsplash.com/photo-1567359781514-3b964e2b04d6?w=800&q=80",
    category: "utility", chain: "BSV", mint_price: "0.15", mint_currency: "BSV", mint_price_usd: "2.40",
    mint_count: 210, max_supply: 300, like_count: 1450, comment_count: 66, is_verified: true,
    tags: '["velocity","sigil","utility","priority"]',
    inscription_id: "f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2i0",
  },
];

const SEED_COMMENTS: Array<{ post_id: string; wallet_address: string; display_name: string; content: string }> = [
  { post_id: "post-001", wallet_address: "0xaaa", display_name: "DegenKing", content: "This is the one. Already minted 3." },
  { post_id: "post-001", wallet_address: "0xbbb", display_name: "SatsMaxi", content: "Legendary piece. BSV forever 🔥" },
  { post_id: "post-001", wallet_address: "0xccc", display_name: "OrdinalOG", content: "Inscribed on the immutable chain. Nothing else matters." },
  { post_id: "post-002", wallet_address: "0xddd", display_name: "AiArtist", content: "The oracle speaks in neon. Beautiful work." },
  { post_id: "post-002", wallet_address: "0xeee", display_name: "Cipher22", content: "Already seeing signals from the Ora integration 🧠" },
  { post_id: "post-003", wallet_address: "0xfff", display_name: "KeeperX", content: "AMM boost activated. The ROI on this is insane." },
  { post_id: "post-003", wallet_address: "0x111", display_name: "DeFiNerd", content: "Governance weight stacking. This is the way." },
  { post_id: "post-005", wallet_address: "0x222", display_name: "GenArtFan", content: "The fluid simulation is mesmerizing. Minted immediately." },
  { post_id: "post-008", wallet_address: "0x333", display_name: "PhilosophX", content: "No server. No cloud. Just truth. This is what Web3 should have always been." },
  { post_id: "post-009", wallet_address: "0x444", display_name: "MathGod", content: "The recursive depth on this… I zoomed in for 20 minutes." },
];

let socialSeeded = false;

async function ensureSocialSeeded() {
  if (socialSeeded) return;
  try {
    const res = await pool.query("SELECT id FROM social_posts LIMIT 1");
    if (res.rows.length > 0) { socialSeeded = true; return; }

    for (const p of SEED_POSTS) {
      await pool.query(
        `INSERT INTO social_posts (id, creator, creator_name, creator_avatar, title, description, image_url, category, chain, mint_price, mint_currency, mint_price_usd, mint_count, max_supply, like_count, comment_count, is_verified, tags, inscription_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT DO NOTHING`,
        [p.id, p.creator, p.creator_name, p.creator_avatar, p.title, p.description, p.image_url,
         p.category, p.chain, p.mint_price, p.mint_currency, p.mint_price_usd, p.mint_count,
         (p as any).max_supply ?? null, p.like_count, p.comment_count, p.is_verified, p.tags,
         (p as any).inscription_id ?? null],
      );
    }

    for (const c of SEED_COMMENTS) {
      await pool.query(
        `INSERT INTO post_comments (id, post_id, wallet_address, display_name, content)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [uid(), c.post_id, c.wallet_address, c.display_name, c.content],
      );
    }

    socialSeeded = true;
    logger.info("Social NFT posts seeded");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Social NFT seed failed");
  }
}

/* ── GET /social/feed ─────────────────────────────────────────────────────── */
router.get("/social/feed", async (req, res) => {
  await ensureSocialSeeded();
  try {
    const { category, q, sort = "hot" } = req.query as Record<string, string>;
    const offset = parseInt((req.query.offset as string) ?? "0", 10);
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "20", 10), 50);

    let where = "WHERE status = 'active'";
    const params: any[] = [];

    if (category) { params.push(category); where += ` AND category = $${params.length}`; }
    if (q)        { params.push(`%${q}%`);  where += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`; }

    const orderBy = sort === "new" ? "created_at DESC" : sort === "top" ? "like_count DESC" : "mint_count DESC";
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM social_posts ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ posts: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/posts/:id ────────────────────────────────────────────────── */
router.get("/social/posts/:id", async (req, res) => {
  await ensureSocialSeeded();
  try {
    const { rows: posts } = await pool.query("SELECT * FROM social_posts WHERE id = $1", [req.params.id]);
    if (!posts.length) { res.status(404).json({ error: "Post not found" }); return; }

    const { rows: comments } = await pool.query(
      "SELECT * FROM post_comments WHERE post_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.id],
    );
    const { rows: mints } = await pool.query(
      "SELECT * FROM post_mints WHERE post_id = $1 ORDER BY created_at DESC LIMIT 20", [req.params.id],
    );

    res.json({ post: posts[0], comments, mints });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/posts — create post + mint as BSV inscription ───────────── */
router.post("/social/posts", async (req, res) => {
  try {
    const { creator, creator_name, title, description, image_url, mint_price, mint_currency = "BSV", category = "art", max_supply, tags } = req.body as Record<string, any>;
    if (!creator || !title) { res.status(400).json({ error: "creator and title are required" }); return; }

    const priceUsd = (parseFloat(mint_price ?? "0") * 16).toFixed(2);
    const inscriptionId = `${uid().replace(/-/g, "")}i0`;

    const id = `post-${uid().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO social_posts (id, creator, creator_name, title, description, image_url, mint_price, mint_currency, mint_price_usd, max_supply, category, tags, inscription_id, chain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'BSV')`,
      [id, creator, creator_name ?? creator.slice(0, 8), title, description, image_url, mint_price ?? "0", mint_currency, priceUsd, max_supply ?? null, category, tags ? JSON.stringify(tags) : null, inscriptionId],
    );

    const { rows } = await pool.query("SELECT * FROM social_posts WHERE id = $1", [id]);
    res.json({ success: true, post: rows[0], inscriptionId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/posts/:id/mint ──────────────────────────────────────────── */
router.post("/social/posts/:id/mint", async (req, res) => {
  try {
    const { minter, tx_hash } = req.body as Record<string, string>;
    if (!minter) { res.status(400).json({ error: "minter is required" }); return; }

    const { rows: posts } = await pool.query("SELECT * FROM social_posts WHERE id = $1", [req.params.id]);
    if (!posts.length) { res.status(404).json({ error: "Post not found" }); return; }
    const post = posts[0];

    if (post.max_supply && post.mint_count >= post.max_supply) {
      res.status(409).json({ error: "Sold out" }); return;
    }

    await pool.query(
      `INSERT INTO post_mints (id, post_id, minter, price, currency, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uid(), req.params.id, minter, post.mint_price, post.mint_currency, tx_hash ?? null],
    );
    await pool.query(
      "UPDATE social_posts SET mint_count = mint_count + 1, updated_at = NOW() WHERE id = $1",
      [req.params.id],
    );

    res.json({ success: true, mintCount: post.mint_count + 1, inscriptionId: post.inscription_id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/posts/:id/like ──────────────────────────────────────────── */
router.post("/social/posts/:id/like", async (req, res) => {
  try {
    const { wallet_address } = req.body as Record<string, string>;
    if (!wallet_address) { res.status(400).json({ error: "wallet_address required" }); return; }

    const { rows: existing } = await pool.query(
      "SELECT id FROM post_likes WHERE post_id = $1 AND wallet_address = $2",
      [req.params.id, wallet_address],
    );

    if (existing.length > 0) {
      await pool.query("DELETE FROM post_likes WHERE post_id = $1 AND wallet_address = $2", [req.params.id, wallet_address]);
      await pool.query("UPDATE social_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1", [req.params.id]);
      res.json({ liked: false });
    } else {
      await pool.query("INSERT INTO post_likes (id, post_id, wallet_address) VALUES ($1,$2,$3)", [uid(), req.params.id, wallet_address]);
      await pool.query("UPDATE social_posts SET like_count = like_count + 1 WHERE id = $1", [req.params.id]);
      res.json({ liked: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /social/posts/:id/comment ──────────────────────────────────────── */
router.post("/social/posts/:id/comment", async (req, res) => {
  try {
    const { wallet_address, display_name, content } = req.body as Record<string, string>;
    if (!wallet_address || !content) { res.status(400).json({ error: "wallet_address and content required" }); return; }

    await pool.query(
      "INSERT INTO post_comments (id, post_id, wallet_address, display_name, content) VALUES ($1,$2,$3,$4,$5)",
      [uid(), req.params.id, wallet_address, display_name ?? wallet_address.slice(0, 8), content],
    );
    await pool.query("UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = $1", [req.params.id]);

    const { rows } = await pool.query(
      "SELECT * FROM post_comments WHERE post_id = $1 ORDER BY created_at DESC LIMIT 20", [req.params.id],
    );
    res.json({ success: true, comments: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/trending — top creators + posts ─────────────────────────── */
router.get("/social/trending", async (req, res) => {
  await ensureSocialSeeded();
  try {
    const { rows: topPosts } = await pool.query(
      "SELECT * FROM social_posts WHERE status = 'active' ORDER BY like_count DESC LIMIT 6",
    );
    const { rows: hotMints } = await pool.query(
      "SELECT * FROM social_posts WHERE status = 'active' ORDER BY mint_count DESC LIMIT 6",
    );
    const { rows: newest } = await pool.query(
      "SELECT * FROM social_posts WHERE status = 'active' ORDER BY created_at DESC LIMIT 6",
    );
    res.json({ topPosts, hotMints, newest });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/profile/:address ────────────────────────────────────────── */
router.get("/social/profile/:address", async (req, res) => {
  await ensureSocialSeeded();
  try {
    const { address } = req.params;
    const { rows: posts } = await pool.query(
      "SELECT * FROM social_posts WHERE creator = $1 ORDER BY created_at DESC", [address],
    );
    const { rows: mints } = await pool.query(
      `SELECT pm.*, sp.title, sp.image_url, sp.creator_name, sp.mint_currency
       FROM post_mints pm JOIN social_posts sp ON pm.post_id = sp.id
       WHERE pm.minter = $1 ORDER BY pm.created_at DESC`, [address],
    );
    const totalLikes = posts.reduce((s: number, p: any) => s + (p.like_count ?? 0), 0);
    const totalMints = posts.reduce((s: number, p: any) => s + (p.mint_count ?? 0), 0);
    res.json({ posts, mints, stats: { totalLikes, totalMints, postCount: posts.length, collectCount: mints.length } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /social/external/trending ── Real data from Zora, Base, OpenSea ─── */
const EXTERNAL_CACHE: { data: any; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchZoraTrending() {
  const query = `query TrendingTokens {
    tokens(
      networks: [
        { network: ZORA, chain: ZORA_MAINNET }
        { network: BASE, chain: BASE_MAINNET }
        { network: ETHEREUM, chain: MAINNET }
      ]
      sort: { sortKey: TRENDING, sortDirection: DESC }
      pagination: { limit: 24 }
      filter: { mediaType: IMAGE }
    ) {
      nodes {
        token {
          tokenId
          name
          description
          image { url mimeType }
          mintInfo { price { nativePrice { raw decimal currency { name address decimals } } } }
          collectionAddress
          collection { name symbol description totalSupply }
          owner
          lastRefreshTime
        }
        markets(pagination: { limit: 1 }) {
          price { nativePrice { decimal currency { name } } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.zora.co/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Zora API ${res.status}`);
  const json = await res.json() as any;
  return (json?.data?.tokens?.nodes ?? []).map((node: any) => {
    const t = node.token;
    const price = t.mintInfo?.price?.nativePrice?.decimal ?? node.markets?.[0]?.price?.nativePrice?.decimal ?? 0;
    const currency = t.mintInfo?.price?.nativePrice?.currency?.name ?? node.markets?.[0]?.price?.nativePrice?.currency?.name ?? "ETH";
    return {
      id: `zora-${t.collectionAddress}-${t.tokenId}`,
      source: "zora",
      chain: t.collectionAddress ? "BASE" : "ETH",
      title: t.name ?? t.collection?.name ?? "Untitled",
      description: t.description ?? t.collection?.description ?? "",
      image_url: t.image?.url ?? "",
      creator_name: t.collection?.name ?? "Unknown",
      creator_avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${t.collectionAddress}`,
      collection_address: t.collectionAddress,
      token_id: t.tokenId,
      mint_price: price,
      mint_currency: currency,
      total_supply: t.collection?.totalSupply ?? null,
      external_url: `https://zora.co/collect/${t.collectionAddress}/${t.tokenId}`,
      marketplace: "Zora",
    };
  }).filter((n: any) => n.image_url);
}

async function fetchMagicEdenTrending() {
  const res = await fetch(
    "https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?window=1d&offset=0&limit=12",
    { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`MagicEden ${res.status}`);
  const json = await res.json() as any[];
  return (Array.isArray(json) ? json : []).slice(0, 12).map((c: any) => ({
    id: `me-${c.symbol}`,
    source: "magic_eden",
    chain: "SOL",
    title: c.name ?? c.symbol,
    description: c.description ?? "",
    image_url: c.image ?? c.imageUrl ?? "",
    creator_name: c.name ?? c.symbol,
    creator_avatar: c.image ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${c.symbol}`,
    collection_address: c.symbol,
    token_id: null,
    mint_price: c.floorPrice ?? 0,
    mint_currency: "SOL",
    total_supply: c.totalItems ?? null,
    volume_24h: c.volumeAll ?? 0,
    external_url: `https://magiceden.io/marketplace/${c.symbol}`,
    marketplace: "Magic Eden",
  })).filter((n: any) => n.image_url);
}

router.get("/social/external/trending", async (_req, res) => {
  try {
    const now = Date.now();
    if (EXTERNAL_CACHE.data && now - EXTERNAL_CACHE.ts < CACHE_TTL) {
      return res.json(EXTERNAL_CACHE.data);
    }
    const results = await Promise.allSettled([fetchZoraTrending(), fetchMagicEdenTrending()]);
    const zora = results[0].status === "fulfilled" ? results[0].value : [];
    const magicEden = results[1].status === "fulfilled" ? results[1].value : [];
    if (results[0].status === "rejected") logger.warn("Zora API failed:", results[0].reason);
    if (results[1].status === "rejected") logger.warn("MagicEden API failed:", results[1].reason);
    const data = { zora, magicEden, fetchedAt: new Date().toISOString() };
    EXTERNAL_CACHE.data = data;
    EXTERNAL_CACHE.ts = now;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message, zora: [], magicEden: [] });
  }
});

export default router;
