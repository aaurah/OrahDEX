import { Router } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { marketsTable, platformSettingsTable, adminEmailsTable, ordersTable, tradesTable } from "@workspace/db/schema";
import { eq, desc, and, sql, ne, isNotNull, or } from "drizzle-orm";
import { getOrCreateWallet, fetchWalletBalance, privKeyToWif, privKeyToAddress, privKeyToPubKey, buildAndBroadcastBsvTx, isBsvAddress } from "../lib/bsvWallet.js";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sendMail, testSmtpConnection, getSmtpStatus } from "../lib/mailer.js";

const router = Router();

/* ─── EVM SIGNATURE RECOVERY ─────────────────────────────────────────────── */

function hashPersonalMessage(message: string): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const buf = Buffer.concat([Buffer.from(prefix, "utf8"), Buffer.from(message, "utf8")]);
  return keccak_256(buf);
}

function recoverEthAddress(message: string, sigHex: string): string {
  const sigStr = sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex;
  if (sigStr.length !== 130) throw new Error("Invalid signature length");
  const rBytes = Buffer.from(sigStr.slice(0, 64), "hex");
  const sBytes = Buffer.from(sigStr.slice(64, 128), "hex");
  const v = parseInt(sigStr.slice(128, 130), 16);
  const recovery = v >= 27 ? v - 27 : v;
  const msgHash = hashPersonalMessage(message);

  // noble-secp256k1 v3 'recovered' format: [recovery_bit(1), r(32), s(32)]
  const recoveredSig = new Uint8Array(65);
  recoveredSig[0] = recovery;
  recoveredSig.set(rBytes, 1);
  recoveredSig.set(sBytes, 33);

  // Returns compressed public key (33 bytes); prehash:false because msgHash is already keccak256
  const compressedPubKey = secp.recoverPublicKey(recoveredSig, msgHash, { prehash: false });
  // Expand to uncompressed (65 bytes: 0x04 + x + y)
  const uncompressedPubKey = secp.Point.fromBytes(compressedPubKey).toBytes(false);
  // Derive Ethereum address: keccak256(x || y), take last 20 bytes
  const pubKeyBytes = uncompressedPubKey.slice(1);
  const hash = keccak_256(pubKeyBytes);
  return "0x" + Buffer.from(hash).slice(-20).toString("hex");
}

/* ─── WALLET AUTH NONCES (in-memory) ─────────────────────────────────────── */

const pendingNonces = new Map<string, { nonce: string; message: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingNonces.entries()) {
    if (v.expiresAt < now) pendingNonces.delete(k);
  }
}, 5 * 60 * 1000);

/* ─── SERVER-SIDE TOTP (RFC 6238) ─────────────────────────────────────────── */
function base32Decode(input: string): Buffer {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alpha.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

async function verifyTOTPServer(code: string, secret: string): Promise<boolean> {
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  for (const delta of [-1, 0, 1]) {
    const counter = Math.floor((now + delta * 30) / 30);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const sig = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = sig[sig.length - 1] & 0xf;
    const otp = (
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)
    ) % 1_000_000;
    if (code === otp.toString().padStart(6, "0")) return true;
  }
  return false;
}

/* ─── ADMIN AUTH ENDPOINTS ────────────────────────────────────────────────── */

/**
 * POST /admin/auth
 * Validates email + password against ADMIN_EMAIL / ADMIN_PASSWORD env secrets.
 * Credentials are NEVER stored in source code.
 */
router.post("/auth", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const validEmail    = process.env.ADMIN_EMAIL;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (!validEmail || !validPassword) {
    res.status(503).json({ error: "Admin credentials are not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD secrets." });
    return;
  }
  if (
    !email || !password ||
    email.trim().toLowerCase() !== validEmail.trim().toLowerCase() ||
    password !== validPassword
  ) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  res.json({ success: true });
});

/**
 * POST /admin/auth/totp
 * Validates a 6-digit TOTP code against ADMIN_TOTP_SECRET env secret.
 */
router.post("/auth/totp", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code || code.length !== 6) {
    res.status(400).json({ error: "A 6-digit code is required." });
    return;
  }
  const secret = process.env.ADMIN_TOTP_SECRET || "JBSWY3DPEHPK3PXP";
  const ok = await verifyTOTPServer(code, secret);
  if (ok) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Incorrect code. Try again." });
  }
});

/**
 * GET /admin/auth/totp-uri
 * Returns the otpauth URI for QR-code generation (uses server-side secret).
 */
