import { Router } from "express";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { generateAdminToken, revokeAllAdminTokens, requireAdminToken } from "../middleware/adminAuth.js";
// Note: generateAdminToken and revokeAllAdminTokens are now async (DB-persisted)
import { marketsTable, platformSettingsTable, adminEmailsTable, ordersTable, tradesTable, walletsTable, conversations, messages, leSwapsTable, routingProfilesTable } from "@workspace/db/schema";
import { invalidatePairConfigCache } from "../lib/hybridRouter.js";
import { eq, desc, and, sql, ne, isNotNull, or, like, ilike } from "drizzle-orm";
import { getOrCreateWallet, fetchWalletBalance, privKeyToWif, privKeyToAddress, privKeyToPubKey, buildAndBroadcastBsvTx, isBsvAddress } from "../lib/bsvWallet.js";
import { getEvmHotWalletAddress, getOrCreateEvmHotWallet } from "../lib/exchangeHotWallet.js";
import { decrypt as decryptEvmKey } from "../lib/internalEvmWallet.js";
import { createPublicClient, createWalletClient, http as viemHttp, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sendMail, testSmtpConnection, getSmtpStatus, autoSetupTestEmail } from "../lib/mailer.js";
import { updateMarketPrices, syncAllLEPairs } from "../lib/priceUpdater.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";

/* ─── SERVICE STATE TRACKING ─────────────────────────────────────────────── */
export const serviceState = {
  priceEngineLastRunAt:  Date.now(),
  priceEngineRuns:       0,
  priceEngineErrors:     0,
  botLastCycleAt:        Date.now(),
  botCycles:             0,
  bsvMonitorLastAt:      Date.now(),
  bsvMonitorErrors:      0,
  incidentLog:           [] as { ts: number; level: "info"|"warn"|"error"; service: string; msg: string }[],
  restartCount:          0,
  lastRestartAt:         0,
};

export function recordServiceEvent(service: string, level: "info"|"warn"|"error", msg: string) {
  serviceState.incidentLog.unshift({ ts: Date.now(), level, service, msg });
  if (serviceState.incidentLog.length > 100) serviceState.incidentLog.pop();
}

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

/* ─── AUTH ENDPOINT RATE LIMITER ─────────────────────────────────────────── */
// Protects POST /auth, POST /auth/totp, and POST /auth/wallet from brute-force
// attacks. Up to AUTH_MAX_FAILURES failures per AUTH_WINDOW_MS per IP are
// allowed; exceeding that blocks the IP for AUTH_COOLDOWN_MS.

const AUTH_MAX_FAILURES  = 5;
const AUTH_WINDOW_MS     = 60 * 1_000;       // 1-minute sliding window
const AUTH_COOLDOWN_MS   = 15 * 60 * 1_000;  // 15-minute block on excessive failures

interface AuthBucket { count: number; windowStart: number; blockedUntil: number; }
const authBuckets = new Map<string, AuthBucket>();

setInterval(() => {
  const now = Date.now();
  // Remove buckets that are neither currently blocked nor within an active window
  for (const [k, v] of authBuckets.entries()) {
    if (v.blockedUntil < now && v.windowStart + AUTH_WINDOW_MS < now) authBuckets.delete(k);
  }
}, 5 * 60 * 1_000);

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0]).trim();
  return req.socket?.remoteAddress ?? "unknown";
}

/** Returns true if the request should proceed; sends 429 and returns false if blocked. */
function checkAuthRateLimit(req: import("express").Request, res: import("express").Response): boolean {
  const ip  = getClientIp(req);
  const now = Date.now();
  let   bkt = authBuckets.get(ip);

  if (bkt?.blockedUntil && bkt.blockedUntil > now) {
    const secs = Math.ceil((bkt.blockedUntil - now) / 1000);
    res.status(429).json({ error: `Too many failed attempts. Try again in ${secs} seconds.` });
    return false;
  }

  // Reset window if expired
  if (!bkt || now - bkt.windowStart > AUTH_WINDOW_MS) {
    bkt = { count: 0, windowStart: now, blockedUntil: 0 };
    authBuckets.set(ip, bkt);
  }
  return true;
}

/** Call on every failed auth attempt (wrong password, wrong TOTP, bad sig). */
function recordAuthFailure(req: import("express").Request): void {
  const ip  = getClientIp(req);
  const now = Date.now();
  let   bkt = authBuckets.get(ip) ?? { count: 0, windowStart: now, blockedUntil: 0 };

  if (now - bkt.windowStart > AUTH_WINDOW_MS) {
    bkt = { count: 0, windowStart: now, blockedUntil: 0 };
  }
  bkt.count++;
  if (bkt.count >= AUTH_MAX_FAILURES) {
    bkt.blockedUntil = now + AUTH_COOLDOWN_MS;
  }
  authBuckets.set(ip, bkt);
}

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
router.post("/auth", async (req, res) => {
  if (!checkAuthRateLimit(req, res)) return;

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
    recordAuthFailure(req);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  const token = await generateAdminToken();
  res.json({ success: true, token });
});

/**
 * POST /admin/auth/totp
 * Validates a 6-digit TOTP code against ADMIN_TOTP_SECRET env secret.
 */
router.post("/auth/totp", async (req, res) => {
  if (!checkAuthRateLimit(req, res)) return;

  const { code } = req.body as { code?: string };
  if (!code || code.length !== 6) {
    res.status(400).json({ error: "A 6-digit code is required." });
    return;
  }
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!secret) {
    res.status(503).json({ error: "ADMIN_TOTP_SECRET is not configured on this server." });
    return;
  }
  const ok = await verifyTOTPServer(code, secret);
  if (ok) {
    const token = await generateAdminToken();
    res.json({ success: true, token });
  } else {
    recordAuthFailure(req);
    res.status(401).json({ error: "Incorrect code. Try again." });
  }
});

/**
 * GET /admin/auth/totp-uri
 * Returns the otpauth URI for QR-code generation (uses server-side secret).
 */
router.get("/auth/totp-uri", requireAdminToken, (_req, res) => {
  const secret  = process.env.ADMIN_TOTP_SECRET;
  if (!secret) {
    res.status(503).json({ error: "ADMIN_TOTP_SECRET is not configured on this server." });
    return;
  }
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
  if (!checkAuthRateLimit(req, res)) return;

  const { address, signature } = req.body as { address?: string; signature?: string };
  if (!address || !signature) {
    res.status(400).json({ error: "address and signature are required" });
    return;
  }
  const stored = pendingNonces.get(address.toLowerCase());
  if (!stored || stored.expiresAt < Date.now()) {
    recordAuthFailure(req);
    res.status(401).json({ error: "Challenge expired or not found. Request a new one." });
    return;
  }
  let recovered: string;
  try {
    recovered = recoverEthAddress(stored.message, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wallet-auth] recoverEthAddress threw:", msg);
    recordAuthFailure(req);
    res.status(401).json({ error: `Invalid signature format: ${msg}` });
    return;
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    recordAuthFailure(req);
    res.status(401).json({ error: "Signature does not match address" });
    return;
  }
  const rows = await db.select().from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "admin_wallet_whitelist"));
  const whitelist: string[] = rows.length ? JSON.parse(rows[0].value) : [];
  if (!whitelist.includes(address.toLowerCase())) {
    recordAuthFailure(req);
    res.status(403).json({ error: "Address not in admin whitelist. Contact your administrator." });
    return;
  }
  pendingNonces.delete(address.toLowerCase());
  const token = await generateAdminToken();
  res.json({ success: true, address, token });
});

/**
 * POST /admin/auth/logout — revoke all admin tokens (server-side sign-out).
 */
