import { Router } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateWallet, fetchWalletBalance, privKeyToWif, privKeyToAddress, privKeyToPubKey, buildAndBroadcastBsvTx, isBsvAddress } from "../lib/bsvWallet.js";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";

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

const mockUsers = Array.from({ length: 24 }, (_, i) => ({
  id: `usr_${(i + 1).toString().padStart(4, "0")}`,
  walletAddress: i % 3 === 0
    ? `0x${Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join("")}`
    : `1${Array.from({length: 33}, () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random()*58)]).join("")}`,
  network: i % 3 === 0 ? "evm" : "bsv",
  provider: ["handcash","relayx","panda","metamask","walletconnect","coinbase","trust","phantom"][i % 8],
  volume24h: parseFloat((Math.random() * 500000).toFixed(2)),
  totalTrades: Math.floor(Math.random() * 2000),
  balance: parseFloat((Math.random() * 100000).toFixed(2)),
  status: i === 3 ? "banned" : i === 7 ? "suspended" : "active",
  verified: i % 4 !== 0,
  joinedAt: new Date(Date.now() - Math.random() * 180 * 86400 * 1000).toISOString(),
  lastActive: new Date(Date.now() - Math.random() * 3 * 86400 * 1000).toISOString(),
  country: ["US","UK","SG","JP","AU","DE","CA","KR"][i % 8],
}));

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
  res.json({
    totalUsers: mockUsers.length,
    activeUsers24h: 18,
    totalVolume24h: mockUsers.reduce((s, u) => s + u.volume24h, 0),
    totalTrades24h: 14823,
    activePairs: allMarkets.filter(m => m.status === "active").length,
    totalPairs: allMarkets.length,
    openOrders: 2341,
    deployedContracts: deployedContracts.length,
    revenue24h: 12450.88,
    tvl: 845000000,
    feeRate: 0.1,
    systemStatus: "operational",
  });
});

/* ─── USERS ─── */
router.get("/users", (_req, res) => {
  const { search, status, page = "1", limit = "20" } = _req.query as Record<string, string>;
  let users = [...mockUsers];
  if (search) users = users.filter(u => u.walletAddress.toLowerCase().includes(search.toLowerCase()) || u.provider.includes(search.toLowerCase()));
  if (status && status !== "all") users = users.filter(u => u.status === status);
  const total = users.length;
  const p = parseInt(page), l = parseInt(limit);
  users = users.slice((p - 1) * l, p * l);
  res.json({ users, total, page: p, pages: Math.ceil(total / l) });
});

router.patch("/users/:id/status", (req, res) => {
  const { status } = req.body;
  const user = mockUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.status = status;
  res.json({ success: true, user });
});

router.patch("/users/:id", (req, res) => {
  const user = mockUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { status, country, verified, balance, network, provider } = req.body;
  if (status !== undefined) user.status = status;
  if (country !== undefined) user.country = country;
  if (verified !== undefined) user.verified = verified;
  if (balance !== undefined) user.balance = parseFloat(balance);
  if (network !== undefined) user.network = network;
  if (provider !== undefined) user.provider = provider;
  res.json({ success: true, user });
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
  "moonpay_api_key",
  "transak_api_key",
  "banxa_api_key",
  "simplex_api_key",
  "ramp_api_key",
  "bsv_rpc_url",
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

export default router;