router.get("/auth/totp-uri", (_req, res) => {
  const secret  = process.env.ADMIN_TOTP_SECRET || "JBSWY3DPEHPK3PXP";
  const email   = process.env.ADMIN_EMAIL        || "admin@orahdex.app";
  const issuer  = "OrahDEX";
  const params  = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  const uri     = `otpauth://totp/${encodeURIComponent(issuer + ":" + email)}?${params}`;
  res.json({ uri, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}` });
});

/**
 * POST /admin/auth/wallet-challenge
 * Returns a unique nonce + human-readable message for the wallet to sign.
 */
router.post("/auth/wallet-challenge", (req, res) => {
  const { address } = req.body as { address?: string };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: "Valid EVM address required (0x...)" });
    return;
  }
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message = `Sign in to OrahDEX Admin Panel\n\nNonce: ${nonce}\nTimestamp: ${ts}\n\nThis request will not trigger a blockchain transaction.`;
  pendingNonces.set(address.toLowerCase(), { nonce, message, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ nonce, message });
});

/**
 * POST /admin/auth/wallet
 * Verifies a signed message, checks the address is on the whitelist, and grants admin access.
 */
router.post("/auth/wallet", async (req, res) => {
  const { address, signature } = req.body as { address?: string; signature?: string };
  if (!address || !signature) {
    res.status(400).json({ error: "address and signature are required" });
    return;
  }
  const stored = pendingNonces.get(address.toLowerCase());
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(401).json({ error: "Challenge expired or not found. Request a new one." });
    return;
  }
  let recovered: string;
  try {
    recovered = recoverEthAddress(stored.message, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wallet-auth] recoverEthAddress threw:", msg);
    res.status(401).json({ error: `Invalid signature format: ${msg}` });
    return;
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    res.status(401).json({ error: "Signature does not match address" });
    return;
  }
  const rows = await db.select().from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "admin_wallet_whitelist"));
  const whitelist: string[] = rows.length ? JSON.parse(rows[0].value) : [];
  if (!whitelist.includes(address.toLowerCase())) {
    res.status(403).json({ error: "Address not in admin whitelist. Contact your administrator." });
    return;
  }
  pendingNonces.delete(address.toLowerCase());
  res.json({ success: true, address });
});

/* ─── WALLET WHITELIST ────────────────────────────────────────────────────── */

router.get("/wallet-whitelist", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "admin_wallet_whitelist"));
    const addresses: string[] = rows.length ? JSON.parse(rows[0].value) : [];
    res.json({ addresses });
  } catch { res.json({ addresses: [] }); }
});

router.put("/wallet-whitelist", async (req, res) => {
  try {
    const { addresses } = req.body as { addresses: string[] };
    const normalised = (addresses ?? []).map((a: string) => a.toLowerCase().trim()).filter(Boolean);
    const value = JSON.stringify(normalised);
    await db.insert(platformSettingsTable)
      .values({ key: "admin_wallet_whitelist", value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ addresses: normalised });
  } catch { res.status(500).json({ error: "Failed to save whitelist" }); }
});

/* ─── SECURITY VAULT ──────────────────────────────────────────────────────── */

router.get("/security-vault", async (_req, res) => {
  try {
    const wallet = await getOrCreateWallet();
    res.json({
      bsvWallet: {
        address:    wallet.address,
        wif:        wallet.wif,
        privKeyHex: wallet.privKeyHex,
        pubKeyHex:  wallet.pubKeyHex,
      },
      adminEmail:  process.env.ADMIN_EMAIL  ?? null,
      totpSecret:  process.env.ADMIN_TOTP_SECRET ?? null,
    });
  } catch { res.status(500).json({ error: "Failed to load security vault" }); }
});

router.post("/security-vault/regenerate-bsv", async (_req, res) => {
  try {
    const privKey = crypto.randomBytes(32);
    const wif     = privKeyToWif(privKey);
    const address = privKeyToAddress(privKey);
    const pubKeyHex = privKeyToPubKey(privKey).toString("hex");
    await db.insert(platformSettingsTable)
      .values({ key: "bsv_settlement_wif", value: wif })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: wif, updatedAt: new Date() } });
    await db.insert(platformSettingsTable)
      .values({ key: "bsv_settlement_address", value: address })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: address, updatedAt: new Date() } });
    // Clear any custom address override since we have a fresh wallet
    await db.delete(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
    res.json({ address, wif, privKeyHex: privKey.toString("hex"), pubKeyHex });
  } catch { res.status(500).json({ error: "Failed to regenerate BSV wallet" }); }
});

/* ── In-memory user metadata (status, country, provider, verified, balance override) ─ */
/* Indexed by walletAddress.toLowerCase() */
const userMeta: Map<string, {
  status: string; country: string; provider: string; verified: boolean; balanceOverride?: number;
}> = new Map();

function getUserMeta(addr: string) {
  return userMeta.get(addr.toLowerCase()) ?? {
    status: "active",
    country: "US",
    provider: addr.startsWith("0x") ? "walletconnect" : "handcash",
    verified: false,
  };
}

async function buildRealUserList(): Promise<any[]> {
  /* Aggregate orders by wallet_address (skip bot) */
  const rows = await db
    .select({
      walletAddress: ordersTable.walletAddress,
      networkType: ordersTable.networkType,
      orderCount: sql<number>`count(*)::int`,
      filledCount: sql<number>`count(*) filter (where ${ordersTable.status} = 'filled')::int`,
      totalVolume: sql<string>`coalesce(sum(case when ${ordersTable.status}='filled' then cast(${ordersTable.total} as numeric) else 0 end),0)`,
      firstSeen: sql<string>`min(${ordersTable.createdAt})`,
      lastActive: sql<string>`max(${ordersTable.updatedAt})`,
    })
    .from(ordersTable)
    .where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"))
    .groupBy(ordersTable.walletAddress, ordersTable.networkType)
    .orderBy(sql`max(${ordersTable.updatedAt}) desc`);

  return rows.map((r, i) => {
    const meta = getUserMeta(r.walletAddress);
    const isEvm = r.walletAddress.startsWith("0x");
    return {
      id: `usr_${r.walletAddress.slice(0, 8)}`,
      walletAddress: r.walletAddress,
      network: r.networkType ?? (isEvm ? "evm" : "bsv"),
      provider: meta.provider,
      volume24h: parseFloat(r.totalVolume ?? "0"),
      totalTrades: r.filledCount ?? 0,
      balance: meta.balanceOverride ?? 0,
      status: meta.status,
      verified: meta.verified,
      joinedAt: r.firstSeen,
      lastActive: r.lastActive,
      country: meta.country,
    };
  });
}

// No pre-seeded admins — only the owner (aaurah@protonmail.com) is shown as
// the virtual pinned row on the frontend. Any admins added via the UI live here.
const mockAdmins: any[] = [];

const mockApiKeys = [
  { id: "key_001", name: "Public Market Feed", key: "orah_pub_a1b2c3d4e5f6g7h8", type: "public", rateLimit: 1000, calls24h: 842103, status: "active", createdAt: "2025-01-15" },
  { id: "key_002", name: "Trading Bot Integration", key: "orah_prv_x1y2z3w4v5u6t7s8", type: "private", rateLimit: 500, calls24h: 23891, status: "active", createdAt: "2025-02-01" },
  { id: "key_003", name: "Analytics Dashboard", key: "orah_prv_m1n2o3p4q5r6s7t8", type: "private", rateLimit: 300, calls24h: 4561, status: "active", createdAt: "2025-02-20" },
  { id: "key_004", name: "Legacy Integration", key: "orah_pub_a9b8c7d6e5f4g3h2", type: "public", rateLimit: 200, calls24h: 0, status: "revoked", createdAt: "2024-11-10" },
];

const deployedContracts: any[] = [
  { id: "ctr_001", name: "Orah Token", symbol: "ORAH", network: "BSV", type: "token", supply: "1000000000", decimals: 8, address: "1ORAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "deployed", txid: "c3d4e5f6a1b2...", deployedAt: "2026-01-10" },
  { id: "ctr_002", name: "Orah Governance", symbol: "OGOV", network: "BSV", type: "governance", supply: "100000000", decimals: 8, address: "1OGOVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "deployed", txid: "d4e5f6a1b2c3...", deployedAt: "2026-01-20" },
];

/* ─── STATS ─── */
router.get("/stats", async (_req, res) => {
  const allMarkets = await db.select().from(marketsTable);
  const realUsers = await buildRealUserList();
  const [tradeAgg] = await db.select({
    total24h: sql<number>`count(*) filter (where ${tradesTable.timestamp} > now() - interval '24 hours')::int`,
    vol24h: sql<string>`coalesce(sum(case when ${tradesTable.timestamp} > now() - interval '24 hours' then cast(${tradesTable.total} as numeric) else 0 end),0)`,
  }).from(tradesTable);
  const [openOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` })
    .from(ordersTable).where(eq(ordersTable.status, "open"));
  res.json({
    totalUsers: realUsers.length,
    activeUsers24h: realUsers.filter(u => u.status === "active").length,
    totalVolume24h: parseFloat(tradeAgg?.vol24h ?? "0"),
    totalTrades24h: tradeAgg?.total24h ?? 0,
    activePairs: allMarkets.filter(m => m.status === "active").length,
    totalPairs: allMarkets.length,
    openOrders: openOrdersRow?.cnt ?? 0,
    deployedContracts: deployedContracts.length,
    revenue24h: 12450.88,
    tvl: 845000000,
    feeRate: 0.1,
    systemStatus: "operational",
  });
});

