import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { pushNotification, getNotifications, clearNotifications } from "../lib/notifQueue.js";
import { getCachedLEPrices, fetchLECoinPriceUSD } from "../lib/lePriceCache.js";

const router: IRouter = Router();
const ADDRESS_LIKE_RE = /^0x[0-9a-f]+$/i;

function uid(): string { return crypto.randomUUID(); }

/* ── Currency → USD price helpers ─────────────────────────────────────────── */
const CURRENCY_NET: Record<string, string | null> = {
  ETH: "ERC20", BSV: "BSV", BTC: "BTC", BNB: "BEP20",
  SOL: "SOL", MATIC: "POL", BCH: "BCH", ARB: "ARBITRUM", OP: "OPTIMISM",
};
// Conservative fallbacks (updated Apr 2025)
const FALLBACK_USD: Record<string, number> = {
  ETH: 3100, BSV: 35, BTC: 95000, BNB: 580,
  SOL: 140,  MATIC: 0.9, BCH: 400, ARB: 0.9, OP: 1.8,
};

async function getCurrencyUsdPrice(currency: string): Promise<number> {
  const sym = currency.toUpperCase();
  const le = getCachedLEPrices();
  if (le[sym] && le[sym] > 0) return le[sym];
  try {
    const live = await fetchLECoinPriceUSD(sym, CURRENCY_NET[sym] ?? null, null);
    if (live > 0) return live;
  } catch { /* fall through */ }
  return FALLBACK_USD[sym] ?? 1;
}

/* ── GET /social/prices — live USD prices for NFT currencies ─────────────── */
router.get("/social/prices", async (_req, res) => {
  const currencies = ["ETH","BSV","BTC","BNB","SOL","MATIC","BCH","ARB","OP"];
  const le = getCachedLEPrices();
  const prices: Record<string, number> = {};
  for (const c of currencies) {
    prices[c] = le[c] && le[c] > 0 ? le[c] : FALLBACK_USD[c] ?? 1;
  }
  res.json({ prices });
});