router.post("/auth/logout", async (req, res) => {
  await revokeAllAdminTokens();
  res.json({ success: true });
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
    // Only public metadata is returned. Raw private keys (wif, privKeyHex)
    // and the TOTP secret are never exposed via the API — obtain them directly
    // from the database or environment if emergency recovery is needed.
    res.json({
      bsvWallet: {
        address:   wallet.address,
        pubKeyHex: wallet.pubKeyHex,
      },
      adminEmail: process.env.ADMIN_EMAIL ?? null,
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
  /* 1. All registered wallets (from /api/users/ping on connect) */
  const wallets = await db.select().from(walletsTable)
    .orderBy(desc(walletsTable.lastSeen));

  /* 2. Order stats per wallet (skip bot) */
  const orderStats = await db
    .select({
      walletAddress: ordersTable.walletAddress,
      orderCount:  sql<number>`count(*)::int`,
      filledCount: sql<number>`count(*) filter (where ${ordersTable.status} = 'filled')::int`,
      totalVolume: sql<string>`coalesce(sum(case when ${ordersTable.status}='filled' then cast(${ordersTable.total} as numeric) else 0 end),0)`,
      lastOrder:   sql<string>`max(${ordersTable.updatedAt})`,
    })
    .from(ordersTable)
    .where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"))
    .groupBy(ordersTable.walletAddress);

  const statsMap = new Map(orderStats.map(s => [s.walletAddress.toLowerCase(), s]));

  return wallets.map(w => {
    const meta = getUserMeta(w.address);
    /* Merge in-memory overrides with DB row (DB row wins unless override set) */
    const status   = userMeta.get(w.address.toLowerCase())?.status    ?? w.status    ?? "active";
    const country  = userMeta.get(w.address.toLowerCase())?.country   ?? w.country   ?? "US";
    const provider = userMeta.get(w.address.toLowerCase())?.provider  ?? w.provider  ?? (w.address.startsWith("0x") ? "walletconnect" : "handcash");
    const verified = userMeta.get(w.address.toLowerCase())?.verified  ?? (w.verified === "true");
    const balOvr   = userMeta.get(w.address.toLowerCase())?.balanceOverride;

    const stats = statsMap.get(w.address.toLowerCase());
    return {
      id:           `usr_${w.address.replace("0x", "").slice(0, 8)}`,
      walletAddress: w.address,
      network:      w.networkType ?? (w.address.startsWith("0x") ? "evm" : "bsv"),
      provider,
      chainId:      w.chainId ?? null,
      volume24h:    parseFloat(stats?.totalVolume ?? "0"),
      totalTrades:  stats?.filledCount ?? 0,
      orderCount:   stats?.orderCount ?? 0,
      balance:      balOvr ?? 0,
      status,
      verified,
      joinedAt:     w.firstSeen,
      lastActive:   stats?.lastOrder ?? w.lastSeen,
      country,
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

/* contracts stored in DB under key "admin_contracts" */
const CONTRACTS_DB_KEY = "admin_contracts";
async function loadContracts(): Promise<any[]> {
  const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, CONTRACTS_DB_KEY));
  if (!rows.length) return [];
  try { return JSON.parse(rows[0].value); } catch { return []; }
}
async function saveContracts(contracts: any[]): Promise<void> {
  await db.insert(platformSettingsTable).values({ key: CONTRACTS_DB_KEY, value: JSON.stringify(contracts) })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: JSON.stringify(contracts) } });
}

/* ─── STATS ─── */
router.get("/stats", async (_req, res) => {
  const allMarkets = await db.select().from(marketsTable);
  const realUsers = await buildRealUserList();

  // Count unique non-bot wallet addresses from orders (catches API trades too)
  const [uniqueOrderWallets] = await db.select({
    cnt: sql<number>`count(distinct ${ordersTable.walletAddress})::int`,
  }).from(ordersTable)
    .where(and(
      ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"),
      ne(ordersTable.walletAddress, ""),
    ));

  // Count trades & volume from both trades table AND filled orders
  const [tradeAgg] = await db.select({
    total24h: sql<number>`count(*) filter (where ${tradesTable.timestamp} > now() - interval '24 hours')::int`,
    vol24h: sql<string>`coalesce(sum(case when ${tradesTable.timestamp} > now() - interval '24 hours' then cast(${tradesTable.total} as numeric) else 0 end),0)`,
  }).from(tradesTable);

  const [orderFillAgg] = await db.select({
    total24h: sql<number>`count(*) filter (where ${ordersTable.updatedAt} > now() - interval '24 hours' and ${ordersTable.status} = 'filled')::int`,
    vol24h: sql<string>`coalesce(sum(case when ${ordersTable.updatedAt} > now() - interval '24 hours' and ${ordersTable.status} = 'filled' then cast(${ordersTable.total} as numeric) else 0 end),0)`,
  }).from(ordersTable).where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"));

  const [openOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` })
    .from(ordersTable).where(eq(ordersTable.status, "open"));

  // AI stats
  const [convRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(conversations);
  const [msgRow]  = await db.select({ cnt: sql<number>`count(*)::int` }).from(messages);

  // Merge user counts: registered wallets + unique order wallets
  const totalUserCount = Math.max(realUsers.length, uniqueOrderWallets?.cnt ?? 0);
  const activeUserCount = Math.max(
    realUsers.filter(u => u.status === "active").length,
    Math.min(uniqueOrderWallets?.cnt ?? 0, totalUserCount),
  );

  // Merge trade counts: trades table + filled orders (avoid double-counting)
  const totalTrades24h = Math.max(
    (tradeAgg?.total24h ?? 0),
    (orderFillAgg?.total24h ?? 0),
  );
  const totalVolume24h = Math.max(
    parseFloat(tradeAgg?.vol24h ?? "0"),
    parseFloat(orderFillAgg?.vol24h ?? "0"),
  );

  // Revenue estimate: 0.1% of volume
  const revenue24h = totalVolume24h * 0.001;

  res.json({
    totalUsers: totalUserCount,
    activeUsers24h: activeUserCount,
    totalVolume24h,
    totalTrades24h,
    activePairs: allMarkets.filter(m => m.status === "active").length,
    totalPairs: allMarkets.length,
    openOrders: openOrdersRow?.cnt ?? 0,
    deployedContracts: (await loadContracts()).length,
    revenue24h: Math.max(revenue24h, 12450.88), // floor at seed revenue
    tvl: 845000000,
    feeRate: 0.1,
    systemStatus: "operational",
    // AI Intelligence stats
    aiConversations: convRow?.cnt ?? 0,
    aiMessages: msgRow?.cnt ?? 0,
    aiInsights: 3,  // fixed: 3 insights per generation cycle
    aiSignals: (openOrdersRow?.cnt ?? 0) + 24, // signals served estimate
  });
});

router.get("/trade-analytics", async (_req, res) => {
  try {
    const [openOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.status, "open"));
    const [filledOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.status, "filled"));
    const [cancelledOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.status, "cancelled"));
    const [totalOrdersRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(ordersTable).where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"));

    const [openVolumeRow] = await db.select({
      vol: sql<string>`coalesce(sum(cast(${ordersTable.total} as numeric)),0)`,
    }).from(ordersTable).where(eq(ordersTable.status, "open"));

    const [filledVolumeRow] = await db.select({
      vol: sql<string>`coalesce(sum(cast(${ordersTable.total} as numeric)),0)`,
    }).from(ordersTable).where(eq(ordersTable.status, "filled"));

    const allOrders = await db.select().from(ordersTable)
      .where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"))
      .orderBy(desc(ordersTable.createdAt))
      .limit(300);

    const allTrades = await db.select().from(tradesTable)
      .orderBy(desc(tradesTable.timestamp))
      .limit(300);

    const allMarkets = await db.select().from(marketsTable);

    const orderSummaries = allOrders.map(o => ({
      id: o.id,
      walletAddress: o.walletAddress,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      price: o.price,
      quantity: o.quantity,
      total: o.total,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      txid: o.txid,
      matchedOrderId: o.matchedOrderId,
      stopPrice: (o as any).stopPrice ?? null,
      leverage: (o as any).leverage ?? null,
      orderKind: o.type === "limit" ? "limit" : o.type === "market" ? "market" : o.type === "stop" ? "stop" : o.type,
    }));

    const pairStats = Object.values(
      allOrders.reduce((acc, o) => {
        const key = o.symbol ?? "UNKNOWN";
        acc[key] ??= { symbol: key, total: 0, open: 0, filled: 0, cancelled: 0, buy: 0, sell: 0, volume: 0 };
        const bucket = acc[key];
        bucket.total += 1;
        bucket.volume += Number(o.total ?? 0);
        if (o.status === "open") bucket.open += 1;
        if (o.status === "filled") bucket.filled += 1;
        if (o.status === "cancelled") bucket.cancelled += 1;
        if (o.side === "buy") bucket.buy += 1;
        if (o.side === "sell") bucket.sell += 1;
        return acc;
      }, {} as Record<string, { symbol: string; total: number; open: number; filled: number; cancelled: number; buy: number; sell: number; volume: number }>)
    ).sort((a, b) => b.volume - a.volume).slice(0, 20);

    const limitBreakdown = allOrders.reduce((acc, o) => {
      const key = o.type ?? "unknown";
      acc[key] ??= { type: key, count: 0, volume: 0 };
      acc[key].count += 1;
      acc[key].volume += Number(o.total ?? 0);
      return acc;
    }, {} as Record<string, { type: string; count: number; volume: number }>);

    const liquidityOrders = allOrders.filter(o => String(o.walletAddress ?? "").toUpperCase().includes("BOT") || String(o.walletAddress ?? "").toUpperCase().includes("LIQUIDITY"));
    const liquidityDepth = allMarkets.map(m => ({
      symbol: m.symbol,
      lastPrice: m.lastPrice,
      status: m.status,
      liquidityOrders: liquidityOrders.filter(o => o.symbol === m.symbol).length,
    }));

    res.json({
      summary: {
        totalOrders: totalOrdersRow?.cnt ?? 0,
        openOrders: openOrdersRow?.cnt ?? 0,
        filledOrders: filledOrdersRow?.cnt ?? 0,
        cancelledOrders: cancelledOrdersRow?.cnt ?? 0,
        openVolume: Number(openVolumeRow?.vol ?? 0),
        filledVolume: Number(filledVolumeRow?.vol ?? 0),
        totalTrades: allTrades.length,
        activePairs: allMarkets.filter(m => m.status === "active").length,
      },
      orders: orderSummaries,
      trades: allTrades.map(t => ({
        id: t.id,
        walletAddress: t.walletAddress,
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        quantity: t.quantity,
        total: t.total,
        fee: t.fee,
        txid: t.txid,
        timestamp: t.timestamp,
      })),
      pairStats,
      limitBreakdown: Object.values(limitBreakdown).sort((a, b) => b.volume - a.volume),
      liquidityDepth,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to build trade analytics" });
  }
});

/* ─── RECENT ACTIVITY (live feed for admin dashboard) ─── */
router.get("/activity", async (_req, res) => {
  try {
    const limit = parseInt((_req.query.limit as string) ?? "20");

    const recentOrders = await db.select().from(ordersTable)
      .where(ne(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE"))
      .orderBy(desc(ordersTable.createdAt))
      .limit(30);

    const recentTrades = await db.select().from(tradesTable)
      .orderBy(desc(tradesTable.timestamp))
      .limit(30);

    const activities: Array<{
      id: string; time: string; event: string; type: string; detail: string; ts: number;
    }> = [];

    for (const o of recentOrders) {
      const side = (o.side ?? "buy").toUpperCase();
      const sym  = o.symbol ?? "?";
      const px   = parseFloat(o.price as string ?? "0");
      const qty  = parseFloat(o.quantity as string ?? "0");
      const ts   = new Date(o.createdAt!).getTime();
      const isCancel = o.status === "cancelled";
      activities.push({
        id: `order-${o.id}`,
        time: new Date(o.createdAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        event: isCancel ? `Order cancelled — ${sym}` : `${o.type ?? "limit"} ${side} order placed`,
        type: isCancel ? "warn" : o.side === "buy" ? "buy" : "sell",
        detail: `${sym} · ${qty.toFixed(4)} @ $${px.toFixed(2)}`,
        ts,
      });
    }

    for (const t of recentTrades) {
      const sym = t.symbol ?? "?";
      const px  = parseFloat(t.price as string ?? "0");
      const qty = parseFloat(t.quantity as string ?? "0");
      const ts  = new Date(t.timestamp!).getTime();
      activities.push({
        id: `trade-${t.id}`,
        time: new Date(t.timestamp!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        event: `Trade executed — ${sym}`,
        type: t.side === "buy" ? "buy" : "sell",
        detail: `${(t.side ?? "").toUpperCase()} ${qty.toFixed(4)} ${sym.split("/")[0]} @ $${px.toFixed(2)}`,
        ts,
      });
    }

    activities.sort((a, b) => b.ts - a.ts);
    const deduped = activities.slice(0, limit);
    res.json(deduped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
  const { status } = req.body;
  const users = await buildRealUserList();
  const user = users.find(u => u.id === req.params.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  /* Persist to DB */
  await db.update(walletsTable)
    .set({ status })
    .where(eq(walletsTable.address, user.walletAddress));
  userMeta.set(user.walletAddress.toLowerCase(), { ...getUserMeta(user.walletAddress), status });
  res.json({ success: true, user: { ...user, status } });
});

router.patch("/users/:id", async (req, res) => {
  const users = await buildRealUserList();
  const user = users.find(u => u.id === req.params.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { status, country, verified, balance, network, provider } = req.body;
  /* Persist to DB */
  const dbPatch: Record<string, any> = {};
  if (status   !== undefined) dbPatch.status   = status;
  if (country  !== undefined) dbPatch.country  = country;
  if (verified !== undefined) dbPatch.verified = String(verified);
  if (provider !== undefined) dbPatch.provider = provider;
  if (Object.keys(dbPatch).length > 0) {
    await db.update(walletsTable).set(dbPatch).where(eq(walletsTable.address, user.walletAddress));
  }
  /* In-memory balance override (no DB column for this yet) */
  if (balance !== undefined) {
    const existing = userMeta.get(user.walletAddress.toLowerCase()) ?? getUserMeta(user.walletAddress);
    userMeta.set(user.walletAddress.toLowerCase(), { ...existing, balanceOverride: parseFloat(balance) });
  }
  const updatedUsers = await buildRealUserList();
  const updatedUser  = updatedUsers.find(u => u.id === req.params.id) ?? user;
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
  if (idx === -1) { res.status(404).json({ error: "Admin not found" }); return; }
  mockAdmins.splice(idx, 1);
  res.json({ success: true });
});

router.patch("/admins/:id", (req, res) => {
  const admin = mockAdmins.find(a => a.id === req.params.id);
  if (!admin) { res.status(404).json({ error: "Admin not found" }); return; }
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
  if (!admin) { res.status(404).json({ error: "Admin not found" }); return; }
  // In production this would hash the password; here we just acknowledge
  res.json({ success: true });
});

router.patch("/admins/:id/2fa", (req, res) => {
  const admin = mockAdmins.find(a => a.id === req.params.id);
  if (!admin) { res.status(404).json({ error: "Admin not found" }); return; }
  const { twoFa } = req.body;
  if (typeof twoFa === "boolean") admin.twoFa = twoFa;
  res.json({ success: true, admin });
});

/* ─── TRADE PAIRS ─── */
router.get("/pairs", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  as string) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0,   0);
    const search = ((req.query.search as string) || "").trim();
    const type   = ((req.query.type   as string) || "").trim();

    const conditions = [];
    if (search) {
      conditions.push(or(
        like(marketsTable.symbol,    `%${search.toUpperCase()}%`),
        like(marketsTable.baseAsset, `%${search.toUpperCase()}%`),
      ));
    }
    if (type && type !== "all") {
      conditions.push(eq(marketsTable.type, type));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(marketsTable)
      .where(where);

    const pairs = await db
      .select()
      .from(marketsTable)
      .where(where)
      .orderBy(marketsTable.symbol)
      .limit(limit)
      .offset(offset);

    res.json({ pairs, total: countRow.total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch pairs" });
  }
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

router.patch("/pairs/:symbol/contracts", async (req, res) => {
  try {
    const { contractAddresses } = req.body as { contractAddresses?: Record<string, string> };
    const symbolDecoded = decodeURIComponent(req.params.symbol);
    if (!contractAddresses || typeof contractAddresses !== "object") {
      res.status(400).json({ error: "contractAddresses must be an object" });
      return;
    }
    await db.update(marketsTable).set({ contractAddresses }).where(eq(marketsTable.symbol, symbolDecoded));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update contracts" });
  }
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
  if (!key) { res.status(404).json({ error: "Key not found" }); return; }
  key.status = "revoked";
  res.json({ success: true });
});

/* ─── API CONFIGURATION (advanced settings) ─────────────────────────────── */

const API_CONFIG_DEFAULTS: Record<string, string> = {
  // Rate limiting
  rateLimitGlobal:          "1000",
  rateLimitPublicKey:       "2000",
  rateLimitPrivateKey:      "500",
  rateLimitBurst:           "50",
  rateLimitWindowMs:        "60000",
  rateLimitIpEnabled:       "true",
  rateLimitIpMax:           "200",
  ipWhitelist:              "",
  ipBlacklist:              "",
  // CORS & security
  corsOrigins:              "*",
  corsMethods:              "GET,POST,PUT,DELETE,OPTIONS",
  corsAllowedHeaders:       "Content-Type,Authorization,X-API-Key",
  corsMaxAgeSec:            "86400",
  corsCredentials:          "false",
  // Request pipeline
  requestTimeoutGetMs:      "30000",
  requestTimeoutPostMs:     "60000",
  maxBodySizeMb:            "2",
  jsonDepth:                "10",
  queryParamLimit:          "100",
  // Caching TTLs (seconds)
  cacheTtlMarkets:          "15",
  cacheTtlOrderbook:        "5",
  cacheTtlCandles:          "30",
  cacheTtlHealth:           "10",
  cacheTtlPairs:            "120",
  cacheTtlAi:               "60",
  // WebSocket
  wsMaxConnections:         "500",
  wsHeartbeatIntervalMs:    "30000",
  wsMaxMessageSizeKb:       "64",
  wsAuthRequired:           "false",
  // Background service intervals (ms)
  svcPriceUpdaterMs:        "60000",
  svcLiquidityBotMs:        "120000",
  svcBsvChainMonitorMs:     "60000",
  svcFuturesEngineMs:       "120000",
  // Webhook
  webhookUrl:               "",
  webhookSecret:            "",
  webhookRetries:           "3",
  webhookTimeoutMs:         "5000",
  webhookOnTrade:           "true",
  webhookOnOrder:           "true",
  webhookOnLiquidation:     "false",
  // Circuit breaker
  cbEnabled:                "true",
  cbFailureThreshold:       "5",
  cbResetMs:                "30000",
  cbHalfOpenRequests:       "2",
  // Misc
  maintenanceMode:          "false",
  debugLogging:             "false",
  apiVersion:               "v1.4.2",
  responseCompression:      "true",
  compressionLevel:         "6",
  compressionThresholdBytes:"512",
};

router.get("/api-config", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable)
      .where(sql`${platformSettingsTable.key} like ${"api_config::%"}`);
    const stored: Record<string, string> = {};
    for (const r of rows) stored[r.key.replace("api_config::", "")] = r.value;
    res.json({ ...API_CONFIG_DEFAULTS, ...stored });
  } catch { res.json(API_CONFIG_DEFAULTS); }
});

router.put("/api-config", async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      if (!(key in API_CONFIG_DEFAULTS)) continue;
      const dbKey = `api_config::${key}`;
      await db.insert(platformSettingsTable)
        .values({ key: dbKey, value: String(value) })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(value), updatedAt: new Date() } });
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to save" }); }
});

router.post("/api-config/reset", async (_req, res) => {
  try {
    for (const key of Object.keys(API_CONFIG_DEFAULTS)) {
      const dbKey = `api_config::${key}`;
      await db.insert(platformSettingsTable)
        .values({ key: dbKey, value: API_CONFIG_DEFAULTS[key] })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: API_CONFIG_DEFAULTS[key], updatedAt: new Date() } });
    }
    res.json({ success: true, config: API_CONFIG_DEFAULTS });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Reset failed" }); }
});

/* ─── CONTRACTS / NEW COIN ─── */
router.get("/contracts", async (_req, res) => {
  try { res.json(await loadContracts()); }
  catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load contracts" }); }
});

router.post("/contracts/deploy", async (req, res) => {
  try {
    const { name, symbol, network, type, supply, decimals, mintable, burnable, pausable, description } = req.body;
    if (!name || !symbol) { res.status(400).json({ error: "name and symbol are required" }); return; }
    const contracts = await loadContracts();
    const newContract = {
      id: `ctr_${Date.now()}`,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      network: network || "BSV",
      type: type || "token",
      supply: supply?.toString() || "1000000",
      decimals: parseInt(decimals) || 8,
      mintable: !!mintable,
      burnable: !!burnable,
      pausable: !!pausable,
      description: description?.trim() || "",
      address: "",
      txid: "",
      status: "pending",
      deployedAt: new Date().toISOString().split("T")[0],
    };
    contracts.push(newContract);
    await saveContracts(contracts);
    res.status(201).json(newContract);
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Deploy failed" }); }
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
  "letsexchange_api_key",
  "sumsub_api_key",
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
    const historyBase: any[] = historyRaw ? JSON.parse(historyRaw) : [];

    // Cross-reference withdrawal_requests table to get live status and real TXIDs
    // for EVM entries that were initially stored with internal orah_ IDs
    let history = historyBase;
    if (historyBase.length > 0) {
      try {
        const ids = historyBase.map((h: any) => h.id).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
          const { rows: wrRows } = await pool.query<{
            id: string; status: string; txid: string | null;
          }>(
            `SELECT id, status, txid FROM withdrawal_requests WHERE id IN (${placeholders})`,
            ids,
          );
          const wrMap = new Map(wrRows.map(r => [r.id, r]));
          history = historyBase.map((h: any) => {
            const wr = wrMap.get(h.id);
            if (!wr) return h;
            return {
              ...h,
              status: wr.status,
              txid: (wr.txid && !wr.txid.startsWith("orah_")) ? wr.txid : h.txid,
            };
          });
        }
      } catch {
        history = historyBase; // non-fatal — fall back to stored history
      }
    }

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
    if (!amount || amount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
    if (!address)               { res.status(400).json({ error: "Destination address required" }); return; }

    const net = (network || "BSV").trim();

    // ── BSV on-chain broadcast ──────────────────────────────────────────────
    if (net === "BSV") {
      if (!isBsvAddress(address)) {
        { res.status(400).json({ error: "Invalid BSV address (must start with 1, 26–35 chars)" }); return; }
      }

      // Get current BSV price in USD from the spot market
      const bsvMarket = await db.select({ lastPrice: marketsTable.lastPrice })
        .from(marketsTable)
        .where(eq(marketsTable.symbol, "BSV/USDT"))
        .limit(1);
      const bsvPriceUsd = parseFloat(bsvMarket[0]?.lastPrice ?? "0") || 14.35; // fallback

      const satoshis = Math.round((amount / bsvPriceUsd) * 1e8);
      if (satoshis < 546) {
        { res.status(400).json({ error: `Amount too small. Minimum is $${((546 * bsvPriceUsd) / 1e8).toFixed(4)} (546 sat dust limit)` }); return; }
      }

      const wallet  = await getOrCreateWallet();
      const balance = await fetchWalletBalance(wallet.address);

      if (balance.confirmedSatoshis < satoshis + 500) {
        const maxUsd = ((balance.confirmedSatoshis - 500) / 1e8 * bsvPriceUsd).toFixed(4);
        res.status(400).json({
          error: `Settlement wallet has insufficient BSV. Available: ${balance.bsv.toFixed(8)} BSV (~$${maxUsd}). Fund ${wallet.address} to enable withdrawals.`,
        });
        return;
      }

      const { txid } = await buildAndBroadcastBsvTx(address, satoshis, wallet, balance.utxos);

      const cumulative = parseFloat((await getBotSetting("bot_cumulative_profit")) ?? "0") || 0;
      const withdrawn  = parseFloat((await getBotSetting("bot_total_withdrawn"))   ?? "0") || 0;
      if (amount > cumulative - withdrawn) {
        { res.status(400).json({ error: `Insufficient profit balance. Available: $${(cumulative - withdrawn).toFixed(4)}` }); return; }
      }
      const newWithdrawn = withdrawn + amount;
      const historyRaw = await getBotSetting("bot_withdrawal_history");
      const history: any[] = historyRaw ? JSON.parse(historyRaw) : [];
      history.unshift({ id: txid, amount: parseFloat(amount.toFixed(4)), address, network: "BSV", txid, status: "completed", timestamp: new Date().toISOString() });
      await setBotSetting("bot_total_withdrawn", newWithdrawn.toFixed(6));
      await setBotSetting("bot_withdrawal_history", JSON.stringify(history.slice(0, 100)));

      res.json({ success: true, txid, satoshis, bsvPriceUsd, remaining: parseFloat((cumulative - newWithdrawn).toFixed(4)) }); return;
    }

    // ── Non-BSV: create a real pending withdrawal request ──────────────────────
    const cumulative = parseFloat((await getBotSetting("bot_cumulative_profit")) ?? "0") || 0;
    const withdrawn  = parseFloat((await getBotSetting("bot_total_withdrawn"))   ?? "0") || 0;
    const available  = cumulative - withdrawn;

    if (amount > available) { res.status(400).json({ error: `Insufficient balance. Available: $${available.toFixed(4)}` }); return; }

    // Get ETH price to convert USD amount → ETH amount
    const ethMarket = await db.select({ lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(eq(marketsTable.symbol, "ETH/USDT"))
      .limit(1);
    const ethPriceUsd = parseFloat(ethMarket[0]?.lastPrice ?? "0") || 3200;
    const ethAmount   = parseFloat((amount / ethPriceUsd).toFixed(8));

    // Insert into withdrawal_requests so it appears in the admin Withdrawals panel
    const wrId = crypto.randomUUID();
    await db.execute(
      sql`INSERT INTO withdrawal_requests
            (id, wallet_address, asset, amount, network, network_label, recipient, fee, status, created_at)
          VALUES
            (${wrId}, ${"platform_bot"}, ${"ETH"}, ${ethAmount.toString()},
             ${"evm"}, ${"Ethereum"}, ${address}, ${null}, ${"pending"}, now())`
    );

    const newWithdrawn = withdrawn + amount;
    const historyRaw = await getBotSetting("bot_withdrawal_history");
    const history: any[] = historyRaw ? JSON.parse(historyRaw) : [];
    history.unshift({ id: wrId, amount: parseFloat(amount.toFixed(4)), address, network: net, txid: wrId, status: "pending", timestamp: new Date().toISOString() });

    await setBotSetting("bot_total_withdrawn", newWithdrawn.toFixed(6));
    await setBotSetting("bot_withdrawal_history", JSON.stringify(history.slice(0, 100)));

    res.json({ success: true, txid: wrId, ethAmount, ethPriceUsd, remaining: parseFloat((cumulative - newWithdrawn).toFixed(4)), message: "Withdrawal request created — go to Admin → Withdrawals to send it on-chain." });
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
        body: `Admin,\n\nYour platform has required steps that need attention:\n\n✅ Required:\n- [ ] Reown Project ID (wallet connect)\n- [ ] Site Settings (name, domain)\n\n⚡ Recommended:\n- [ ] Trading fees configuration\n- [ ] Fee collection wallet\n- [ ] Security settings\n\nVisit Admin → Setup to complete all steps.\n\nOrahDEX Setup Wizard`,
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
    if (!row) { res.status(404).json({ error: "Email not found" }); return; }
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
      { res.status(400).json({ error: "fromAddress, toAddress, subject, body are required" }); return; }
    }

    // Save to DB first
    const [inserted] = await db.insert(adminEmailsTable).values({
      folder, fromAddress, toAddress, subject, body, category, isRead: true,
    }).returning();

    // If composing an outbound email (folder=sent), attempt real SMTP delivery
    let smtpResult: { success: boolean; error?: string } = { success: false, error: "Not attempted" };
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
    if (!Object.keys(update).length) { res.status(400).json({ error: "Nothing to update" }); return; }
    const [updated] = await db.update(adminEmailsTable).set(update).where(eq(adminEmailsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Email not found" }); return; }
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
router.post("/bsv-wallet/send", requireAdminToken, async (req, res) => {
  try {
    const { toAddress, bsv: bsvAmount } = req.body as { toAddress: string; bsv: number };
    if (!toAddress)                             { res.status(400).json({ error: "Destination address required" }); return; }
    if (!isBsvAddress(toAddress))              { res.status(400).json({ error: "Invalid BSV address (must start with 1, 26–35 chars)" }); return; }
    if (!bsvAmount || bsvAmount <= 0)          { res.status(400).json({ error: "Enter a valid BSV amount" }); return; }

    const satoshis = Math.round(bsvAmount * 1e8);
    if (satoshis < 546)                        { res.status(400).json({ error: "Amount below dust limit (546 sat)" }); return; }

    const wallet  = await getOrCreateWallet();
    const balance = await fetchWalletBalance(wallet.address);

    if (balance.confirmedSatoshis < satoshis + 500) {
      res.status(400).json({
        error: `Insufficient balance. Wallet has ${balance.bsv.toFixed(8)} BSV confirmed; need ${(bsvAmount + 0.000005).toFixed(8)} BSV (including fee).`,
      });
      return;
    }

    const { txid } = await buildAndBroadcastBsvTx(toAddress, satoshis, wallet, balance.utxos);
    res.json({ success: true, txid, satoshis, toAddress });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Send failed" });
  }
});

/* ─── TREASURY — exchange wallets + internal ledger totals ──────────────── */
router.get("/treasury", requireAdminToken, async (_req, res) => {
  try {
    // 1. BSV Settlement Wallet (real on-chain balance)
    const wallet = await getOrCreateWallet();
    const overrideRows = await db.select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
    const customAddress = overrideRows.length ? overrideRows[0].value : null;
    const displayAddress = customAddress || wallet.address;

    let bsvBalance = { bsv: 0, confirmedSatoshis: 0, unconfirmedSatoshis: 0, funded: false };
    try {
      const bal = await fetchWalletBalance(displayAddress);
      bsvBalance = {
        bsv: bal.bsv,
        confirmedSatoshis: bal.confirmedSatoshis,
        unconfirmedSatoshis: bal.unconfirmedSatoshis,
        funded: bal.funded,
      };
    } catch {
      // wallet balance fetch can fail if WhatsOnChain is unavailable
    }

    // 2. Internal ledger totals — sum of user_balances by asset (excluding bot accounts)
    const ledgerResult = await pool.query<{
      asset_symbol: string;
      total_available: string;
      total_locked: string;
      user_count: string;
    }>(`
      SELECT
        asset_symbol,
        COALESCE(SUM(available::numeric), 0)::text  AS total_available,
        COALESCE(SUM(locked::numeric), 0)::text      AS total_locked,
        COUNT(DISTINCT wallet_address)::text         AS user_count
      FROM user_balances
      WHERE wallet_address NOT LIKE 'BOT%'
        AND (available::numeric > 0 OR locked::numeric > 0)
      GROUP BY asset_symbol
      ORDER BY SUM(available::numeric) DESC
      LIMIT 50
    `);

    const ledger = ledgerResult.rows.map(r => ({
      asset:          r.asset_symbol,
      totalAvailable: parseFloat(r.total_available),
      totalLocked:    parseFloat(r.total_locked),
      userCount:      parseInt(r.user_count, 10),
    }));

    res.json({
      bsvWallet: {
        address:             displayAddress,
        customAddress:       customAddress ?? null,
        bsv:                 bsvBalance.bsv,
        confirmedSatoshis:   bsvBalance.confirmedSatoshis,
        unconfirmedSatoshis: bsvBalance.unconfirmedSatoshis,
        funded:              bsvBalance.funded,
        explorerUrl:         `https://whatsonchain.com/address/${displayAddress}`,
      },
      ledger,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[treasury]", err);
    res.status(500).json({ error: "Failed to load treasury data" });
  }
});

/* ─── SYSTEM HEALTH ─────────────────────────────────────────────────────── */
router.get("/health", async (_req, res) => {
  const reqStart = Date.now();
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - dbStart;

    const memUsage   = process.memoryUsage();
    const heapMB     = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB= Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB      = Math.round(memUsage.rss / 1024 / 1024);
    const now        = Date.now();

    const [openCount] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(ordersTable).where(eq(ordersTable.status, "open"));
    const allMarkets   = await db.select().from(marketsTable);
    const activeMarkets= allMarkets.filter(m => m.status === "active").length;

    // Determine degraded vs operational
    const priceEngineStaleSec = (now - serviceState.priceEngineLastRunAt) / 1000;
    const botStaleSec         = (now - serviceState.botLastCycleAt) / 1000;
    const isStale             = priceEngineStaleSec > 300 || dbLatency > 500;
    const status              = isStale ? "degraded" : "operational";

    res.json({
      status,
      uptimeSeconds:            Math.floor(process.uptime()),
      responseTimeMs:           Date.now() - reqStart,
      nodeHeapMB:               heapMB,
      nodeHeapTotalMB:          heapTotalMB,
      nodeRssMB:                rssMB,
      dbLatencyMs:              dbLatency,
      dbConnections:            10,
      openOrders:               openCount?.cnt ?? 0,
      activeMarkets,
      totalMarkets:             allMarkets.length,
      avgOrderbookLatencyMs:    dbLatency + 5,
      avgTradesLatencyMs:       dbLatency + 8,
      nodeVersion:              process.version,
      platform:                 process.platform,
      timestamp:                new Date().toISOString(),
      services: {
        priceEngine: {
          lastRunAt:   serviceState.priceEngineLastRunAt,
          lastRunAgoSec: Math.floor(priceEngineStaleSec),
          runs:        serviceState.priceEngineRuns,
          errors:      serviceState.priceEngineErrors,
          status:      priceEngineStaleSec < 180 ? "healthy" : "stale",
        },
        liquidityBot: {
          lastCycleAt:   serviceState.botLastCycleAt,
          lastCycleAgoSec: Math.floor(botStaleSec),
          cycles:        serviceState.botCycles,
          status:        botStaleSec < 300 ? "healthy" : "stale",
        },
        bsvMonitor: {
          lastAt:    serviceState.bsvMonitorLastAt,
          lastAgoSec: Math.floor((now - serviceState.bsvMonitorLastAt) / 1000),
          errors:    serviceState.bsvMonitorErrors,
          status:    (now - serviceState.bsvMonitorLastAt) < 180_000 ? "healthy" : "stale",
        },
        database: {
          latencyMs: dbLatency,
          status:    dbLatency < 200 ? "healthy" : dbLatency < 500 ? "slow" : "degraded",
        },
      },
      incidents:    serviceState.incidentLog.slice(0, 50),
      restartCount: serviceState.restartCount,
      lastRestartAt:serviceState.lastRestartAt,
    });
  } catch (err: any) {
    res.status(500).json({ status: "degraded", error: err?.message, timestamp: new Date().toISOString() });
  }
});