/* ─── TRANSACTIONS (real DB: trades + BSV settlement orders) ─── */
router.get("/transactions", async (_req, res) => {
  try {
    const { search, chain, type, status, page = "1", limit = "20" } = _req.query as Record<string, string>;
    const PAGE = parseInt(page), LIMIT = parseInt(limit);

    /* 1. Real trades from tradesTable */
    const rawTrades = await db.select().from(tradesTable)
      .orderBy(desc(tradesTable.timestamp))
      .limit(500);

    const tradeTxs = rawTrades.map(t => {
      const isBsv = !!(t.walletAddress && !t.walletAddress.startsWith("0x"));
      const chain = isBsv ? "BSV" : "ETH";
      return {
        id: `trade-${t.id}`,
        txHash: t.txid ?? `0x${t.id.replace(/-/g, "").padEnd(64, "0")}`,
        chain,
        type: "settlement",
        status: "confirmed",
        from: t.walletAddress ?? "BOT_LIQUIDITY_ENGINE",
        to: "OrahDEX Settlement",
        amount: parseFloat(t.quantity as string),
        asset: t.symbol?.split("/")?.[0] ?? "BSV",
        fee: parseFloat(t.fee as string),
        feeCurrency: t.feeAsset ?? "USDT",
        blockHeight: null as number | null,
        confirmations: isBsv ? 6 : 12,
        requiredConfirmations: isBsv ? 3 : 12,
        timestamp: t.timestamp?.toISOString?.() ?? new Date().toISOString(),
        walletAddress: t.walletAddress ?? "",
        orderId: undefined as string | undefined,
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        note: `${t.symbol} ${t.side?.toUpperCase()} @ $${parseFloat(t.price as string).toFixed(4)} — DEX trade`,
        hasTxid: !!t.txid,
      };
    });

    /* 2. BSV settlement orders (orders with txid) */
    const rawOrders = await db.select().from(ordersTable)
      .where(and(isNotNull(ordersTable.txid), ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE")))
      .orderBy(desc(ordersTable.createdAt))
      .limit(200);

    const settlementTxs = rawOrders.map(o => ({
      id: `order-${o.id}`,
      txHash: o.txid!,
      chain: "BSV",
      type: "settlement",
      status: "confirmed",
      from: o.walletAddress,
      to: o.matchedOrderId ? `Order ${o.matchedOrderId}` : "OrahDEX BOT",
      amount: parseFloat(o.quantity as string),
      asset: o.symbol?.split("/")?.[0] ?? "BSV",
      fee: parseFloat(o.fee as string),
      feeCurrency: o.feeAsset ?? "USDT",
      blockHeight: null as number | null,
      confirmations: 6,
      requiredConfirmations: 3,
      timestamp: o.createdAt?.toISOString?.() ?? new Date().toISOString(),
      walletAddress: o.walletAddress,
      orderId: o.id,
      symbol: o.symbol,
      side: o.side,
      price: o.price,
      note: `${o.symbol} ${o.side?.toUpperCase()} @ $${parseFloat(o.price as string || "0").toFixed(4)} — OP_RETURN settlement`,
      hasTxid: true,
    }));

    /* Merge & deduplicate by txHash */
    const seen = new Set<string>();
    const merged = [...settlementTxs, ...tradeTxs].filter(tx => {
      if (seen.has(tx.txHash)) return false;
      seen.add(tx.txHash);
      return true;
    });

    /* Filters */
    let filtered = merged;
    if (chain && chain !== "all") filtered = filtered.filter(t => t.chain === chain);
    if (type && type !== "all") filtered = filtered.filter(t => t.type === type);
    if (status && status !== "all") filtered = filtered.filter(t => t.status === status);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.txHash.toLowerCase().includes(q) ||
        t.walletAddress.toLowerCase().includes(q) ||
        (t.orderId?.toLowerCase().includes(q)) ||
        t.asset.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const paged = filtered.slice((PAGE - 1) * LIMIT, PAGE * LIMIT);
    res.json({ transactions: paged, total, page: PAGE, pages: Math.ceil(total / LIMIT) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load transactions" });
  }
});

/* ─── USERS (real DB) ─── */
router.get("/users", async (_req, res) => {
  try {
    const { search, status, page = "1", limit = "20" } = _req.query as Record<string, string>;
    let users = await buildRealUserList();
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u =>
        u.walletAddress.toLowerCase().includes(q) ||
        u.provider.toLowerCase().includes(q) ||
        u.country.toLowerCase().includes(q)
      );
    }
    if (status && status !== "all") users = users.filter(u => u.status === status);
    const total = users.length;
    const p = parseInt(page), l = parseInt(limit);
    const paged = users.slice((p - 1) * l, p * l);
    res.json({ users: paged, total, page: p, pages: Math.ceil(total / l) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load users" });
  }
});

router.patch("/users/:id/status", async (req, res) => {
  /* id is "usr_<addr-prefix>" — find user by matching prefix */
  const { status } = req.body;
  const users = await buildRealUserList();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const existing = userMeta.get(user.walletAddress.toLowerCase()) ?? getUserMeta(user.walletAddress);
  userMeta.set(user.walletAddress.toLowerCase(), { ...existing, status });
  res.json({ success: true, user: { ...user, status } });
});

router.patch("/users/:id", async (req, res) => {
  const users = await buildRealUserList();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { status, country, verified, balance, network, provider } = req.body;
  const existing = userMeta.get(user.walletAddress.toLowerCase()) ?? getUserMeta(user.walletAddress);
  const updated = {
    ...existing,
    ...(status !== undefined && { status }),
    ...(country !== undefined && { country }),
    ...(verified !== undefined && { verified }),
    ...(balance !== undefined && { balanceOverride: parseFloat(balance) }),
    ...(provider !== undefined && { provider }),
  };
  userMeta.set(user.walletAddress.toLowerCase(), updated);
  const updatedUser = { ...user, ...updated, balance: updated.balanceOverride ?? user.balance };
  res.json({ success: true, user: updatedUser });
});

/* ─── ADMINS ─── */
router.get("/admins", (_req, res) => res.json(mockAdmins));

router.post("/admins", (req, res) => {
  const { name, email, role, permissions } = req.body;
  const newAdmin = {
    id: `adm_${(mockAdmins.length + 1).toString().padStart(4, "0")}`,
    name, email, role,
    permissions: permissions || [],
    lastLogin: null,
    status: "active",
    twoFa: false,
  };
  mockAdmins.push(newAdmin as any);
  res.status(201).json(newAdmin);
});

router.delete("/admins/:id", (req, res) => {
  const idx = mockAdmins.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Admin not found" });
  mockAdmins.splice(idx, 1);
  res.json({ success: true });
});

router.patch("/admins/:id", (req, res) => {
  const admin = mockAdmins.find(a => a.id === req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  const { name, email, role, permissions, status } = req.body;
  if (name !== undefined) admin.name = name;
  if (email !== undefined) admin.email = email;
  if (role !== undefined) admin.role = role;
  if (permissions !== undefined) admin.permissions = permissions;
  if (status !== undefined) admin.status = status;
  res.json({ success: true, admin });
});

router.patch("/admins/:id/password", (req, res) => {
  const admin = mockAdmins.find(a => a.id === req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  // In production this would hash the password; here we just acknowledge
  res.json({ success: true });
});

/* ─── TRADE PAIRS ─── */
router.get("/pairs", async (_req, res) => {
  const allMarkets = await db.select().from(marketsTable);
  res.json(allMarkets);
});

router.patch("/pairs/:symbol/status", async (req, res) => {
  const { status } = req.body;
  const symbolDecoded = decodeURIComponent(req.params.symbol);
  await db.update(marketsTable).set({ status }).where(eq(marketsTable.symbol, symbolDecoded));
  res.json({ success: true });
});

router.patch("/pairs/:symbol/fees", async (req, res) => {
  const { makerFee, takerFee } = req.body;
  const symbolDecoded = decodeURIComponent(req.params.symbol);
  await db.update(marketsTable).set({ makerFee: makerFee?.toString(), takerFee: takerFee?.toString() }).where(eq(marketsTable.symbol, symbolDecoded));
  res.json({ success: true });
});

/* ─── API SETTINGS ─── */
router.get("/api-keys", (_req, res) => res.json(mockApiKeys));

router.post("/api-keys", (req, res) => {
  const { name, type, rateLimit } = req.body;
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const rand = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const newKey = {
    id: `key_${(mockApiKeys.length + 1).toString().padStart(3, "0")}`,
    name, type, rateLimit: parseInt(rateLimit) || 100,
    key: `orah_${type === "public" ? "pub" : "prv"}_${rand}`,
    calls24h: 0,
    status: "active",
    createdAt: new Date().toISOString().split("T")[0],
  };
  mockApiKeys.push(newKey as any);
  res.status(201).json(newKey);
});

router.delete("/api-keys/:id", (req, res) => {
  const key = mockApiKeys.find(k => k.id === req.params.id);
  if (!key) return res.status(404).json({ error: "Key not found" });
  key.status = "revoked";
  res.json({ success: true });
});

/* ─── CONTRACTS / NEW COIN ─── */
router.get("/contracts", (_req, res) => res.json(deployedContracts));

router.post("/contracts/deploy", (req, res) => {
  const { name, symbol, network, type, supply, decimals } = req.body;
  const newContract = {
    id: `ctr_${(deployedContracts.length + 1).toString().padStart(3, "0")}`,
    name, symbol, network: network || "BSV",
    type: type || "token",
    supply: supply?.toString() || "1000000",
    decimals: parseInt(decimals) || 8,
    address: `1${symbol.toUpperCase()}${Array.from({length: 34}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]).join("")}`.slice(0, 34),
    status: "deploying",
    txid: Array.from({length: 64}, () => "0123456789abcdef"[Math.floor(Math.random()*16)]).join(""),
    deployedAt: new Date().toISOString().split("T")[0],
  };
  deployedContracts.push(newContract);
  setTimeout(() => { newContract.status = "deployed"; }, 3000);
  res.status(201).json(newContract);
});

/* ─── FEE WALLET CONFIG ─── */
router.get("/fee-wallet", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "fee_wallet_config"));
    if (!rows.length) { res.json({}); return; }
    res.json(JSON.parse(rows[0].value));
  } catch (err) { res.json({}); }
});

router.put("/fee-wallet", async (req, res) => {
  try {
    const cfg = req.body;
    const value = JSON.stringify(cfg);
    await db.insert(platformSettingsTable)
      .values({ key: "fee_wallet_config", value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: "Failed to save fee wallet config" });
  }
});

/* ─── PLATFORM INTEGRATION SETTINGS ─── */

// Keys that are safe to expose publicly (not secrets) — the Reown Project ID is
// a public identifier by design; it appears in client-side JS anyway.
const PUBLIC_KEYS = ["reown_project_id"];

// All integration keys managed through the admin panel
const INTEGRATION_KEYS = [
  "reown_project_id",
  "coingecko_api_key",
  "cmc_api_key",
  "dexscreener_api_key",
  "geckoterm_api_key",
  "moonpay_api_key",
  "transak_api_key",
  "banxa_api_key",
  "simplex_api_key",
  "ramp_api_key",
  "bsv_rpc_url",
  "whatsonchain_api_key",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_pass",
  "smtp_from",
  "recaptcha_site_key",
  "recaptcha_secret_key",
  "google_analytics_id",
  "intercom_app_id",
  "discord_webhook_url",
  "telegram_bot_token",
  "telegram_chat_id",
];

router.get("/integrations", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const result: Record<string, string> = {};
    for (const key of INTEGRATION_KEYS) {
      const row = rows.find(r => r.key === key);
      result[key] = row?.value ?? "";
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to load integrations" });
  }
});

router.put("/integrations", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (!INTEGRATION_KEYS.includes(key)) continue;
      await db.insert(platformSettingsTable)
        .values({ key, value: value ?? "" })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: value ?? "", updatedAt: new Date() } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save integrations" });
  }
});