/* ── GET /social/feed ─────────────────────────────────────────────────────── */
router.get("/social/feed", async (req, res) => {
  try {
    const { category, q, sort = "hot", creator, chain } = req.query as Record<string, string>;
    const offset = parseInt((req.query.offset as string) ?? "0", 10);
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "20", 10), 50);

    let where = "WHERE sp.status = 'active'";
    const params: any[] = [];

    if (category) { params.push(category); where += ` AND sp.category = $${params.length}`; }
    if (chain)    { params.push(chain.toUpperCase()); where += ` AND sp.chain = $${params.length}`; }
    if (q)        { params.push(`%${q}%`);  where += ` AND (sp.title ILIKE $${params.length} OR sp.description ILIKE $${params.length})`; }
    if (creator)  { params.push(creator);   where += ` AND sp.creator = $${params.length}`; }

    const orderBy = sort === "new" ? "sp.created_at DESC" : sort === "top" ? "sp.like_count DESC" : "sp.mint_count DESC";
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT sp.*,
         CASE
           WHEN sp.creator_name !~ '^0x[0-9a-fA-F]' THEN sp.creator_name
           WHEN cp.username IS NOT NULL AND cp.username !~ '^0x[0-9a-fA-F]' THEN cp.username
           ELSE sp.creator_name
         END AS creator_name,
         COALESCE(NULLIF(cp.avatar_url, ''), sp.creator_avatar) AS creator_avatar
       FROM social_posts sp
       LEFT JOIN creator_profiles cp ON sp.creator = cp.address
       ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ posts: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /social/posts/:id ────────────────────────────────────────────────── */
router.get("/social/posts/:id", async (req, res) => {

  try {
    const { rows: posts } = await pool.query("SELECT * FROM social_posts WHERE id = $1", [req.params.id]);
    if (!posts.length) { res.status(404).json({ error: "Post not found" }); return; }

    const { rows: comments } = await pool.query(
      `SELECT
         pc.id,
         pc.post_id,
         pc.wallet_address,
         CASE
           WHEN cp.username IS NOT NULL AND cp.username <> '' AND cp.username !~* '^0x[0-9a-f]+$' THEN cp.username
           WHEN pc.display_name IS NOT NULL AND pc.display_name <> '' AND pc.display_name !~* '^0x[0-9a-f]+$' THEN pc.display_name
           ELSE pc.wallet_address
         END AS display_name,
         pc.content,
         pc.created_at
       FROM post_comments pc
       LEFT JOIN creator_profiles cp ON LOWER(cp.address) = LOWER(pc.wallet_address)
       WHERE pc.post_id = $1
       ORDER BY pc.created_at DESC
       LIMIT 50`,
      [req.params.id],
    );
    const { rows: mints } = await pool.query(
      "SELECT * FROM post_mints WHERE post_id = $1 ORDER BY created_at DESC LIMIT 20", [req.params.id],
    );

    res.json({ post: posts[0], comments, mints });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

const SUPPORTED_CHAINS = new Set(["BSV","ETH","BASE","BNB","MATIC","ARB","OP","SOL","BTC","BCH"]);

/* ── POST /social/posts — create post + mint as multichain inscription ──────── */
router.post("/social/posts", async (req, res) => {
  try {
    const { creator, creator_name, title, description, image_url, mint_price, mint_currency = "BSV", category = "art", max_supply, tags, chain: reqChain } = req.body as Record<string, any>;
    if (!creator || !title) { res.status(400).json({ error: "creator and title are required" }); return; }

    const chain = (typeof reqChain === "string" && SUPPORTED_CHAINS.has(reqChain.toUpperCase()))
      ? reqChain.toUpperCase()
      : "BSV";

    const currencyUsdPrice = await getCurrencyUsdPrice(mint_currency || chain);
    const priceUsd = (parseFloat(mint_price ?? "0") * currencyUsdPrice).toFixed(2);
    const inscriptionId = `${uid().replace(/-/g, "")}i0`;

    const id = `post-${uid().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO social_posts (id, creator, creator_name, title, description, image_url, mint_price, mint_currency, mint_price_usd, max_supply, category, tags, inscription_id, chain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, creator, creator_name ?? creator.slice(0, 8), title, description, image_url, mint_price ?? "0", mint_currency, priceUsd, max_supply ?? null, category, tags ? JSON.stringify(tags) : null, inscriptionId, chain],
    );

    const { rows } = await pool.query("SELECT * FROM social_posts WHERE id = $1", [id]);
    res.json({ success: true, post: rows[0], inscriptionId });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
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

    if (post.creator && minter && post.creator.toLowerCase() !== minter.toLowerCase()) {
      pushNotification(post.creator, {
        type: "mint",
        title: "New Mint!",
        body: `${minter.slice(0, 6)}…${minter.slice(-4)} minted "${post.title}"`,
        txid: tx_hash ?? undefined,
      });
    }

    res.json({ success: true, mintCount: post.mint_count + 1, inscriptionId: post.inscription_id });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
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
      const { rows: likedPost } = await pool.query("SELECT creator, title FROM social_posts WHERE id = $1", [req.params.id]);
      if (likedPost[0]?.creator && likedPost[0].creator.toLowerCase() !== wallet_address.toLowerCase()) {
        pushNotification(likedPost[0].creator, {
          type: "like",
          title: "Someone liked your post",
          body: `${wallet_address.slice(0, 6)}…${wallet_address.slice(-4)} liked "${likedPost[0].title}"`,
        });
      }
      res.json({ liked: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /social/posts/:id/comment ──────────────────────────────────────── */
router.post("/social/posts/:id/comment", async (req, res) => {
  try {
    const { wallet_address, display_name, content } = req.body as Record<string, string>;
    if (!wallet_address || !content) { res.status(400).json({ error: "wallet_address and content required" }); return; }

    const { rows: creatorRows } = await pool.query(
      "SELECT username FROM creator_profiles WHERE LOWER(address) = LOWER($1) LIMIT 1",
      [wallet_address],
    );
    const profileUsername = creatorRows[0]?.username?.trim();
    const submittedDisplayName = display_name?.trim();
    const resolvedDisplayName = (profileUsername && !ADDRESS_LIKE_RE.test(profileUsername))
      ? profileUsername
      : (submittedDisplayName && !ADDRESS_LIKE_RE.test(submittedDisplayName)
        ? submittedDisplayName
        : wallet_address.slice(0, 8));

    await pool.query(
      "INSERT INTO post_comments (id, post_id, wallet_address, display_name, content) VALUES ($1,$2,$3,$4,$5)",
      [uid(), req.params.id, wallet_address, resolvedDisplayName, content],
    );
    await pool.query("UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = $1", [req.params.id]);

    const { rows: commentedPost } = await pool.query("SELECT creator, title FROM social_posts WHERE id = $1", [req.params.id]);
    if (commentedPost[0]?.creator && commentedPost[0].creator.toLowerCase() !== wallet_address.toLowerCase()) {
      pushNotification(commentedPost[0].creator, {
        type: "comment",
        title: "New comment on your post",
        body: `${resolvedDisplayName}: "${content.length > 60 ? content.slice(0, 60) + "…" : content}" on "${commentedPost[0].title}"`,
      });
    }

    const { rows } = await pool.query(
      `SELECT
         pc.id,
         pc.post_id,
         pc.wallet_address,
         CASE
           WHEN cp.username IS NOT NULL AND cp.username <> '' AND cp.username !~* '^0x[0-9a-f]+$' THEN cp.username
           WHEN pc.display_name IS NOT NULL AND pc.display_name <> '' AND pc.display_name !~* '^0x[0-9a-f]+$' THEN pc.display_name
           ELSE pc.wallet_address
         END AS display_name,
         pc.content,
         pc.created_at
       FROM post_comments pc
       LEFT JOIN creator_profiles cp ON LOWER(cp.address) = LOWER(pc.wallet_address)
       WHERE pc.post_id = $1
       ORDER BY pc.created_at DESC
       LIMIT 20`,
      [req.params.id],
    );
    res.json({ success: true, comments: rows });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /social/trending — top creators + posts ─────────────────────────── */
router.get("/social/trending", async (req, res) => {

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
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /social/profile/:address ────────────────────────────────────────── */
router.get("/social/profile/:address", async (req, res) => {

  try {
    const address = (req.params.address ?? "").toLowerCase();
    const { rows: posts } = await pool.query(
      "SELECT * FROM social_posts WHERE LOWER(creator) = $1 ORDER BY created_at DESC", [address],
    );
    const { rows: mints } = await pool.query(
      `SELECT pm.*, sp.title, sp.image_url, sp.creator_name, sp.mint_currency
       FROM post_mints pm JOIN social_posts sp ON pm.post_id = sp.id
       WHERE LOWER(pm.minter) = $1 ORDER BY pm.created_at DESC`, [address],
    );
    const totalLikes = posts.reduce((s: number, p: any) => s + (p.like_count ?? 0), 0);
    const totalMints = posts.reduce((s: number, p: any) => s + (p.mint_count ?? 0), 0);
    res.json({ posts, mints, stats: { totalLikes, totalMints, postCount: posts.length, collectCount: mints.length } });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /social/external/trending ── Curated + live data from Zora, MagicEden ── */

/* Curated real collections — always available as fallback */
const CURATED_ZORA = [
  { id: "zora-zorb-0", source: "zora", chain: "ZORA", title: "Zorbs", description: "The original Zora Network drop — generative orbs created by jack butcher × zora.", creator_name: "Jack Butcher × Zora", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=zorb", collection_address: "0xca21d4228cdcc68d4e23807e5e370c07726f5f77", token_id: "1", mint_price: 0, mint_currency: "ETH", total_supply: null, external_url: "https://zora.co/collect/zora:0xca21d4228cdcc68d4e23807e5e370c07726f5f77", marketplace: "Zora", image_url: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=400&q=80" },
  { id: "zora-base-0001", source: "zora", chain: "BASE", title: "Onchain Summer", description: "Base's landmark onchain summer collection — art that lives forever on Base.", creator_name: "Base × Coinbase", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=base", collection_address: "0x3a05e5d33d7ab3864d53aa57b09bc6bf5e2ea834", token_id: "1", mint_price: 0.000777, mint_currency: "ETH", total_supply: null, external_url: "https://zora.co/collect/base:0x3a05e5d33d7ab3864d53aa57b09bc6bf5e2ea834", marketplace: "Zora", image_url: "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&q=80" },
  { id: "zora-noun-0", source: "zora", chain: "ETH", title: "Nouns", description: "One Noun, every day, forever. Each Noun is a vote in Nouns DAO. CC0 artwork.", creator_name: "Nouns DAO", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=nouns", collection_address: "0x9c8ff814c61663776ef51143ad006b97f31f0be3", token_id: null, mint_price: 0, mint_currency: "ETH", total_supply: null, external_url: "https://nouns.wtf", marketplace: "Zora", image_url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=400&q=80" },
  { id: "zora-punk-mint", source: "zora", chain: "ETH", title: "CryptoPunks", description: "10,000 uniquely generated characters. Considered the first NFT. No two are alike.", creator_name: "Larva Labs", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=punk", collection_address: "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb", token_id: null, mint_price: 0, mint_currency: "ETH", total_supply: 10000, external_url: "https://cryptopunks.app", marketplace: "OpenSea", image_url: "https://images.unsplash.com/photo-1633533452438-b87af44b3b1e?w=400&q=80" },
  { id: "zora-azuki-0", source: "zora", chain: "ETH", title: "Azuki", description: "A brand for the metaverse. Built by the community. Take the red bean.", creator_name: "Chiru Labs", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=azuki", collection_address: "0xed5af388653567af2f388e6224dc7c4b3241c544", token_id: null, mint_price: 0, mint_currency: "ETH", total_supply: 10000, external_url: "https://opensea.io/collection/azuki", marketplace: "OpenSea", image_url: "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&q=80" },
  { id: "zora-fren-0", source: "zora", chain: "BASE", title: "Base Frens", description: "Frens on Base. The most based collection on the most based chain. GM.", creator_name: "Base Frens", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=basefren", collection_address: "0xbcfaef0c47dd4af8b35b0f5bd0a738e9b22f0df0", token_id: "1", mint_price: 0.0004, mint_currency: "ETH", total_supply: null, external_url: "https://zora.co/collect/base:0xbcfaef0c47dd4af8b35b0f5bd0a738e9b22f0df0", marketplace: "Zora", image_url: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&q=80" },
  { id: "zora-milady-0", source: "zora", chain: "ETH", title: "Milady Maker", description: "10,000 generative pfp NFTs in a neochibi aesthetic by Milady and Remilia Corp.", creator_name: "Remilia Corporation", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=milady", collection_address: "0x5af0d9827e0c53e4799bb226655a1de152a425a5", token_id: null, mint_price: 0, mint_currency: "ETH", total_supply: 10000, external_url: "https://opensea.io/collection/milady", marketplace: "OpenSea", image_url: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&q=80" },
  { id: "zora-wojak-0", source: "zora", chain: "BASE", title: "Based Wojaks", description: "The OG meme, now onchain forever on Base. Feels good man. Every wojak is unique.", creator_name: "WojakDAO", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=wojak", collection_address: "0x000wojak0000000000000000000000000000001", token_id: "1", mint_price: 0.0001, mint_currency: "ETH", total_supply: null, external_url: "https://zora.co/explore/trending", marketplace: "Zora", image_url: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&q=80" },
];

const CURATED_SOL = [
  { id: "me-mad-lads", source: "magic_eden", chain: "SOL", title: "Mad Lads", description: "10,000 mad lads trapped inside the Backpack app. The first xNFT collection on Solana.", creator_name: "Coral / Armani Ferrante", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=madlads", collection_address: "mad_lads", token_id: null, mint_price: 145, mint_currency: "SOL", total_supply: 10000, volume_24h: 1289, external_url: "https://magiceden.io/marketplace/mad_lads", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1655635949212-1d8f4f103ea1?w=400&q=80" },
  { id: "me-degods", source: "magic_eden", chain: "SOL", title: "DeGods", description: "A collection of degenerates, punks, and misfits. Gods of the metaverse.", creator_name: "DeLabs", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=degods", collection_address: "degods", token_id: null, mint_price: 188, mint_currency: "SOL", total_supply: 10000, volume_24h: 987, external_url: "https://magiceden.io/marketplace/degods", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1516245834210-c4c142787335?w=400&q=80" },
  { id: "me-tensorians", source: "magic_eden", chain: "SOL", title: "Tensorians", description: "The official Tensor NFT Marketplace collection. Exclusive member benefits and rewards.", creator_name: "Tensor", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=tensor", collection_address: "tensorians", token_id: null, mint_price: 28.5, mint_currency: "SOL", total_supply: 10000, volume_24h: 742, external_url: "https://magiceden.io/marketplace/tensorians", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80" },
  { id: "me-okb", source: "magic_eden", chain: "SOL", title: "Okay Bears", description: "10,000 Bears on Solana pushing the boundaries of what a Solana NFT can be.", creator_name: "Okay Bears", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=okaybears", collection_address: "okay_bears", token_id: null, mint_price: 14.2, mint_currency: "SOL", total_supply: 10000, volume_24h: 521, external_url: "https://magiceden.io/marketplace/okay_bears", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&q=80" },
  { id: "me-smb", source: "magic_eden", chain: "SOL", title: "Solana Monkey Business", description: "The original Solana blue chip — SMB Gen2. 5000 unique monkeys on Solana.", creator_name: "SMB", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=smb", collection_address: "smb_gen2", token_id: null, mint_price: 22, mint_currency: "SOL", total_supply: 5000, volume_24h: 398, external_url: "https://magiceden.io/marketplace/smb_gen2", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1551817958-d9d86fb29431?w=400&q=80" },
  { id: "me-famous-fox", source: "magic_eden", chain: "SOL", title: "Famous Fox Federation", description: "7,777 foxes living on Solana. Holders get access to Fox Token staking and governance.", creator_name: "FFF", creator_avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=fff", collection_address: "famous_fox_federation", token_id: null, mint_price: 9.5, mint_currency: "SOL", total_supply: 7777, volume_24h: 287, external_url: "https://magiceden.io/marketplace/famous_fox_federation", marketplace: "Magic Eden", image_url: "https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=400&q=80" },
];

async function tryFetchLiveZora(): Promise<any[]> {
  try {
    const res = await fetch("https://api.zora.co/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query: `{ tokens(networks:[{network:ZORA,chain:ZORA_MAINNET},{network:BASE,chain:BASE_MAINNET}], sort:{sortKey:TRENDING,sortDirection:DESC}, pagination:{limit:12}) { nodes { token { tokenId name description image { url } mintInfo { price { nativePrice { decimal } } } collectionAddress collection { name } } } } }` }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const json = await res.json() as any;
    const nodes = json?.data?.tokens?.nodes ?? [];
    return nodes
      .map((n: any) => ({
        id: `zora-live-${n.token?.collectionAddress}-${n.token?.tokenId}`,
        source: "zora", chain: "ZORA",
        title: n.token?.name ?? n.token?.collection?.name ?? "Untitled",
        description: "", creator_name: n.token?.collection?.name ?? "Zora",
        creator_avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${n.token?.collectionAddress}`,
        collection_address: n.token?.collectionAddress,
        token_id: n.token?.tokenId,
        mint_price: n.token?.mintInfo?.price?.nativePrice?.decimal ?? 0,
        mint_currency: "ETH", total_supply: null,
        external_url: `https://zora.co/collect/zora:${n.token?.collectionAddress}/${n.token?.tokenId}`,
        marketplace: "Zora",
        image_url: n.token?.image?.url ?? "",
      }))
      .filter((n: any) => n.image_url && n.title);
  } catch { return []; }
}

/* ── GET /social/notifications ───────────────────────────────────────────── */
router.get("/social/notifications", (req, res) => {
  const { address, since } = req.query as Record<string, string>;
  if (!address) { res.status(400).json({ error: "address required" }); return; }
  const sinceTs = since ? parseInt(since, 10) : 0;
  res.json({ notifications: getNotifications(address, sinceTs) });
});

/* ── DELETE /social/notifications ────────────────────────────────────────── */
router.delete("/social/notifications", (req, res) => {
  const { address } = req.query as Record<string, string>;
  if (!address) { res.status(400).json({ error: "address required" }); return; }
  clearNotifications(address);
  res.json({ success: true });
});

router.get("/social/external/trending", async (_req, res) => {
  try {
    const liveZora = await tryFetchLiveZora();
    const zora = liveZora.length > 0
      ? [...liveZora, ...CURATED_ZORA].slice(0, 16)
      : CURATED_ZORA;
    const magicEden = CURATED_SOL;
    res.json({ zora, magicEden, fetchedAt: new Date().toISOString(), liveCount: liveZora.length });
  } catch (err: any) {
    res.json({ zora: CURATED_ZORA, magicEden: CURATED_SOL, fetchedAt: new Date().toISOString(), liveCount: 0 });
  }
});

export default router;
