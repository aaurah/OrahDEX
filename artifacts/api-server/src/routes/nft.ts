import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  nftCollectionsTable, nftsTable, nftListingsTable, nftBidsTable, nftActivityTable,
} from "@workspace/db/schema";
import { eq, and, desc, asc, ilike, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";

const router: IRouter = Router();
const USD_PEGGED_CURRENCIES = new Set(["USD", "USDT", "USDC", "USDB", "USDBC", "USDC.E", "USDBE", "BUSD", "TUSD", "USDD"]);

// Scope the "not available" guard to /nft/* paths only.
// A blanket router.use() without a path prefix intercepts every request that
// reaches this router (e.g. /bsv-status, /staking/providers) because Express
// walks sub-routers in registration order.
router.use((req, res, next) => {
  if (process.env.NFT_ENABLED !== "true" && req.path.startsWith("/nft")) {
    return res.status(503).json({
      error: "NFT features are not yet available. Coming soon.",
    });
  }
  return next();
});

function uid(): string {
  return crypto.randomUUID();
}

/* ── Seed helpers ─────────────────────────────────────────────────────────── */

const MOCK_COLLECTIONS = [
  {
    id: "col-bayc",     name: "Bored Ape Yacht Club",        slug: "bayc",           chain: "ETH",
    contractAddress: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    description: "10,000 unique Bored Apes on Ethereum. Club membership card, digital identity, and more.",
    imageUrl: "https://i.seadn.io/gae/Ju9CkWtV-1Okvf45wo8UctR-M9He2PjILP0oOvxE89AyiPPGtrR3gysu1Zgy0hjd2xKIgjJJtWIc0ybj4Vd7wv8t3pxDgmCknF?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/i5dYZRkVCUK97bfprQ3WXyrT9BnLSZtVKGJlKQ919uaUB0sxbngVCioaiyu9r5d5Ra1rcHRx3E-bn5eRFe7U3GA97wwNtna3iFbr?w=500&auto=format",
    category: "pfp", floorPrice: "14.2", floorCurrency: "ETH", volume24h: "1820.4",
    volumeTotal: "948200", totalSupply: 10000, holders: 5612, isVerified: true,
  },
  {
    id: "col-punk",     name: "CryptoPunks",                 slug: "cryptopunks",    chain: "ETH",
    contractAddress: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
    description: "10,000 uniquely generated characters. One of the earliest NFT projects on Ethereum.",
    imageUrl: "https://i.seadn.io/gae/BdxvLseXcfl57BiuQcQYdJ64v-aI8din7WPk0Pgo3qQFhAUH-B6i-dCqqc_mCkRIzULmwzwecnohLhrcH8A9mpWIZqA7ygc52Sr81hE?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/Uihslg5dkJvbijJy1cGJc1_uD51z_RkQV8yY_ULDiMlR2mXqGJDJ2bSIQaVZhJ14vu_nxqCzO6HXqU3n28mFT4IrWZMNi1u?w=500&auto=format",
    category: "pfp", floorPrice: "46.5", floorCurrency: "ETH", volume24h: "3140",
    volumeTotal: "2180000", totalSupply: 10000, holders: 3512, isVerified: true,
  },
  {
    id: "col-azuki",    name: "Azuki",                       slug: "azuki",          chain: "ETH",
    contractAddress: "0xED5AF388653567Af2F388E6224dC7C4b3241C544",
    description: "A brand for the metaverse. Built by a small team with a big vision.",
    imageUrl: "https://i.seadn.io/gae/H8jOCJuQokNqGBpkBN5wk1oZwO7LM8bNnrX6rfkQ69nCTCy3qhpHAeGqnlPvDfq0tDYmXBL3Lnb_Qx1GVMPkTD?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/O0XkiR_Z2--OPa_RA6FhXrR16yBOgIJqed3zAYFsbl7GFM0rFjlVb4sqD7kSaZP4KWFOIHjjHpAQJjCTfH19xVr_7kHc3O-?w=500&auto=format",
    category: "pfp", floorPrice: "3.82", floorCurrency: "ETH", volume24h: "412",
    volumeTotal: "98700", totalSupply: 10000, holders: 4820, isVerified: true,
  },
  {
    id: "col-milady",   name: "Milady Maker",                slug: "milady",         chain: "ETH",
    contractAddress: "0x5Af0D9827E0c53E4799BB226655A1de152A425a5",
    description: "Milady Maker is a collection of 10,000 generative pfpNFTs in the neochibi aesthetic.",
    imageUrl: "https://i.seadn.io/gae/a_frplnavZA9g4vN3SboJ4NkD3cM8Wp18HMdhlq4Ao8LHnAcTCH7NN5l0e0X9Kb5bOl3EYcXvhJKWLT5hhDJnHFfT97Tl5-hC0?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/7-USWLR9zzVKJOaxNLMVOULpI3vP6-aRJJ9MO9GGKhHBpSGS1MiU2NAtQAEZ0kOUZKL3TIiIUJXqU8g-rq5oJj7Zl9N_f0?w=500&auto=format",
    category: "pfp", floorPrice: "1.24", floorCurrency: "ETH", volume24h: "180",
    volumeTotal: "24600", totalSupply: 10000, holders: 3950, isVerified: true,
  },
  {
    id: "col-ordinals", name: "Bitcoin Ordinals Genesis",    slug: "ordinals-genesis", chain: "BSV",
    contractAddress: null,
    description: "The first series of inscribed relics on BSV — proof-of-existence artifacts for the OrahDEX genesis epoch.",
    imageUrl: "https://i.seadn.io/gae/yNi-XdGxsgQCPpqSio4o31ygAV6wURdIdInWRcFIl46UDNn5NVIT3gxvEL669OVmuORexPloJjKFLhr0a5jDqTl_bqXRXwm?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/lHexKRMpw-aoSyB1WdFBff5yfANLReFxpYLoDl-KGSnMSmoXWijkMbZKSIQ1532MHf6DVbWObhH0yFdoVJLPT5yeBTZ?w=500&auto=format",
    category: "relics", floorPrice: "0.24", floorCurrency: "BSV", volume24h: "18.4",
    volumeTotal: "1240", totalSupply: 1000, holders: 420, isVerified: true,
  },
  {
    id: "col-keeperrelic", name: "Keeper Relics",           slug: "keeper-relics",  chain: "BSV",
    contractAddress: null,
    description: "Mythic keeper identity tokens — evolve with on-chain actions, unlock AMM boosts and governance weight.",
    imageUrl: "https://i.seadn.io/gae/Ju9CkWtV-1Okvf45wo8UctR-M9He2PjILP0oOvxE89AyiPPGtrR3gysu1Zgy0hjd2xKIgjJJtWIc0ybj4Vd7wv8t3pxDgmCknF?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/i5dYZRkVCUK97bfprQ3WXyrT9BnLSZtVKGJlKQ919uaUB0sxbngVCioaiyu9r5d5Ra1rcHRx3E-bn5eRFe7U3GA97wwNtna3iFbr?w=500&auto=format",
    category: "relics", floorPrice: "1.08", floorCurrency: "BSV", volume24h: "42",
    volumeTotal: "3800", totalSupply: 500, holders: 210, isVerified: true,
  },
  {
    id: "col-pudgy",    name: "Pudgy Penguins",              slug: "pudgy-penguins", chain: "ETH",
    contractAddress: "0xBd3531dA5CF5857e7CfAA92426877b022e612cf8",
    description: "A collection of 8,888 NFTs. Spreading good vibes through warmth and love.",
    imageUrl: "https://i.seadn.io/gae/yNi-XdGxsgQCPpqSio4o31ygAV6wURdIdInWRcFIl46UDNn5NVIT3gxvEL669OVmuORexPloJjKFLhr0a5jDqTl_bqXRXwm?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/lHexKRMpw-aoSyB1WdFBff5yfANLReFxpYLoDl-KGSnMSmoXWijkMbZKSIQ1532MHf6DVbWObhH0yFdoVJLPT5yeBTZ?w=500&auto=format",
    category: "pfp", floorPrice: "8.45", floorCurrency: "ETH", volume24h: "892",
    volumeTotal: "214000", totalSupply: 8888, holders: 4320, isVerified: true,
  },
  {
    id: "col-clonex",   name: "Clone X",                    slug: "clone-x",        chain: "ETH",
    contractAddress: "0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B",
    description: "20,000 next-gen Avatars, by RTFKT and Takashi Murakami.",
    imageUrl: "https://i.seadn.io/gae/XN0XuD8Uh3jyRWNtPTFeXJg_ht8m5ofDx6aHhe0NjKActSH-kOuDDCFMtskgzQf2FcNkOiH9MKlazJPp2-e48bZfX0?w=500&auto=format",
    bannerUrl: "https://i.seadn.io/gae/4jIPyFNR5e6xVDZBHUMrV0mUKQMg_V9QRGI7tkDXfD6ZT_cxA6Z9uT5vJk83wGT26R3zMF3P3E7k8_z4JjPvWJqy?w=500&auto=format",
    category: "avatar", floorPrice: "1.98", floorCurrency: "ETH", volume24h: "340",
    volumeTotal: "136000", totalSupply: 20000, holders: 9840, isVerified: true,
  },
];

/* Seed NFT mock items for a given collection */
function mockNftsForCollection(colId: string, chain: string, contract: string | null, n = 12) {
  const seeds = [
    { suffix: "#1", rare: "Legendary", rank: 1 },
    { suffix: "#12", rare: "Epic", rank: 42 },
    { suffix: "#88", rare: "Rare", rank: 180 },
    { suffix: "#142", rare: "Uncommon", rank: 560 },
    { suffix: "#303", rare: "Common", rank: 1200 },
    { suffix: "#404", rare: "Common", rank: 2400 },
    { suffix: "#500", rare: "Uncommon", rank: 780 },
    { suffix: "#666", rare: "Rare", rank: 320 },
    { suffix: "#777", rare: "Epic", rank: 65 },
    { suffix: "#888", rare: "Rare", rank: 450 },
    { suffix: "#999", rare: "Legendary", rank: 8 },
    { suffix: "#1024", rare: "Common", rank: 3100 },
  ];
  const colInfo = MOCK_COLLECTIONS.find(c => c.id === colId);
  const imageBase = colInfo?.imageUrl ?? "https://picsum.photos/seed/nft/400/400";

  return seeds.slice(0, n).map((s, i) => ({
    id: `nft-${colId}-${i}`,
    collectionId: colId,
    chain,
    contractAddress: contract,
    tokenId: s.suffix.replace("#", ""),
    name: `${colInfo?.name ?? "NFT"} ${s.suffix}`,
    description: `Unique piece from the ${colInfo?.name ?? "collection"} universe.`,
    imageUrl: imageBase,
    traits: JSON.stringify([
      { trait_type: "Background", value: ["Blue", "Red", "Gold", "Purple", "Green"][i % 5] },
      { trait_type: "Eyes", value: ["Laser", "Sleepy", "Wide", "Pixel", "X"][i % 5] },
      { trait_type: "Mouth", value: ["Grin", "Frown", "Bored", "Gag", "Smile"][i % 5] },
      { trait_type: "Hat", value: ["Crown", "Cap", "None", "Halo", "Helmet"][i % 5] },
    ]),
    rarity: s.rare,
    rarityRank: s.rank,
    lastSalePrice: String((parseFloat(colInfo?.floorPrice ?? "1") * (0.8 + Math.random() * 0.8)).toFixed(4)),
    lastSaleCurrency: colInfo?.floorCurrency ?? "ETH",
    isWrapped: false,
    nativeChain: chain,
    owner: `0x${Math.random().toString(16).slice(2).padEnd(40, "0")}`,
  }));
}

function mockListings(nfts: ReturnType<typeof mockNftsForCollection>, col: typeof MOCK_COLLECTIONS[0]) {
  return nfts.slice(0, 6).map((nft, i) => ({
    id: `lst-${nft.id}`,
    nftId: nft.id,
    collectionId: col.id,
    seller: nft.owner!,
    chain: col.chain,
    price: String((parseFloat(col.floorPrice) * (1 + i * 0.05)).toFixed(4)),
    currency: col.floorCurrency,
    priceUsd: String((parseFloat(col.floorPrice) * (1 + i * 0.05) * 1800).toFixed(2)),
    status: "active",
  }));
}

function mockActivity(col: typeof MOCK_COLLECTIONS[0], n = 8) {
  const types = ["sale", "listing", "bid", "transfer"];
  return Array.from({ length: n }, (_, i) => ({
    id: `act-${col.id}-${i}`,
    nftId: `nft-${col.id}-${i % 4}`,
    collectionId: col.id,
    type: types[i % types.length],
    fromAddress: `0x${Math.random().toString(16).slice(2).padEnd(40, "0")}`,
    toAddress:   `0x${Math.random().toString(16).slice(2).padEnd(40, "0")}`,
    price: String((parseFloat(col.floorPrice) * (0.9 + Math.random() * 0.4)).toFixed(4)),
    currency: col.floorCurrency,
    priceUsd: String((parseFloat(col.floorPrice) * 1800 * (0.9 + Math.random() * 0.4)).toFixed(2)),
    txHash: `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}`,
    chain: col.chain,
  }));
}

/* ── Ensure tables have seed data ─────────────────────────────────────────── */
let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  try {
    const existing = await db.select({ id: nftCollectionsTable.id }).from(nftCollectionsTable).limit(1);
    if (existing.length > 0) { seeded = true; return; }

    for (const col of MOCK_COLLECTIONS) {
      await db.insert(nftCollectionsTable).values(col as any).onConflictDoNothing();

      const nfts = mockNftsForCollection(col.id, col.chain, col.contractAddress);
      for (const nft of nfts) {
        await db.insert(nftsTable).values(nft as any).onConflictDoNothing();
      }
      const listings = mockListings(nfts, col);
      for (const lst of listings) {
        await db.insert(nftListingsTable).values(lst as any).onConflictDoNothing();
      }
      const activities = mockActivity(col);
      for (const act of activities) {
        await db.insert(nftActivityTable).values(act as any).onConflictDoNothing();
      }
    }
    seeded = true;
    logger.info("NFT collections seeded");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "NFT seed failed");
  }
}