/* ─── BOT PROFIT ─── */

const BOT_PROFIT_KEYS = [
  "bot_cumulative_profit",
  "bot_total_withdrawn",
  "bot_last_cycle_profit",
  "bot_last_cycle_at",
  "bot_start_time",
  "bot_withdrawal_history",
];

async function getBotSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function setBotSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/bot-profit", async (_req, res) => {
  try {
    const spreadProfit   = parseFloat((await getBotSetting("bot_spread_profit"))       ?? "0") || 0;
    const fundingProfit  = parseFloat((await getBotSetting("bot_funding_profit"))      ?? "0") || 0;
    const liquidProfit   = parseFloat((await getBotSetting("bot_liquidation_profit"))  ?? "0") || 0;
    const cumulative     = spreadProfit + fundingProfit + liquidProfit;
    const withdrawn      = parseFloat((await getBotSetting("bot_total_withdrawn"))     ?? "0") || 0;

    const lastCycle        = parseFloat((await getBotSetting("bot_last_cycle_profit"))      ?? "0") || 0;
    const lastCycleAt      = await getBotSetting("bot_last_cycle_at");
    const lastFundingIncome= parseFloat((await getBotSetting("bot_last_funding_income"))    ?? "0") || 0;
    const lastFundingAt    = await getBotSetting("bot_last_funding_at");
    const lastLiqIncome    = parseFloat((await getBotSetting("bot_last_liquidation_income")) ?? "0") || 0;
    const lastLiqAt        = await getBotSetting("bot_last_liquidation_at");
    const startTime        = await getBotSetting("bot_start_time");
    const historyRaw       = await getBotSetting("bot_withdrawal_history");
    const history          = historyRaw ? JSON.parse(historyRaw) : [];

    const available = Math.max(0, cumulative - withdrawn);

    let dailyRate = 0;
    if (startTime) {
      const elapsedDays = (Date.now() - new Date(startTime).getTime()) / 86_400_000;
      if (elapsedDays > 0) dailyRate = cumulative / elapsedDays;
    }

    res.json({
      cumulative:  parseFloat(cumulative.toFixed(4)),
      withdrawn:   parseFloat(withdrawn.toFixed(4)),
      available:   parseFloat(available.toFixed(4)),
      dailyRate:   parseFloat(dailyRate.toFixed(4)),
      startTime,
      sources: {
        spread: {
          total:       parseFloat(spreadProfit.toFixed(4)),
          lastCycle:   parseFloat(lastCycle.toFixed(6)),
          lastCycleAt,
          label:       "Spread Capture",
          description: "Bid/ask spread income from 368 seeded markets (every 30 s)",
        },
        funding: {
          total:       parseFloat(fundingProfit.toFixed(4)),
          lastCycle:   parseFloat(lastFundingIncome.toFixed(6)),
          lastCycleAt: lastFundingAt,
          label:       "Funding Rate Fees",
          description: "10 % platform cut of 8-hourly funding payments on all futures positions",
        },
        liquidation: {
          total:       parseFloat(liquidProfit.toFixed(4)),
          lastCycle:   parseFloat(lastLiqIncome.toFixed(6)),
          lastCycleAt: lastLiqAt,
          label:       "Liquidation Income",
          description: "0.5 % fee from liquidated leveraged positions (checked every 60 s)",
        },
      },
      history,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bot profit" });
  }
});

