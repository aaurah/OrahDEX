import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Types ──────────────────────────────────────────────────────────────── */
export type ChannelId = string; // "global" | "pair:BTC-USDT" | "vault:abc" | "support" | "system" | "ora"

interface ChatMessage {
  id: string;
  channel: ChannelId;
  wallet: string;          // "0xabc..." | "anonymous"
  displayName: string;     // wallet[:6] or pseudonym
  role: "trader" | "leader" | "support" | "system" | "ora";
  text: string;
  ts: number;
  txid?: string;           // detected on-chain txid in message
  replyTo?: string;        // message id
  moderated?: boolean;     // true = blocked by AI moderation
}

/* ── In-memory store ─────────────────────────────────────────────────────── */
const MAX_MSGS_PER_CHANNEL = 100;
const store = new Map<ChannelId, ChatMessage[]>();
const sseClients = new Map<ChannelId, Set<Response>>();

function getChannel(channel: ChannelId): ChatMessage[] {
  if (!store.has(channel)) store.set(channel, []);
  return store.get(channel)!;
}

function broadcast(channel: ChannelId, msg: ChatMessage) {
  const clients = sseClients.get(channel);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

function addMessage(channel: ChannelId, msg: ChatMessage) {
  const ch = getChannel(channel);
  ch.push(msg);
  if (ch.length > MAX_MSGS_PER_CHANNEL) ch.splice(0, ch.length - MAX_MSGS_PER_CHANNEL);
  broadcast(channel, msg);
}

/* ── ID generator ────────────────────────────────────────────────────────── */
let _seq = 0;
function genId(): string {
  return `${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}

/* ── Moderation ─────────────────────────────────────────────────────────── */
const PHISHING_PATTERNS = [
  /(?:seed|recovery|mnemonic|private[\s_-]?key|secret[\s_-]?phrase)/i,
  /(?:send|transfer|deposit)\s+(?:your|all|the)\s+(?:eth|btc|bsv|usdt|usdc|bnb|sol)/i,
  /(?:airdrop|claim|verify)\s+(?:your\s+)?(?:wallet|tokens?|rewards?|winnings?)/i,
  /(?:www\.|https?:\/\/)[^\s]{4,}(?:\.ru|\.tk|\.xyz|\.top|\.win|claim|airdrop)/i,
  /(?:dm\s+me|message\s+me|contact\s+me)\s+(?:for|to)\s+(?:help|profit|returns?)/i,
  /(?:double|2x|3x)\s+your\s+(?:eth|btc|bsv|usdt|money|investment)/i,
];

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
];

const TXID_PATTERN = /\b([0-9a-f]{64})\b/gi;

function moderateText(text: string): { blocked: boolean; reason?: string } {
  for (const p of PHISHING_PATTERNS) {
    if (p.test(text)) return { blocked: true, reason: "Phishing or scam pattern detected." };
  }
  for (const p of PII_PATTERNS) {
    if (p.test(text)) return { blocked: true, reason: "Personal information detected — not posted for your safety." };
  }
  if (text.length > 2000) return { blocked: true, reason: "Message too long." };
  return { blocked: false };
}

function extractTxid(text: string): string | undefined {
  const m = text.match(TXID_PATTERN);
  return m ? m[0] : undefined;
}

/* ── Rate limiting ───────────────────────────────────────────────────────── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // msgs per window
const RATE_WINDOW = 15_000; // 15 seconds

function checkRateLimit(wallet: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(wallet);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(wallet, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/* ── Display name helper ─────────────────────────────────────────────────── */
function formatWallet(wallet: string): string {
  if (!wallet || wallet === "anonymous") return "anon";
  if (wallet.startsWith("0x") && wallet.length >= 10) {
    return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  }
  if (wallet.length >= 10) {
    return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  }
  return wallet;
}

/* ── System / seed messages ──────────────────────────────────────────────── */
function seedSystemChannel() {
  const msgs: Omit<ChatMessage, "id" | "ts">[] = [
    {
      channel: "system",
      wallet: "system",
      displayName: "OrahDEX",
      role: "system",
      text: "Welcome to OrahDEX System Announcements. This channel carries protocol updates, maintenance windows, and incident reports. It is read-only.",
    },
    {
      channel: "system",
      wallet: "system",
      displayName: "OrahDEX",
      role: "system",
      text: "Protocol v4.2.0 active. BSV on-chain settlement operational. All markets live.",
    },
  ];
  for (const m of msgs) {
    addMessage("system", { ...m, id: genId(), ts: Date.now() });
  }
}

seedSystemChannel();

/* ── Routes ──────────────────────────────────────────────────────────────── */

/* GET /api/chat/channels/:channel/messages — last N messages */
router.get("/channels/:channel/messages", (req: Request, res: Response) => {
  const channel = decodeURIComponent(String(req.params["channel"]));
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const msgs = getChannel(channel).slice(-limit);
  res.json({ channel, messages: msgs });
});

/* GET /api/chat/channels/:channel/stream — SSE real-time feed */
router.get("/channels/:channel/stream", (req: Request, res: Response) => {
  const channel = decodeURIComponent(String(req.params["channel"]));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!sseClients.has(channel)) sseClients.set(channel, new Set());
  sseClients.get(channel)!.add(res);

  /* Send last 20 messages immediately as backfill */
  const backfill = getChannel(channel).slice(-20);
  res.write(`data: ${JSON.stringify({ type: "backfill", messages: backfill })}\n\n`);

  /* Keepalive ping every 25s */
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients.get(channel)?.delete(res);
  });
});

/* POST /api/chat/channels/:channel/messages — send a message */
router.post("/channels/:channel/messages", (req: Request, res: Response) => {
  const channel = decodeURIComponent(String(req.params["channel"]));

  /* System channel is read-only */
  if (channel === "system") {
    res.status(403).json({ error: "System channel is read-only." });
    return;
  }

  const { text, wallet, displayName, role, replyTo } = req.body as {
    text?: string;
    wallet?: string;
    displayName?: string;
    role?: string;
    replyTo?: string;
  };

  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const senderWallet = wallet?.trim() || "anonymous";

  /* Rate limit */
  if (!checkRateLimit(senderWallet)) {
    res.status(429).json({ error: "Too many messages. Please slow down." });
    return;
  }

  /* Moderation */
  const mod = moderateText(text.trim());
  if (mod.blocked) {
    res.status(400).json({ error: mod.reason ?? "Message blocked by moderation." });
    return;
  }

  /* Txid detection */
  const txid = extractTxid(text.trim());

  const msg: ChatMessage = {
    id: genId(),
    channel,
    wallet: senderWallet,
    displayName: displayName?.trim() || formatWallet(senderWallet),
    role: (role as ChatMessage["role"]) || "trader",
    text: text.trim(),
    ts: Date.now(),
    ...(txid && { txid }),
    ...(replyTo && { replyTo }),
  };

  addMessage(channel, msg);
  logger.debug({ channel, wallet: msg.wallet, msgId: msg.id }, "chat message posted");
  res.json({ ok: true, message: msg });
});

/* GET /api/chat/channels — list available channels with stats */
router.get("/channels", (_req: Request, res: Response) => {
  const channels = [
    { id: "global",  label: "Global",  description: "Exchange-wide chat", readOnly: false },
    { id: "support", label: "Support", description: "AI support + human escalation", readOnly: false },
    { id: "system",  label: "System",  description: "Protocol announcements", readOnly: true },
    { id: "ora",     label: "Ora AI",  description: "Dedicated AI assistant channel", readOnly: false },
  ];
  const withCounts = channels.map(c => ({
    ...c,
    messageCount: getChannel(c.id).length,
    activeClients: sseClients.get(c.id)?.size ?? 0,
  }));
  res.json({ channels: withCounts });
});

/* POST /api/chat/system — admin-only system message */
router.post("/system", (req: Request, res: Response) => {
  const { text, adminKey } = req.body as { text?: string; adminKey?: string };
  const expectedKey = process.env["ADMIN_KEY"] || "admin-secret";
  if (adminKey !== expectedKey) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!text?.trim()) {
    res.status(400).json({ error: "text required" });
    return;
  }
  const msg: ChatMessage = {
    id: genId(),
    channel: "system",
    wallet: "system",
    displayName: "OrahDEX",
    role: "system",
    text: text.trim(),
    ts: Date.now(),
  };
  addMessage("system", msg);
  res.json({ ok: true, message: msg });
});

export default router;