/* ── Routes ───────────────────────────────────────────────────────────────── */

/* GET /nft/collections */
router.get("/nft/collections", async (req, res) => {
  await ensureSeeded();
  try {
    const { chain, category, q } = req.query as Record<string, string>;
    let rows = await db.select().from(nftCollectionsTable).orderBy(desc(nftCollectionsTable.volume24h));

    if (chain)    rows = rows.filter(r => r.chain.toUpperCase() === chain.toUpperCase());
    if (category) rows = rows.filter(r => r.category === category);
    if (q)        rows = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));

    res.json({ collections: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/collections/:slug */
router.get("/nft/collections/:slug", async (req, res) => {
  await ensureSeeded();
  try {
    const [col] = await db.select().from(nftCollectionsTable)
      .where(eq(nftCollectionsTable.slug, req.params.slug));
    if (!col) { res.status(404).json({ error: "Collection not found" }); return; }

    const nfts = await db.select().from(nftsTable)
      .where(eq(nftsTable.collectionId, col.id))
      .orderBy(asc(nftsTable.rarityRank))
      .limit(50);

    const listings = await db.select().from(nftListingsTable)
      .where(and(eq(nftListingsTable.collectionId, col.id), eq(nftListingsTable.status, "active")))
      .orderBy(asc(nftListingsTable.price))
      .limit(20);

    const activity = await db.select().from(nftActivityTable)
      .where(eq(nftActivityTable.collectionId, col.id))
      .orderBy(desc(nftActivityTable.createdAt))
      .limit(20);

    res.json({ collection: col, nfts, listings, activity });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/items — marketplace browse */
router.get("/nft/items", async (req, res) => {
  await ensureSeeded();
  try {
    const { chain, collectionId, q, sort = "rarity" } = req.query as Record<string, string>;

    let rows = await db.select().from(nftsTable)
      .orderBy(sort === "price" ? desc(nftsTable.lastSalePrice) : asc(nftsTable.rarityRank))
      .limit(100);

    if (chain)        rows = rows.filter(r => r.chain.toUpperCase() === chain.toUpperCase());
    if (collectionId) rows = rows.filter(r => r.collectionId === collectionId);
    if (q)            rows = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));

    res.json({ items: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/items/:id */
router.get("/nft/items/:id", async (req, res) => {
  await ensureSeeded();
  try {
    const [nft] = await db.select().from(nftsTable).where(eq(nftsTable.id, req.params.id));
    if (!nft) { res.status(404).json({ error: "NFT not found" }); return; }

    const [col] = await db.select().from(nftCollectionsTable)
      .where(eq(nftCollectionsTable.id, nft.collectionId));

    const listings = await db.select().from(nftListingsTable)
      .where(and(eq(nftListingsTable.nftId, nft.id), eq(nftListingsTable.status, "active")))
      .orderBy(asc(nftListingsTable.price));

    const bids = await db.select().from(nftBidsTable)
      .where(and(eq(nftBidsTable.nftId, nft.id), eq(nftBidsTable.status, "active")))
      .orderBy(desc(nftBidsTable.price));

    const activity = await db.select().from(nftActivityTable)
      .where(eq(nftActivityTable.nftId, nft.id))
      .orderBy(desc(nftActivityTable.createdAt))
      .limit(20);

    res.json({ nft, collection: col ?? null, listings, bids, activity });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/listings — active marketplace listings */
router.get("/nft/listings", async (req, res) => {
  await ensureSeeded();
  try {
    const { chain, collectionId } = req.query as Record<string, string>;
    let rows = await db.select().from(nftListingsTable)
      .where(eq(nftListingsTable.status, "active"))
      .orderBy(asc(nftListingsTable.price))
      .limit(100);

    if (chain)        rows = rows.filter(r => r.chain.toUpperCase() === chain.toUpperCase());
    if (collectionId) rows = rows.filter(r => r.collectionId === collectionId);

    res.json({ listings: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* POST /nft/listings — create listing */
router.post("/nft/listings", async (req, res) => {
  try {
    const {
      nftId,
      post_id,
      collectionId,
      seller,
      chain,
      price,
      price_bsv,
      currency,
      mint_currency,
    } = req.body as Record<string, string>;
    const normalizedNftId = nftId ?? post_id;
    const normalizedCollectionId = collectionId ?? (post_id ? "social-posts" : undefined);
    const normalizedPrice = price ?? price_bsv;
    const normalizedCurrency = (currency ?? mint_currency ?? "BSV").toUpperCase();
    if (!normalizedNftId || !seller || !normalizedPrice) {
      res.status(400).json({ error: "seller plus (nftId or post_id) and (price or price_bsv) are required" }); return;
    }

    // Stablecoins are treated as $1 when no live quote is cached.
    const quoteUsd = FALLBACK_PRICES[normalizedCurrency]
      ?? (USD_PEGGED_CURRENCIES.has(normalizedCurrency) ? 1 : null);
    if (!quoteUsd) {
      res.status(400).json({ error: `Unsupported listing currency: ${normalizedCurrency}` }); return;
    }
    const priceUsd = String((parseFloat(normalizedPrice) * quoteUsd).toFixed(2));

    const [listing] = await db.insert(nftListingsTable).values({
      id: uid(),
      nftId: normalizedNftId,
      collectionId: normalizedCollectionId ?? "uncategorized",
      seller,
      chain: chain ?? "BSV",
      price: normalizedPrice,
      currency: normalizedCurrency,
      priceUsd,
      status: "active",
    }).returning();

    await db.insert(nftActivityTable).values({
      id: uid(),
      nftId: normalizedNftId,
      collectionId: normalizedCollectionId ?? "uncategorized",
      type: "listing",
      fromAddress: seller,
      price: normalizedPrice,
      currency: normalizedCurrency,
      priceUsd,
      chain: chain ?? "BSV",
    });

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* POST /nft/bids — place bid */
router.post("/nft/bids", async (req, res) => {
  try {
    const { nftId, collectionId, bidder, chain, price, currency } = req.body as Record<string, string>;
    if (!nftId || !bidder || !price) {
      res.status(400).json({ error: "nftId, bidder, price are required" }); return;
    }

    const ethUsd = FALLBACK_PRICES["ETH"] ?? 2400;
    const priceUsd = String((parseFloat(price) * (currency === "ETH" ? ethUsd : 1)).toFixed(2));

    const [bid] = await db.insert(nftBidsTable).values({
      id: uid(), nftId, collectionId, bidder, chain: chain ?? "ETH",
      price, currency: currency ?? "ETH", priceUsd, status: "active",
    }).returning();

    await db.insert(nftActivityTable).values({
      id: uid(), nftId, collectionId, type: "bid", fromAddress: bidder,
      price, currency, priceUsd, chain: chain ?? "ETH",
    });

    res.json({ success: true, bid });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/portfolio/:address — owned NFTs */
router.get("/nft/portfolio/:address", async (req, res) => {
  await ensureSeeded();
  try {
    const { address } = req.params;
    const owned = await db.select().from(nftsTable)
      .where(eq(nftsTable.owner, address.toLowerCase()))
      .orderBy(desc(nftsTable.createdAt));

    const myListings = await db.select().from(nftListingsTable)
      .where(and(eq(nftListingsTable.seller, address.toLowerCase()), eq(nftListingsTable.status, "active")));

    const myBids = await db.select().from(nftBidsTable)
      .where(and(eq(nftBidsTable.bidder, address.toLowerCase()), eq(nftBidsTable.status, "active")));

    res.json({ owned, myListings, myBids });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* GET /nft/activity — global activity feed */
router.get("/nft/activity", async (req, res) => {
  await ensureSeeded();
  try {
    const { type, collectionId } = req.query as Record<string, string>;
    let rows = await db.select().from(nftActivityTable)
      .orderBy(desc(nftActivityTable.createdAt))
      .limit(50);

    if (type)         rows = rows.filter(r => r.type === type);
    if (collectionId) rows = rows.filter(r => r.collectionId === collectionId);

    res.json({ activity: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