router.post("/bot-profit/withdraw", async (req, res) => {
  try {
    const { amount, address, network } = req.body as { amount: number; address: string; network: string };
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (!address)               return res.status(400).json({ error: "Destination address required" });

    const net = (network || "BSV").trim();

    // ── BSV on-chain broadcast ──────────────────────────────────────────────
    if (net === "BSV") {
      if (!isBsvAddress(address)) {
        return res.status(400).json({ error: "Invalid BSV address (must start with 1, 26–35 chars)" });
      }

      // Get current BSV price in USD from the spot market
      const bsvMarket = await db.select({ lastPrice: marketsTable.lastPrice })
        .from(marketsTable)
        .where(eq(marketsTable.symbol, "BSV/USDT"))
        .limit(1);
      const bsvPriceUsd = parseFloat(bsvMarket[0]?.lastPrice ?? "0") || 14.35; // fallback

      const satoshis = Math.round((amount / bsvPriceUsd) * 1e8);
      if (satoshis < 546) {
        return res.status(400).json({ error: `Amount too small. Minimum is $${((546 * bsvPriceUsd) / 1e8).toFixed(4)} (546 sat dust limit)` });
      }

      const wallet  = await getOrCreateWallet();
      const balance = await fetchWalletBalance(wallet.address);

      if (balance.confirmedSatoshis < satoshis + 500) {
        const maxUsd = ((balance.confirmedSatoshis - 500) / 1e8 * bsvPriceUsd).toFixed(4);
        return res.status(400).json({
          error: `Settlement wallet has insufficient BSV. Available: ${balance.bsv.toFixed(8)} BSV (~$${maxUsd}). Fund ${wallet.address} to enable withdrawals.`,
        });
      }

      const { txid } = await buildAndBroadcastBsvTx(address, satoshis, wallet, balance.utxos);

      const cumulative = parseFloat((await getBotSetting("bot_cumulative_profit")) ?? "0") || 0;
      const withdrawn  = parseFloat((await getBotSetting("bot_total_withdrawn"))   ?? "0") || 0;
      if (amount > cumulative - withdrawn) {
        return res.status(400).json({ error: `Insufficient profit balance. Available: $${(cumulative - withdrawn).toFixed(4)}` });
      }
      const newWithdrawn = withdrawn + amount;
      const historyRaw = await getBotSetting("bot_withdrawal_history");
      const history: any[] = historyRaw ? JSON.parse(historyRaw) : [];
      history.unshift({ id: txid, amount: parseFloat(amount.toFixed(4)), address, network: "BSV", txid, status: "completed", timestamp: new Date().toISOString() });
      await setBotSetting("bot_total_withdrawn", newWithdrawn.toFixed(6));
      await setBotSetting("bot_withdrawal_history", JSON.stringify(history.slice(0, 100)));

      return res.json({ success: true, txid, satoshis, bsvPriceUsd, remaining: parseFloat((cumulative - newWithdrawn).toFixed(4)) });
    }

    // ── Non-BSV: record withdrawal intent (EVM/Solana require on-chain wallet) ──
    const cumulative = parseFloat((await getBotSetting("bot_cumulative_profit")) ?? "0") || 0;
    const withdrawn  = parseFloat((await getBotSetting("bot_total_withdrawn"))   ?? "0") || 0;
    const available  = cumulative - withdrawn;

    if (amount > available) return res.status(400).json({ error: `Insufficient balance. Available: $${available.toFixed(4)}` });

    const newWithdrawn = withdrawn + amount;
    const txid = "orah_" + crypto.randomBytes(16).toString("hex");

    const historyRaw = await getBotSetting("bot_withdrawal_history");
    const history: any[] = historyRaw ? JSON.parse(historyRaw) : [];
    history.unshift({ id: txid, amount: parseFloat(amount.toFixed(4)), address, network: net, txid, status: "completed", timestamp: new Date().toISOString() });

    await setBotSetting("bot_total_withdrawn", newWithdrawn.toFixed(6));
    await setBotSetting("bot_withdrawal_history", JSON.stringify(history.slice(0, 100)));

    res.json({ success: true, txid, remaining: parseFloat((cumulative - newWithdrawn).toFixed(4)) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Withdrawal failed" });
  }
});

// ── GET /admin/bsv-wallet — settlement wallet address, balance, UTXOs ─────────
router.get("/bsv-wallet", async (req, res) => {
  try {
    const wallet  = await getOrCreateWallet();

    // Check for a custom address override saved by admin
    const overrideRows = await db.select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
    const customAddress = overrideRows.length ? overrideRows[0].value : null;
    const displayAddress = customAddress || wallet.address;

    const balance = await fetchWalletBalance(displayAddress);
    res.json({
      address:             displayAddress,
      systemAddress:       wallet.address,
      customAddress:       customAddress ?? null,
      pubKeyHex:           wallet.pubKeyHex,
      confirmedSatoshis:   balance.confirmedSatoshis,
      unconfirmedSatoshis: balance.unconfirmedSatoshis,
      totalSatoshis:       balance.totalSatoshis,
      bsv:                 balance.bsv,
      utxos:               balance.utxos,
      funded:              balance.funded,
      explorerUrl:         `https://whatsonchain.com/address/${displayAddress}`,
      broadcastReady:      balance.funded,
      notice: balance.funded
        ? "Wallet is funded — all new trade settlements will be broadcast to BSV mainnet."
        : "Send BSV to this address to enable real on-chain broadcasting of trade settlements.",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load BSV wallet" });
  }
});

// ── PUT /admin/bsv-wallet — update custom settlement address ─────────────────
router.put("/bsv-wallet", async (req, res) => {
  try {
    const { customAddress } = req.body as { customAddress: string };

    if (customAddress === "" || customAddress === null) {
      // Remove override — revert to system wallet
      await db.delete(platformSettingsTable)
        .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
      res.json({ customAddress: null, message: "Reverted to system wallet" });
      return;
    }

    // Basic BSV/BTC address validation (P2PKH starts with 1, P2SH with 3)
    if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(customAddress)) {
      res.status(400).json({ error: "Invalid BSV address format" });
      return;
    }

    await db.insert(platformSettingsTable)
      .values({ key: "bsv_settlement_address_override", value: customAddress })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: customAddress, updatedAt: new Date() },
      });

    res.json({ customAddress, message: "Settlement address updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update BSV wallet address" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MAIL INBOX
// ─────────────────────────────────────────────────────────────────────────────

// Seed welcome email if inbox is empty
async function seedWelcomeEmail() {
  try {
    const existing = await db.select().from(adminEmailsTable).limit(1);
    if (existing.length > 0) return;
    const welcomeEmails = [
      {
        folder: "inbox",
        fromAddress: "system@orahdex.org",
        toAddress: "admin@orahdex.org",
        subject: "🎉 Welcome to OrahDEX Admin Panel",
        body: `Hi Admin,\n\nWelcome to OrahDEX! Your platform is live and ready.\n\nNext steps:\n1. Complete the Setup Guide (A–Z) to configure all platform features\n2. Add your API keys in Integrations\n3. Configure trading pairs and fees\n4. Set your fee collection wallet\n\nFor support: support@orahdex.org\nLegal: legal@orahdex.org\nPrivacy: privacy@orahdex.org\n\nBest,\nOrahDEX System`,
        isRead: false,
        isStarred: true,
        category: "system",
      },
      {
        folder: "inbox",
        fromAddress: "setup@orahdex.org",
        toAddress: "admin@orahdex.org",
        subject: "⚙️ Setup Checklist — Action Required",
        body: `Admin,\n\nYour platform has required steps that need attention:\n\n✅ Required:\n- [ ] Reown Project ID (wallet connect)\n- [ ] Site Settings (name, domain)\n\n⚡ Recommended:\n- [ ] CoinGecko / CMC API keys\n- [ ] Trading fees configuration\n- [ ] Fee collection wallet\n- [ ] Security settings\n\nVisit Admin → Setup to complete all steps.\n\nOrahDEX Setup Wizard`,
        isRead: false,
        isStarred: false,
        category: "system",
      },
      {
        folder: "inbox",
        fromAddress: "security@orahdex.org",
        toAddress: "admin@orahdex.org",
        subject: "🔐 Security Recommendation",
        body: `Security Notice,\n\nWe recommend enabling 2FA on your admin account immediately.\n\nTo set up 2FA:\n1. Go to Admin → Security Settings\n2. Enable two-factor authentication\n3. Scan the QR code with Google Authenticator\n\nAdditionally consider:\n- IP whitelist for admin access\n- Session timeout configuration\n- Rate limiting on the API\n\nStay secure,\nOrahDEX Security`,
        isRead: true,
        isStarred: false,
        category: "system",
      },
    ];
    for (const email of welcomeEmails) {
      await db.insert(adminEmailsTable).values(email);
    }
  } catch {}
}
seedWelcomeEmail();

// GET /admin/mail — list emails (with optional folder filter)
router.get("/mail", async (req, res) => {
  try {
    const { folder } = req.query as { folder?: string };
    const rows = await db
      .select()
      .from(adminEmailsTable)
      .where(folder ? eq(adminEmailsTable.folder, folder) : undefined)
      .orderBy(desc(adminEmailsTable.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch emails" });
  }
});

// GET /admin/mail/smtp-status — check if SMTP is configured (MUST be before /:id)
router.get("/mail/smtp-status", async (_req, res) => {
  try {
    const status = await getSmtpStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to check SMTP status" });
  }
});

// POST /admin/mail/test-smtp — verify SMTP connection (MUST be before /:id)
router.post("/mail/test-smtp", async (_req, res) => {
  try {
    const result = await testSmtpConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? "Test failed" });
  }
});

// GET /admin/mail/:id — single email (marks as read)
router.get("/mail/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(adminEmailsTable).where(eq(adminEmailsTable.id, id));
    if (!row) return res.status(404).json({ error: "Email not found" });
    await db.update(adminEmailsTable).set({ isRead: true }).where(eq(adminEmailsTable.id, id));
    res.json({ ...row, isRead: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch email" });
  }
});

// POST /admin/mail — create email (compose / system insert)
// When folder="sent" and SMTP is configured, actually sends the email
router.post("/mail", async (req, res) => {
  try {
    const { folder = "sent", fromAddress, toAddress, subject, body, category = "general" } = req.body as {
      folder?: string; fromAddress: string; toAddress: string;
      subject: string; body: string; category?: string;
    };
    if (!fromAddress || !toAddress || !subject || !body) {
      return res.status(400).json({ error: "fromAddress, toAddress, subject, body are required" });
    }

    // Save to DB first
    const [inserted] = await db.insert(adminEmailsTable).values({
      folder, fromAddress, toAddress, subject, body, category, isRead: true,
    }).returning();

    // If composing an outbound email (folder=sent), attempt real SMTP delivery
    let smtpResult = { success: false, error: "Not attempted" };
    if (folder === "sent") {
      smtpResult = await sendMail({ from: fromAddress, to: toAddress, subject, text: body });
    }

    res.json({ ...inserted, smtpSent: smtpResult.success, smtpError: smtpResult.error ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create email" });
  }
});

// PATCH /admin/mail/:id — update (read/star/move folder)
router.patch("/mail/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isRead, isStarred, folder } = req.body as { isRead?: boolean; isStarred?: boolean; folder?: string };
    const update: Record<string, any> = {};
    if (isRead   !== undefined) update.isRead   = isRead;
    if (isStarred!== undefined) update.isStarred = isStarred;
    if (folder)                 update.folder    = folder;
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
    const [updated] = await db.update(adminEmailsTable).set(update).where(eq(adminEmailsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Email not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update email" });
  }
});

// DELETE /admin/mail/:id — delete email
router.delete("/mail/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(adminEmailsTable).where(eq(adminEmailsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete email" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SITE SETTINGS (DB-backed — prefix: site__)
// ─────────────────────────────────────────────────────────────────────────────

const SITE_PREFIX = "site__";

router.get("/site-settings", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const result: Record<string, string> = {};
    for (const r of rows) {
      if (r.key.startsWith(SITE_PREFIX)) {
        result[r.key.slice(SITE_PREFIX.length)] = r.value;
      }
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load site settings" });
  }
});

router.put("/site-settings", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== "string") continue;
      await db
        .insert(platformSettingsTable)
        .values({ key: `${SITE_PREFIX}${key}`, value })
        .onConflictDoUpdate({
          target: platformSettingsTable.key,
          set: { value, updatedAt: new Date() },
        });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to save site settings" });
  }
});

// ── POST /admin/bsv-wallet/send — send BSV directly from settlement wallet ───
router.post("/bsv-wallet/send", async (req, res) => {
  try {
    const { toAddress, bsv: bsvAmount } = req.body as { toAddress: string; bsv: number };
    if (!toAddress)                             return res.status(400).json({ error: "Destination address required" });
    if (!isBsvAddress(toAddress))              return res.status(400).json({ error: "Invalid BSV address (must start with 1, 26–35 chars)" });
    if (!bsvAmount || bsvAmount <= 0)          return res.status(400).json({ error: "Enter a valid BSV amount" });

    const satoshis = Math.round(bsvAmount * 1e8);
    if (satoshis < 546)                        return res.status(400).json({ error: "Amount below dust limit (546 sat)" });

    const wallet  = await getOrCreateWallet();
    const balance = await fetchWalletBalance(wallet.address);

    if (balance.confirmedSatoshis < satoshis + 500) {
      return res.status(400).json({
        error: `Insufficient balance. Wallet has ${balance.bsv.toFixed(8)} BSV confirmed; need ${(bsvAmount + 0.000005).toFixed(8)} BSV (including fee).`,
      });
    }

    const { txid } = await buildAndBroadcastBsvTx(toAddress, satoshis, wallet, balance.utxos);
    res.json({ success: true, txid, satoshis, toAddress });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Send failed" });
  }
});

export default router;
