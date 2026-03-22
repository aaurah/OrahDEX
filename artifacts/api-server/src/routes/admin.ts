import { Router } from "express";
import { db } from "@workspace/db";
import { marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

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
  { id: "key_001", name: "Public Market Feed", key: "aura_pub_a1b2c3d4e5f6g7h8", type: "public", rateLimit: 1000, calls24h: 842103, status: "active", createdAt: "2025-01-15" },
  { id: "key_002", name: "Trading Bot Integration", key: "aura_prv_x1y2z3w4v5u6t7s8", type: "private", rateLimit: 500, calls24h: 23891, status: "active", createdAt: "2025-02-01" },
  { id: "key_003", name: "Analytics Dashboard", key: "aura_prv_m1n2o3p4q5r6s7t8", type: "private", rateLimit: 300, calls24h: 4561, status: "active", createdAt: "2025-02-20" },
  { id: "key_004", name: "Legacy Integration", key: "aura_pub_a9b8c7d6e5f4g3h2", type: "public", rateLimit: 200, calls24h: 0, status: "revoked", createdAt: "2024-11-10" },
];

const deployedContracts: any[] = [
  { id: "ctr_001", name: "AURA Token", symbol: "AURA", network: "BSV", type: "token", supply: "1000000000", decimals: 8, address: "1AURAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "deployed", txid: "a1b2c3d4e5f6...", deployedAt: "2025-01-20" },
  { id: "ctr_002", name: "Aura Governance", symbol: "AGOV", network: "BSV", type: "governance", supply: "100000000", decimals: 8, address: "1AGOVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "deployed", txid: "b2c3d4e5f6a1...", deployedAt: "2025-02-01" },
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
    key: `aura_${type === "public" ? "pub" : "prv"}_${rand}`,
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
router.get("/admin/fee-wallet", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "fee_wallet_config"));
    if (!rows.length) { res.json({}); return; }
    res.json(JSON.parse(rows[0].value));
  } catch (err) { res.json({}); }
});

router.put("/admin/fee-wallet", async (req, res) => {
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

export default router;