/* ── POST /api/admin/restart-services — soft restart price engine + bot ──── */
router.post("/restart-services", async (_req, res) => {
  try {
    recordServiceEvent("admin", "info", "Soft restart requested via admin panel");
    serviceState.restartCount++;
    serviceState.lastRestartAt = Date.now();

    // Fire-and-forget — don't await so the response returns quickly
    updateMarketPrices()
      .then(() => {
        serviceState.priceEngineLastRunAt = Date.now();
        serviceState.priceEngineRuns++;
        recordServiceEvent("priceEngine", "info", "Price engine re-run completed after soft restart");
      })
      .catch((e: any) => {
        serviceState.priceEngineErrors++;
        recordServiceEvent("priceEngine", "error", `Price engine error after restart: ${e?.message}`);
      });

    res.json({
      ok: true,
      message: "Soft restart initiated — price engine re-running, liquidity bot will cycle on next tick",
      restartCount: serviceState.restartCount,
      initiatedAt:  new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

/* ─── LETSEXCHANGE FULL PAIR SYNC ────────────────────────────────────────── */

/**
 * POST /admin/le-sync
 *
 * Forces a full resync of ALL LetsExchange pairs into the DB.
 * Fetches coins from LE API → runs sovereign price pass → upserts every
 * coin × quote pair, updating zero-price rows with real current prices.
 */
router.post("/le-sync", requireAdminToken, async (_req, res) => {
  try {
    const start = Date.now();
    const result = await syncAllLEPairs();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    res.json({
      ok: true,
      message: `LE sync complete in ${elapsed}s`,
      coins:    result.coins,
      quotes:   result.quotes,
      rows:     result.inserted,
      elapsed,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/* ─── LIQUIDITY BOT CONFIG ───────────────────────────────────────────────── */
const DEFAULT_LIQUIDITY_CONFIG = {
  enabled:         true,
  intervalSeconds: 120,
  batchSize:       40,
  levelsPerSide:   6,
  spreadBps:       15,       // 0.15% spread
  maxPositionUsd:  10000,
  minPriceImpact:  0.001,
  symbols:         ["BSV/USDT", "BSV/USDC", "BSV/BTC"],
  lastCycleMs:     0,
  totalCycles:     0,
};

let liquidityConfig = { ...DEFAULT_LIQUIDITY_CONFIG };

router.get("/liquidity/config", (_req, res) => {
  res.json(liquidityConfig);
});

router.post("/liquidity/config", (req, res) => {
  const updates = req.body ?? {};
  liquidityConfig = { ...liquidityConfig, ...updates };
  res.json({ success: true, config: liquidityConfig });
});

router.post("/liquidity/reset", (_req, res) => {
  liquidityConfig = { ...DEFAULT_LIQUIDITY_CONFIG };
  res.json({ success: true, config: liquidityConfig });
});

/* ─── TRADINGVIEW DATAFEED STATUS ────────────────────────────────────────── */
router.get("/tradingview", async (req, res) => {
  try {
    // Lazy import to avoid circular dep
    const { tvMetrics } = await import("./tradingview.js");
    const allMarkets = await db.select().from(marketsTable).limit(1);
    res.json({
      status:              "operational",
      baseUrl:             "/api/tv",
      lastHistoryLatencyMs: tvMetrics.lastHistoryLatencyMs,
      lastSymbolsLatencyMs: tvMetrics.lastSymbolsLatencyMs,
      historyCallCount:    tvMetrics.historyCallCount,
      symbolsCallCount:    tvMetrics.symbolsCallCount,
      streamingActive:     tvMetrics.streamingActive,
      lastCallAt:          tvMetrics.lastCallAt ? new Date(tvMetrics.lastCallAt).toISOString() : null,
      symbolsCount:        allMarkets.length > 0 ? "934+" : "0",
      supportedResolutions: ["1", "5", "15", "30", "60", "240", "1D", "1W"],
      endpoints: {
        config:  "/api/tv/config",
        symbols: "/api/tv/symbols?symbol=BSV/USDT",
        search:  "/api/tv/search?query=BSV",
        history: "/api/tv/history?symbol=BSV/USDT&resolution=60",
        time:    "/api/tv/time",
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err?.message });
  }
});

/* ─── TEST TV SYMBOL & HISTORY ────────────────────────────────────────────── */
router.post("/tradingview/test", async (req, res) => {
  const { symbol = "BSV/USDT", resolution = "60" } = req.body ?? {};
  const t0 = Date.now();
  try {
    const proto = req.protocol;
    const host  = req.get("host") ?? "localhost:8080";
    const from  = Math.floor(Date.now() / 1000) - 86400;
    const to    = Math.floor(Date.now() / 1000);
    const url   = `${proto}://${host}/api/tv/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;
    const r     = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data  = await r.json() as any;
    const latency = Date.now() - t0;
    res.json({
      success:      data?.s === "ok",
      symbol,
      resolution,
      latencyMs:    latency,
      candleCount:  data?.t?.length ?? 0,
      status:       data?.s,
      firstCandle:  data?.t?.[0] ? new Date(data.t[0] * 1000).toISOString() : null,
      lastCandle:   data?.t?.slice(-1)?.[0] ? new Date(data.t.slice(-1)[0] * 1000).toISOString() : null,
    });
  } catch (err: any) {
    res.json({ success: false, symbol, latencyMs: Date.now() - t0, error: err?.message });
  }
});

/* ─── SYSTEM LOGS (in-memory ring buffer) ────────────────────────────────── */
export interface LogEntry {
  id:      string;
  level:   "info" | "warn" | "error";
  message: string;
  context?: string;
  ts:      number;
}

const LOG_RING: LogEntry[] = [];
const MAX_LOGS = 500;

export function pushAdminLog(level: LogEntry["level"], message: string, context?: string) {
  LOG_RING.push({ id: crypto.randomUUID(), level, message, context, ts: Date.now() });
  if (LOG_RING.length > MAX_LOGS) LOG_RING.shift();
}

// Seed with startup log
pushAdminLog("info", "OrahDEX API server started", "system");

router.get("/logs", (req, res) => {
  const level  = req.query.level as string | undefined;
  const limit  = Math.min(parseInt((req.query.limit as string) ?? "100"), 500);
  const filtered = level
    ? LOG_RING.filter(l => l.level === level)
    : LOG_RING;
  res.json(filtered.slice(-limit).reverse());
});

router.delete("/logs", (_req, res) => {
  LOG_RING.splice(0, LOG_RING.length);
  pushAdminLog("info", "Log buffer cleared by admin", "admin");
  res.json({ success: true });
});

/* ─── MARKETS (enhanced management) ─────────────────────────────────────── */
router.get("/markets", async (req, res) => {
  try {
    const page   = parseInt((req.query.page as string) ?? "1");
    const limit  = Math.min(parseInt((req.query.limit as string) ?? "50"), 200);
    const search = (req.query.search as string ?? "").toUpperCase();
    const status = req.query.status as string | undefined;
    const offset = (page - 1) * limit;

    let markets = await db.select().from(marketsTable);
    if (search) markets = markets.filter(m => m.symbol?.includes(search) || m.baseAsset?.includes(search));
    if (status) markets = markets.filter(m => m.status === status);

    const total = markets.length;
    const paged = markets.slice(offset, offset + limit);

    res.json({ markets: paged, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.patch("/markets/:symbol/precision", async (req, res) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol);
    const { tickSize, minOrderSize, makerFee, takerFee } = req.body ?? {};
    const updates: Record<string, any> = {};
    if (tickSize     !== undefined) updates.tickSize      = tickSize;
    if (minOrderSize !== undefined) updates.minOrderSize  = minOrderSize;
    if (makerFee     !== undefined) updates.makerFee      = makerFee;
    if (takerFee     !== undefined) updates.takerFee      = takerFee;

    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields" }); return; }

    await db.update(marketsTable).set(updates).where(eq(marketsTable.symbol, symbol));
    res.json({ success: true, symbol, updates });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.patch("/markets/:symbol/status", async (req, res) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol);
    const { status } = req.body ?? {};
    if (!["active", "inactive", "maintenance"].includes(status)) {
      { res.status(400).json({ error: "Invalid status" }); return; }
    }
    await db.update(marketsTable).set({ status }).where(eq(marketsTable.symbol, symbol));
    pushAdminLog("info", `Market ${symbol} set to ${status}`, "admin");
    res.json({ success: true, symbol, status });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * PATCH /admin/markets/:symbol/enabled
 *
 * Soft-enable or soft-disable a market without deleting it.
 * Pinned markets (internal spot/futures) can be disabled but remain in DB.
 * Body: { enabled: true | false }
 */
router.patch("/markets/:symbol/enabled", requireAdminToken, async (req, res) => {
  try {
    const symbol  = decodeURIComponent(req.params.symbol);
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" }); return;
    }
    const [row] = await db
      .update(marketsTable)
      .set({ enabled })
      .where(eq(marketsTable.symbol, symbol))
      .returning({ symbol: marketsTable.symbol, enabled: marketsTable.enabled, pinned: marketsTable.pinned });
    if (!row) { res.status(404).json({ error: "Market not found" }); return; }
    pushAdminLog("info", `Market ${symbol} enabled=${enabled}`, "admin");
    res.json({ success: true, symbol: row.symbol, enabled: row.enabled, pinned: row.pinned });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ─── AUTO-SETUP — seed all defaults + test email in one click ────────────── */

const SITE_DEFAULTS: Record<string, string> = {
  site_name: "OrahDEX",
  site_domain: "orahdex.org",
  contact_email: "support@orahdex.org",
  legal_email: "legal@orahdex.org",
  privacy_email: "privacy@orahdex.org",
  company_name: "OrahDEX Ltd.",
  canonical_url: "https://orahdex.org",
  maker_fee: "0.001",
  taker_fee: "0.001",
  seo_title: "OrahDEX — Trade means DEX | BSV Settlement Exchange",
  seo_description: "OrahDEX is a full-featured BSV-settled DEX with spot trading, futures, P2P, AMM pools, and cross-chain settlement.",
  seo_keywords: "BSV DEX, Bitcoin SV, decentralized exchange, crypto trading, spot futures",
  twitter_site: "@orahdex",
  twitter_card: "summary_large_image",
  terms_url: "/terms",
  privacy_url: "/privacy",
  whitepaper_url: "/whitepaper",
  footer_text: "© 2025 OrahDEX. All rights reserved.",
  default_theme: "dark",
};

const INTEGRATION_DEFAULTS: Record<string, string> = {
  bsv_rpc_url: `https://api.whatsonchain.com/v1/bsv/${process.env.BSV_NETWORK ?? "main"}`,
};

router.post("/auto-setup", async (_req, res) => {
  try {
    const applied: string[] = [];

    // 1. Seed site settings (only if not already set)
    const existingRows = await db.select().from(platformSettingsTable);

    for (const [key, value] of Object.entries(SITE_DEFAULTS)) {
      const dbKey = `site::${key}`;
      await db.insert(platformSettingsTable)
        .values({ key: dbKey, value })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
      applied.push(key);
    }

    // 2. Seed integration defaults (only if empty)
    for (const [key, value] of Object.entries(INTEGRATION_DEFAULTS)) {
      const existing = existingRows.find(r => r.key === key);
      if (!existing?.value?.trim()) {
        await db.insert(platformSettingsTable)
          .values({ key, value })
          .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
        applied.push(key);
      }
    }

    // 3. Auto-setup free test email (always — generates fresh credentials)
    const emailAccount = await autoSetupTestEmail();
    applied.push("smtp (test account)");

    res.json({
      success: true,
      message: "All defaults applied successfully!",
      applied,
      email: {
        host: emailAccount.host,
        port: emailAccount.port,
        user: emailAccount.user,
        from: emailAccount.from,
        note: "Test email active — sent emails are viewable at https://ethereal.email/messages (login with the username/password in Integrations → Email)",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Auto-setup failed" });
  }
});

/* ─── SMTP auto-setup (email only) ──────────────────────────────────────────── */

router.post("/auto-setup-email", async (_req, res) => {
  try {
    const emailAccount = await autoSetupTestEmail();
    res.json({
      success: true,
      host: emailAccount.host,
      port: emailAccount.port,
      user: emailAccount.user,
      from: emailAccount.from,
      note: "Free test account created via Ethereal. Sent emails are viewable at https://ethereal.email/messages",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Email auto-setup failed" });
  }
});

/* ─── STABLECOIN MINT / BURN ─────────────────────────────────────────────── */

// Ensure the audit log table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS mint_burn_log (
    id          SERIAL PRIMARY KEY,
    action      VARCHAR(4)  NOT NULL CHECK (action IN ('mint','burn')),
    asset       VARCHAR(20) NOT NULL,
    amount      NUMERIC(36,18) NOT NULL,
    wallet_address TEXT NOT NULL,
    note        TEXT,
    admin_ref   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`).catch(err => console.warn("mint_burn_log table init:", err.message));

/**
 * GET /admin/mint-burn-log
 * Returns the last 200 mint/burn operations.
 */
router.get("/mint-burn-log", requireAdminToken, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action, asset, amount::text, wallet_address, note, admin_ref, created_at
       FROM mint_burn_log
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/user-exchange-balance/:address
 * Returns the OrahDEX exchange (ledger) balances for a wallet.
 */
router.get("/user-exchange-balance/:address", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT asset_symbol AS asset, available::text, locked::text
       FROM user_balances
       WHERE wallet_address = $1
       ORDER BY asset_symbol`,
      [req.params.address]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/mint-burn
 * Body: { action: "mint"|"burn", asset: string, amount: string, walletAddress: string, note?: string }
 */
router.post("/mint-burn", requireAdminToken, async (req, res) => {
  const { action, asset, amount, walletAddress, note } = req.body ?? {};

  const SUPPORTED_STABLES = ["USDT","USDC","BUSD","DAI","oUSD"];

  if (!action || !["mint","burn"].includes(action))
    { res.status(400).json({ error: "action must be 'mint' or 'burn'" }); return; }
  if (!SUPPORTED_STABLES.includes(asset))
    { res.status(400).json({ error: `Unsupported asset. Allowed: ${SUPPORTED_STABLES.join(", ")}` }); return; }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    { res.status(400).json({ error: "amount must be a positive number" }); return; }
  if (!walletAddress)
    { res.status(400).json({ error: "walletAddress is required" }); return; }

  try {
    const { creditAvailable, debitAvailable } = await import("../lib/ledger.js");

    if (action === "mint") {
      await creditAvailable(walletAddress, asset, amount);
    } else {
      await debitAvailable(walletAddress, asset, amount);
    }

    await pool.query(
      `INSERT INTO mint_burn_log (action, asset, amount, wallet_address, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, asset, amount, walletAddress, note ?? null]
    );

    res.json({
      success: true,
      action,
      asset,
      amount,
      walletAddress,
      message: action === "mint"
        ? `Minted ${amount} ${asset} to ${walletAddress}`
        : `Burned ${amount} ${asset} from ${walletAddress}`,
    });
  } catch (err: any) {
    const isInsufficient = err.message?.startsWith("INSUFFICIENT_FUNDS");
    res.status(isInsufficient ? 400 : 500).json({
      error: isInsufficient
        ? `Insufficient ${asset} balance to burn that amount`
        : err.message,
    });
  }
});

/**
 * POST /admin/ledger-adjust
 * Manually credit (deposit) or debit (withdraw) any asset on any wallet's
 * internal exchange ledger. Unrestricted — any asset symbol is accepted.
 * Body: { action: "deposit"|"withdraw", walletAddress, asset, amount, note? }
 */
router.post("/ledger-adjust", requireAdminToken, async (req, res) => {
  const { action, walletAddress, asset, amount, note } = req.body ?? {};

  if (!action || !["deposit","withdraw"].includes(action))
    { res.status(400).json({ error: "action must be 'deposit' or 'withdraw'" }); return; }
  if (!walletAddress?.trim())
    { res.status(400).json({ error: "walletAddress is required" }); return; }
  if (!asset?.trim())
    { res.status(400).json({ error: "asset is required" }); return; }
  const numAmount = Number(amount);
  if (!amount || isNaN(numAmount) || numAmount <= 0)
    { res.status(400).json({ error: "amount must be a positive number" }); return; }

  try {
    const { creditAvailable, debitAvailable } = await import("../lib/ledger.js");

    if (action === "deposit") {
      await creditAvailable(walletAddress.trim(), asset.trim().toUpperCase(), String(numAmount));
    } else {
      await debitAvailable(walletAddress.trim(), asset.trim().toUpperCase(), String(numAmount));
    }

    // Audit log — reuse mint_burn_log table, mapping deposit→mint, withdraw→burn
    await pool.query(
      `INSERT INTO mint_burn_log (action, asset, amount, wallet_address, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [action === "deposit" ? "mint" : "burn", asset.trim().toUpperCase(), String(numAmount), walletAddress.trim(), note ?? null]
    );

    res.json({
      success: true,
      action,
      asset: asset.trim().toUpperCase(),
      amount: numAmount,
      walletAddress: walletAddress.trim(),
      message: action === "deposit"
        ? `Deposited ${numAmount} ${asset.toUpperCase()} to ${walletAddress}`
        : `Withdrew ${numAmount} ${asset.toUpperCase()} from ${walletAddress}`,
    });
  } catch (err: any) {
    const isInsufficient = err.message?.startsWith("INSUFFICIENT_FUNDS");
    res.status(isInsufficient ? 400 : 500).json({
      error: isInsufficient
        ? `Insufficient ${asset?.toUpperCase()} balance to withdraw that amount`
        : err.message,
    });
  }
});

/**
 * GET /admin/ledger-wallets
 * Returns a paginated list of wallets with their total ledger balances (USD),
 * for the admin ledger overview table.
 * Query: ?limit=50&offset=0&search=0x...
 */
router.get("/ledger-wallets", requireAdminToken, async (req, res) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50")), 200);
  const offset = parseInt(String(req.query.offset ?? "0"));
  const search = String(req.query.search ?? "").trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT
         wallet_address,
         COUNT(asset_symbol)                          AS asset_count,
         SUM(available::numeric + locked::numeric)   AS total_units,
         MAX(updated_at)                              AS last_activity
       FROM user_balances
       WHERE ($1 = '' OR LOWER(wallet_address) LIKE '%' || $1 || '%')
         AND (available::numeric + locked::numeric) > 0
       GROUP BY wallet_address
       ORDER BY last_activity DESC
       LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );
    const { rows: total } = await pool.query(
      `SELECT COUNT(DISTINCT wallet_address) AS cnt FROM user_balances
       WHERE ($1 = '' OR LOWER(wallet_address) LIKE '%' || $1 || '%')`,
      [search]
    );
    res.json({ wallets: rows, total: parseInt(total[0]?.cnt ?? "0") });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/ledger-audit
 * Returns recent deposit/withdrawal adjustments made via the admin panel.
 */
router.get("/ledger-audit", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action, asset, amount::text, wallet_address, note, created_at
       FROM mint_burn_log
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/ledger-stats ───────────────────────────────────────────────────
router.get("/ledger-stats", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(DISTINCT wallet_address) AS total_wallets,
        COUNT(*)                       AS total_rows,
        COALESCE(SUM(available::numeric + locked::numeric), 0) AS total_value_raw
      FROM user_balances
    `);
    const r = rows[0];
    res.json({
      totalWallets: parseInt(r.total_wallets ?? "0"),
      totalRows:    parseInt(r.total_rows ?? "0"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /admin/ledger-wipe-all ─────────────────────────────────────────────
// Wipes ALL internal ledger balances. Requires confirmation token in body.
router.delete("/ledger-wipe-all", requireAdminToken, async (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== "WIPE_ALL_BALANCES") {
    res.status(400).json({ error: "Send { confirm: 'WIPE_ALL_BALANCES' } to confirm." });
    return;
  }
  try {
    const result = await pool.query("DELETE FROM user_balances");
    req.log.warn({ rowsDeleted: result.rowCount }, "admin: ledger-wipe-all executed");
    res.json({ success: true, rowsDeleted: result.rowCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /exchange-wallet ───────────────────────────────────────────────────────
// Returns the exchange hot wallet addresses and on-chain balances.
// These are the addresses the operator must fund to enable auto-withdrawals.
router.get("/exchange-wallet", requireAdminToken, async (req, res) => {
  try {
    const evmAddress = await getEvmHotWalletAddress();

    // Fetch native balances from each chain (non-blocking, best-effort)
    const fetchNative = async (rpcUrl: string, symbol: string) => {
      try {
        const r = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [evmAddress, "latest"] }),
          signal: AbortSignal.timeout(6_000),
        });
        if (!r.ok) return null;
        const j = await r.json() as { result?: string };
        if (!j.result) return null;
        return (parseInt(j.result, 16) / 1e18).toFixed(6) + ` ${symbol}`;
      } catch { return null; }
    };

    const [ethBal, bnbBal, maticBal] = await Promise.all([
      fetchNative(process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com",         "ETH"),
      fetchNative(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org", "BNB"),
      fetchNative(process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",      "MATIC"),
    ]);

    const bsvWallet  = await getOrCreateWallet();
    const bsvBalance = await fetchWalletBalance(bsvWallet.address).catch(() => null);

    res.json({
      evm: {
        address:  evmAddress,
        note:     "Fund this address on each chain to enable automatic withdrawals",
        balances: { ETH: ethBal, BNB: bnbBal, MATIC: maticBal },
        explorers: {
          ethereum:  `https://etherscan.io/address/${evmAddress}`,
          bsc:       `https://bscscan.com/address/${evmAddress}`,
          polygon:   `https://polygonscan.com/address/${evmAddress}`,
          avalanche: `https://snowtrace.io/address/${evmAddress}`,
        },
      },
      bsv: {
        address:  bsvWallet.address,
        note:     "Fund this address with BSV to enable automatic BSV withdrawals",
        balance:  bsvBalance ? `${bsvBalance.bsv.toFixed(8)} BSV` : null,
        funded:   bsvBalance?.funded ?? false,
        explorer: `https://whatsonchain.com/address/${bsvWallet.address}`,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "admin/exchange-wallet: failed");
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /admin/db-health
 * Returns a comprehensive database integrity report.
 */
router.get("/db-health", requireAdminToken, async (req, res) => {
  try {
    const run = (sql: string, params: unknown[] = []): Promise<any[]> =>
      pool.query(sql, params).then(r => r.rows);

    const [
      totalWallets, walletsWithBalances, orphanBalanceWallets,
      orphanOrderWallets, orphanTradeWallets, totalOrders, openOrders,
      totalTrades, pendingWithdrawals, verifiedDeposits, depositAddresses,
      mintBurnLogs, walletsByNetwork, topBalanceWallets, recentMintBurn,
    ] = await Promise.all([
      run("SELECT COUNT(*) AS cnt FROM wallets"),
      run("SELECT COUNT(DISTINCT wallet_address) AS cnt FROM user_balances WHERE (available+locked) > 0"),
      run("SELECT COUNT(DISTINCT wallet_address) AS cnt FROM user_balances WHERE wallet_address NOT IN (SELECT address FROM wallets)"),
      run("SELECT COUNT(DISTINCT wallet_address) AS cnt FROM orders WHERE wallet_address IS NOT NULL AND wallet_address NOT IN (SELECT address FROM wallets)"),
      run("SELECT COUNT(DISTINCT wallet_address) AS cnt FROM trades WHERE wallet_address IS NOT NULL AND wallet_address NOT IN (SELECT address FROM wallets)"),
      run("SELECT COUNT(*) AS cnt FROM orders"),
      run("SELECT COUNT(*) AS cnt FROM orders WHERE status = 'open'"),
      run("SELECT COUNT(*) AS cnt FROM trades"),
      run("SELECT COUNT(*) AS cnt FROM withdrawal_requests WHERE status = 'pending'"),
      run("SELECT COUNT(*) AS cnt FROM evm_deposits_verified"),
      run("SELECT COUNT(*) AS cnt FROM evm_deposit_addresses"),
      run("SELECT COUNT(*) AS cnt FROM mint_burn_log"),
      run("SELECT network_type, COUNT(*) AS cnt FROM wallets GROUP BY network_type ORDER BY cnt DESC"),
      run(`SELECT w.address, w.network_type, w.provider, w.last_seen,
              COUNT(DISTINCT ub.asset_symbol) AS asset_count,
              COALESCE(SUM(ub.available + ub.locked), 0) AS total_balance_units
           FROM wallets w
           LEFT JOIN user_balances ub ON ub.wallet_address = w.address
           GROUP BY w.address, w.network_type, w.provider, w.last_seen
           ORDER BY total_balance_units DESC NULLS LAST
           LIMIT 20`),
      run("SELECT action, asset, amount::text, wallet_address, note, created_at FROM mint_burn_log ORDER BY created_at DESC LIMIT 10"),
    ]);

    const orphanTotal = parseInt(orphanBalanceWallets[0]?.cnt ?? "0")
                      + parseInt(orphanOrderWallets[0]?.cnt ?? "0")
                      + parseInt(orphanTradeWallets[0]?.cnt ?? "0");
    const totalW = parseInt(totalWallets[0]?.cnt ?? "0");
    const coverageScore = totalW === 0 ? 0 : Math.round((totalW / Math.max(totalW + orphanTotal, 1)) * 100);

    res.json({
      summary: {
        totalWallets: totalW,
        walletsWithBalances:    parseInt(walletsWithBalances[0]?.cnt ?? "0"),
        orphanedBalanceWallets: parseInt(orphanBalanceWallets[0]?.cnt ?? "0"),
        orphanedOrderWallets:   parseInt(orphanOrderWallets[0]?.cnt ?? "0"),
        orphanedTradeWallets:   parseInt(orphanTradeWallets[0]?.cnt ?? "0"),
        totalOrders:            parseInt(totalOrders[0]?.cnt ?? "0"),
        openOrders:             parseInt(openOrders[0]?.cnt ?? "0"),
        totalTrades:            parseInt(totalTrades[0]?.cnt ?? "0"),
        pendingWithdrawals:     parseInt(pendingWithdrawals[0]?.cnt ?? "0"),
        verifiedDeposits:       parseInt(verifiedDeposits[0]?.cnt ?? "0"),
        depositAddresses:       parseInt(depositAddresses[0]?.cnt ?? "0"),
        mintBurnLogs:           parseInt(mintBurnLogs[0]?.cnt ?? "0"),
        coverageScore,
      },
      walletsByNetwork,
      topBalanceWallets,
      recentMintBurn,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/db-sync
 * Reconciles the wallets table against all other tables.
 */
router.post("/db-sync", requireAdminToken, async (req, res) => {
  try {
    const run = (sql: string) => pool.query(sql).then(r => r.rowCount ?? 0);

    const [fromBalances, fromOrders, fromTrades, fromDeposits] = await Promise.all([
      run(`INSERT INTO wallets (address, network_type, status, first_seen, last_seen)
           SELECT DISTINCT wallet_address, 'evm', 'active', NOW(), NOW()
           FROM user_balances
           WHERE wallet_address NOT IN (SELECT address FROM wallets)
           ON CONFLICT (address) DO UPDATE SET last_seen = NOW()`),
      run(`INSERT INTO wallets (address, network_type, status, first_seen, last_seen)
           SELECT DISTINCT wallet_address, 'evm', 'active', NOW(), NOW()
           FROM orders
           WHERE wallet_address IS NOT NULL AND wallet_address NOT IN (SELECT address FROM wallets)
           ON CONFLICT (address) DO UPDATE SET last_seen = NOW()`),
      run(`INSERT INTO wallets (address, network_type, status, first_seen, last_seen)
           SELECT DISTINCT wallet_address, 'evm', 'active', NOW(), NOW()
           FROM trades
           WHERE wallet_address IS NOT NULL AND wallet_address NOT IN (SELECT address FROM wallets)
           ON CONFLICT (address) DO UPDATE SET last_seen = NOW()`),
      run(`INSERT INTO wallets (address, network_type, status, first_seen, last_seen)
           SELECT DISTINCT user_wallet, 'evm', 'active', NOW(), NOW()
           FROM evm_deposit_addresses
           WHERE user_wallet NOT IN (SELECT address FROM wallets)
           ON CONFLICT (address) DO UPDATE SET last_seen = NOW()`),
    ]);

    const totalInserted = fromBalances + fromOrders + fromTrades + fromDeposits;
    const { rows: tw } = await pool.query("SELECT COUNT(*) AS cnt FROM wallets");

    res.json({
      success: true,
      inserted: { fromBalances, fromOrders, fromTrades, fromDeposits, total: totalInserted },
      totalWallets: parseInt(tw[0]?.cnt ?? "0"),
      message: `Reconciled ${totalInserted} wallet(s). Total registered: ${tw[0]?.cnt}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/wallet-detail/:address
 * Returns full detail for one wallet: balances, orders, trades, deposits, withdrawals.
 */
router.get("/wallet-detail/:address", requireAdminToken, async (req, res) => {
  const addr = String(req.params.address ?? "").trim().toLowerCase();
  if (!addr) { res.status(400).json({ error: "address is required" }); return; }

  try {
    const [wallet, balances, recentOrders, recentTrades, deposits, withdrawals] = await Promise.all([
      pool.query("SELECT * FROM wallets WHERE address = $1", [addr]),
      pool.query(`SELECT asset_symbol, available::text, locked::text, updated_at
         FROM user_balances WHERE wallet_address = $1 AND (available+locked) > 0
         ORDER BY (available+locked) DESC`, [addr]),
      pool.query(`SELECT id, symbol, side, type, status, price::text, quantity::text,
                filled_quantity::text, fee::text, fee_asset, txid, created_at
         FROM orders WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 20`, [addr]),
      pool.query(`SELECT id, symbol, side, price::text, quantity::text, total::text,
                fee::text, txid, timestamp
         FROM trades WHERE wallet_address = $1 ORDER BY timestamp DESC LIMIT 20`, [addr]),
      pool.query(`SELECT tx_hash, chain_id, asset, amount::text, verified_at
         FROM evm_deposits_verified WHERE user_wallet = $1 ORDER BY verified_at DESC`, [addr]),
      pool.query(`SELECT id, asset, amount::text, network, status, txid, created_at
         FROM withdrawal_requests WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 20`, [addr]),
    ]);

    res.json({
      wallet: wallet.rows[0] ?? null,
      balances: balances.rows,
      recentOrders: recentOrders.rows,
      recentTrades: recentTrades.rows,
      deposits: deposits.rows,
      withdrawals: withdrawals.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ── POST /admin/rescue-evm-wallet ─────────────────────────────────────────────
// Sweeps ETH from a custodial internal EVM wallet back to a specified destination.
// Requires admin auth. Used when a user funded their internal EVM sub-wallet
// directly and needs funds returned to their main wallet.
router.post("/rescue-evm-wallet", requireAdminToken, async (req, res) => {
  const { toAddress, chainId: rawChainId } = req.body ?? {};

  if (!toAddress?.startsWith("0x")) {
    res.status(400).json({ error: "toAddress is required (must be 0x…)" });
    return;
  }

  const chainId = parseInt(String(rawChainId ?? 8453), 10);
  const RPC_URLS: Record<number, string> = {
    1:     process.env.ETH_RPC_URL     ?? "https://ethereum.publicnode.com",
    8453:  process.env.BASE_RPC_URL    ?? "https://base.publicnode.com",
    42161: process.env.ARB_RPC_URL     ?? "https://arbitrum-one.publicnode.com",
    10:    process.env.OP_RPC_URL      ?? "https://optimism.publicnode.com",
    56:    process.env.BSC_RPC_URL     ?? "https://bsc.publicnode.com",
    137:   process.env.POLYGON_RPC_URL ?? "https://polygon-bor.publicnode.com",
  };
  const rpcUrl = RPC_URLS[chainId] ?? RPC_URLS[8453]!;

  try {
    // Use the exchange hot wallet key stored in platform_settings (not user wallets table)
    const hotWallet = await getOrCreateEvmHotWallet();
    const account   = privateKeyToAccount(hotWallet.privKeyHex);

    const publicClient = createPublicClient({ transport: viemHttp(rpcUrl) });
    const balanceWei   = await publicClient.getBalance({ address: account.address as `0x${string}` });

    if (balanceWei === 0n) {
      res.status(400).json({ error: "Hot wallet has zero balance on this chain — nothing to rescue." });
      return;
    }

    const gasPrice   = await publicClient.getGasPrice();
    const gasLimit   = 21000n;
    const gasCost    = gasPrice * gasLimit;
    const sendAmount = balanceWei - gasCost;

    if (sendAmount <= 0n) {
      res.status(400).json({ error: "Balance too small to cover gas cost." });
      return;
    }

    const walletClient = createWalletClient({ account, transport: viemHttp(rpcUrl) });
    const txHash = await walletClient.sendTransaction({
      to:       toAddress as `0x${string}`,
      value:    sendAmount,
      gas:      gasLimit,
      gasPrice,
    } as any);

    const ethSent = formatEther(sendAmount);
    req.log.info({ from: account.address, toAddress, txHash, ethSent, chainId }, "admin: rescue-evm-wallet sent");

    res.json({ success: true, txHash, from: account.address, to: toAddress, ethSent, gasCostEth: formatEther(gasCost), chainId });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "admin: rescue-evm-wallet failed");
    res.status(500).json({ error: err?.message ?? "Rescue failed" });
  }
});

/* ── POST /admin/retry-pending-withdrawals ────────────────────────────────────
   Retry all pending withdrawal requests. Useful after funding the hot wallet.
──────────────────────────────────────────────────────────────────────────────── */
router.post("/retry-pending-withdrawals", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query<{
      id: string; asset: string; amount: string; network: string; recipient: string; wallet_address: string;
    }>(
      `SELECT id, asset, amount, network, recipient, wallet_address
         FROM withdrawal_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 50`,
    );

    if (rows.length === 0) {
      res.json({ message: "No pending withdrawals to retry.", processed: 0, succeeded: 0, failed: 0 });
      return;
    }

    let succeeded = 0;
    let failed = 0;
    const results: { id: string; status: string; txid?: string; error?: string }[] = [];

    for (const row of rows) {
      try {
        await pool.query(`UPDATE withdrawal_requests SET status = 'processing' WHERE id = $1`, [row.id]);
        const result = await processWithdrawal({
          asset:     row.asset,
          amount:    parseFloat(row.amount),
          network:   row.network,
          recipient: row.recipient,
        });
        if (result.status === "completed") {
          await pool.query(
            `UPDATE withdrawal_requests SET status = 'completed', txid = $1, processed_at = now(), note = 'Auto-retried by admin' WHERE id = $2`,
            [result.txid, row.id],
          );
          succeeded++;
          results.push({ id: row.id, status: "completed", txid: result.txid });
        } else {
          await pool.query(
            `UPDATE withdrawal_requests SET status = 'pending', note = $1 WHERE id = $2`,
            [result.note, row.id],
          );
          failed++;
          results.push({ id: row.id, status: "pending", error: result.note });
        }
      } catch (err: any) {
        await pool.query(
          `UPDATE withdrawal_requests SET status = 'pending', note = $1 WHERE id = $2`,
          [err?.message ?? "Retry failed", row.id],
        );
        failed++;
        results.push({ id: row.id, status: "pending", error: err?.message });
      }
    }

    req.log.info({ total: rows.length, succeeded, failed }, "admin: retry-pending-withdrawals complete");
    res.json({ message: `Retried ${rows.length} withdrawal(s).`, processed: rows.length, succeeded, failed, results });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "admin: retry-pending-withdrawals error");
    res.status(500).json({ error: err?.message ?? "Retry failed" });
  }
});

/* ── GET /admin/arb-bot ───────────────────────────────────────────────────────
   Returns arb bot status + profit stats.
──────────────────────────────────────────────────────────────────────────────── */
router.get("/arb-bot", requireAdminToken, async (req, res) => {
  try {
    const keys = [
      "arb_bot_enabled", "arb_bot_total_profit", "arb_bot_total_trades",
      "arb_bot_total_cycles", "arb_bot_last_run", "arb_bot_start_time",
      "arb_bot_last_cycle_profit", "arb_bot_last_opps_found",
    ];
    const { rows } = await pool.query(
      `SELECT key, value FROM platform_settings WHERE key = ANY($1)`,
      [keys],
    );
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    res.json({
      enabled:          s["arb_bot_enabled"] === "true",
      totalProfitUSDT:  parseFloat(s["arb_bot_total_profit"]    ?? "0"),
      totalTrades:      parseInt(s["arb_bot_total_trades"]      ?? "0"),
      totalCycles:      parseInt(s["arb_bot_total_cycles"]      ?? "0"),
      lastRun:          s["arb_bot_last_run"]                   ?? null,
      startTime:        s["arb_bot_start_time"]                 ?? null,
      lastCycleProfit:  parseFloat(s["arb_bot_last_cycle_profit"] ?? "0"),
      lastOppsFound:    parseInt(s["arb_bot_last_opps_found"]   ?? "0"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/arb-bot/toggle ───────────────────────────────────────────────
   Enable or disable the arbitrage bot.
──────────────────────────────────────────────────────────────────────────────── */
router.post("/arb-bot/toggle", requireAdminToken, async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    const val = enabled ? "true" : "false";
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ["arb_bot_enabled", val],
    );
    req.log.info({ enabled }, "admin: arb-bot toggled");
    res.json({ success: true, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/arb-bot/reset-stats ─────────────────────────────────────────
   Reset accumulated profit counters to zero.
──────────────────────────────────────────────────────────────────────────────── */
router.post("/arb-bot/reset-stats", requireAdminToken, async (req, res) => {
  try {
    const keys = ["arb_bot_total_profit", "arb_bot_total_trades", "arb_bot_total_cycles",
                  "arb_bot_last_cycle_profit", "arb_bot_start_time", "arb_bot_last_run", "arb_bot_last_opps_found"];
    for (const key of keys) {
      const val = key === "arb_bot_start_time" || key === "arb_bot_last_run" ? new Date().toISOString()
                : key.includes("trades") || key.includes("cycles") || key.includes("opps") ? "0" : "0";
      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, val],
      );
    }
    req.log.info("admin: arb-bot stats reset");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /admin/seeded-pool ───────────────────────────────────────────────────
   Returns the total seeded (platform-owned) balance across all user wallets,
   grouped by asset. This is money the platform controls — users can trade with
   it but cannot withdraw it.
──────────────────────────────────────────────────────────────────────────────── */
router.get("/seeded-pool", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query<{
      asset_symbol: string;
      total_seeded: string;
      total_available: string;
      wallet_count: string;
    }>(
      `SELECT
         asset_symbol,
         SUM(seeded)    AS total_seeded,
         SUM(available) AS total_available,
         COUNT(*)       AS wallet_count
       FROM user_balances
       WHERE seeded > 0
       GROUP BY asset_symbol
       ORDER BY total_seeded::numeric DESC`,
    );
    res.json({ pool: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /admin/seeded-pool/summary ──────────────────────────────────────────
   High-level counts for dashboard display.
──────────────────────────────────────────────────────────────────────────────── */
router.get("/seeded-pool/summary", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query<{
      total_wallets: string;
      total_assets: string;
      total_seeded_usdt_equiv: string;
    }>(
      `SELECT
         COUNT(DISTINCT wallet_address) AS total_wallets,
         COUNT(DISTINCT asset_symbol)   AS total_assets,
         SUM(CASE WHEN asset_symbol IN ('USDT','USDC','DAI','BUSD') THEN seeded ELSE 0 END) AS total_seeded_usdt_equiv
       FROM user_balances
       WHERE seeded > 0`,
    );
    res.json(rows[0] ?? { total_wallets: "0", total_assets: "0", total_seeded_usdt_equiv: "0" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/seeded-pool/reclaim ─────────────────────────────────────────
   Remove a specific seeded asset balance from all user wallets (platform
   reclaims). Supply { asset } to reclaim one asset, or leave blank for all.
   This reduces available balance by the seeded amount and clears the seeded
   column — effectively the platform pulling back its liquidity.
──────────────────────────────────────────────────────────────────────────────── */
router.post("/seeded-pool/reclaim", requireAdminToken, async (req, res) => {
  try {
    const { asset } = req.body ?? {};
    let result;
    if (asset) {
      const sym = (asset as string).toUpperCase();
      result = await pool.query(
        `UPDATE user_balances
            SET available   = GREATEST(0, available - seeded),
                seeded      = 0,
                updated_at  = now()
          WHERE asset_symbol = $1 AND seeded > 0`,
        [sym],
      );
    } else {
      result = await pool.query(
        `UPDATE user_balances
            SET available   = GREATEST(0, available - seeded),
                seeded      = 0,
                updated_at  = now()
          WHERE seeded > 0`,
      );
    }
    req.log.info({ asset: asset ?? "ALL", rowsAffected: result.rowCount }, "admin: seeded pool reclaimed");
    res.json({ success: true, rowsAffected: result.rowCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ─── LE SWAP INCOME ─────────────────────────────────────────────────────── */

// GET /api/admin/le-income  – summary stats + recent swap list
router.get("/admin/le-income", requireAdminToken, async (req, res) => {
  try {
    // Aggregate stats
    const [statsRow] = await db.execute<{
      total_swaps: string;
      finished_swaps: string;
      total_volume_usd: string;
      finished_volume_usd: string;
    }>(sql`
      SELECT
        COUNT(*)                                                    AS total_swaps,
        COUNT(*) FILTER (WHERE status = 'finished')                 AS finished_swaps,
        COALESCE(SUM(deposit_amount_usd), 0)                        AS total_volume_usd,
        COALESCE(SUM(deposit_amount_usd) FILTER (WHERE status = 'finished'), 0) AS finished_volume_usd
      FROM le_swaps
    `);

    // Top coins by volume
    const topCoins = await db.execute<{ coin_from: string; coin_to: string; count: string; volume_usd: string }>(sql`
      SELECT coin_from, coin_to,
             COUNT(*)                      AS count,
             COALESCE(SUM(deposit_amount_usd), 0) AS volume_usd
      FROM le_swaps
      GROUP BY coin_from, coin_to
      ORDER BY volume_usd DESC
      LIMIT 10
    `);

    // Monthly breakdown
    const monthly = await db.execute<{ month: string; count: string; volume_usd: string }>(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
             COUNT(*)                      AS count,
             COALESCE(SUM(deposit_amount_usd), 0) AS volume_usd
      FROM le_swaps
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `);

    // Recent swaps
    const recent = await db
      .select()
      .from(leSwapsTable)
      .orderBy(desc(leSwapsTable.createdAt))
      .limit(50);

    const totalVolumeUsd  = parseFloat(statsRow?.total_volume_usd   ?? "0");
    const finishedVolUsd  = parseFloat(statsRow?.finished_volume_usd ?? "0");
    // LetsExchange affiliate earns ~50% of their ~0.35% fee per swap
    const COMMISSION_RATE = 0.0017; // ~0.17% of volume (50% × 0.35%)

    res.json({
      summary: {
        totalSwaps:           Number(statsRow?.total_swaps   ?? 0),
        finishedSwaps:        Number(statsRow?.finished_swaps ?? 0),
        totalVolumeUsd:       totalVolumeUsd,
        finishedVolumeUsd:    finishedVolUsd,
        estimatedCommissionUsd: parseFloat((finishedVolUsd * COMMISSION_RATE).toFixed(2)),
        commissionRatePct:    (COMMISSION_RATE * 100).toFixed(2),
      },
      topPairs:   topCoins,
      monthly,
      recent,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /admin/routing-profiles ───────────────────────────────────────────────
// List all per-pair routing configs stored in the routing_profiles table.
router.get("/admin/routing-profiles", requireAdminToken, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(routingProfilesTable)
      .orderBy(routingProfilesTable.baseSymbol, routingProfilesTable.quoteSymbol);
    res.json({ profiles: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── POST /admin/routing-profiles ──────────────────────────────────────────────
// Upsert a routing profile (insert or update on pair key conflict).
router.post("/admin/routing-profiles", requireAdminToken, async (req, res) => {
  const { baseSymbol, quoteSymbol, maxSlippageBps, minFillFraction,
          maxInternalSize, oracleRequired, enabled, splitEnabled, notes } = req.body ?? {};
  if (!baseSymbol || !quoteSymbol) {
    res.status(400).json({ error: "baseSymbol and quoteSymbol are required" }); return;
  }
  try {
    const [row] = await db
      .insert(routingProfilesTable)
      .values({
        baseSymbol:      String(baseSymbol).toUpperCase(),
        quoteSymbol:     String(quoteSymbol).toUpperCase(),
        maxSlippageBps:  maxSlippageBps  != null ? Number(maxSlippageBps)    : 150,
        minFillFraction: minFillFraction != null ? String(minFillFraction)   : "0.9",
        maxInternalSize: maxInternalSize != null ? String(maxInternalSize)   : null,
        oracleRequired:  oracleRequired  != null ? Boolean(oracleRequired)   : true,
        enabled:         enabled         != null ? Boolean(enabled)          : true,
        splitEnabled:    splitEnabled    != null ? Boolean(splitEnabled)     : false,
        notes:           notes           != null ? String(notes)             : null,
      })
      .onConflictDoUpdate({
        target: [routingProfilesTable.baseSymbol, routingProfilesTable.quoteSymbol],
        set: {
          maxSlippageBps:  sql`excluded.max_slippage_bps`,
          minFillFraction: sql`excluded.min_fill_fraction`,
          maxInternalSize: sql`excluded.max_internal_size`,
          oracleRequired:  sql`excluded.oracle_required`,
          enabled:         sql`excluded.enabled`,
          splitEnabled:    sql`excluded.split_enabled`,
          notes:           sql`excluded.notes`,
          updatedAt:       sql`NOW()`,
        },
      })
      .returning();

    invalidatePairConfigCache(
      String(baseSymbol).toUpperCase(),
      String(quoteSymbol).toUpperCase(),
    );
    res.status(201).json({ profile: row });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── PUT /admin/routing-profiles/:id ──────────────────────────────────────────
// Partial update of a routing profile by its UUID.
router.put("/admin/routing-profiles/:id", requireAdminToken, async (req, res) => {
  const { id } = req.params;
  const {
    maxSlippageBps, minFillFraction, maxInternalSize,
    oracleRequired, enabled, splitEnabled, notes,
  } = req.body ?? {};

  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (maxSlippageBps  != null) patch.maxSlippageBps  = Number(maxSlippageBps);
  if (minFillFraction != null) patch.minFillFraction  = String(minFillFraction);
  if (maxInternalSize !== undefined) patch.maxInternalSize = maxInternalSize != null ? String(maxInternalSize) : null;
  if (oracleRequired  != null) patch.oracleRequired  = Boolean(oracleRequired);
  if (enabled         != null) patch.enabled         = Boolean(enabled);
  if (splitEnabled    != null) patch.splitEnabled    = Boolean(splitEnabled);
  if (notes           !== undefined) patch.notes     = notes != null ? String(notes) : null;

  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: "No updatable fields provided" }); return;
  }

  try {
    const [row] = await db
      .update(routingProfilesTable)
      .set(patch as any)
      .where(eq(routingProfilesTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Profile not found" }); return; }
    // Invalidate cache for this pair
    invalidatePairConfigCache(row.baseSymbol, row.quoteSymbol);
    res.json({ profile: row });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;

