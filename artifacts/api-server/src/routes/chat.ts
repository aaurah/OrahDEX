import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import { notifyNewTicket } from "../lib/notifier.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { BoundedMap } from "../lib/boundedMap.js";

const router = Router();

/* ── Types ──────────────────────────────────────────────────────────────── */
export type ChannelId = string; // "global" | "pair:BTC-USDT" | "vault:abc" | "support" | "system"

interface ChatMessage {
  id: string;
  channel: ChannelId;
  wallet: string;          // "0xabc..." | "anonymous"
  displayName: string;     // wallet[:6] or pseudonym
  role: "trader" | "leader" | "support" | "system";
  text: string;
  ts: number;
  txid?: string;           // detected on-chain txid in message
  replyTo?: string;        // message id
  moderated?: boolean;     // true = blocked by AI moderation
}

/* ── In-memory store ─────────────────────────────────────────────────────── */
const MAX_MSGS_PER_CHANNEL = 100;
const MAX_CHAT_CHANNELS = 200;
const MAX_SSE_CLIENTS_PER_CHANNEL = 100;
const MAX_SSE_CLIENTS_TOTAL = 500;
const store = new BoundedMap<ChannelId, ChatMessage[]>(MAX_CHAT_CHANNELS);
const sseClients = new Map<ChannelId, Set<Response>>();
let totalSseClients = 0;

const STATIC_CHANNELS = new Set(["global", "support", "system", "nft"]);

function normalizeChannel(channel: string): string | null {
  if (STATIC_CHANNELS.has(channel)) return channel;
  const pair = /^pair:([a-z0-9]{1,20})-([a-z0-9]{1,20})$/i.exec(channel);
  if (pair) return `pair:${pair[1]!.toUpperCase()}-${pair[2]!.toUpperCase()}`;
  const vault = /^vault:([a-z0-9_-]{1,64})$/i.exec(channel);
  if (vault) return `vault:${vault[1]!.toLowerCase()}`;
  return null;
}

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

/* ── Support-notify debounce (per wallet, 5 min) ─────────────────────────── */
const SUPPORT_NOTIFY_COOLDOWN = 5 * 60_000;
const supportNotifyMap = new BoundedMap<string, number>(5_000);
function shouldNotifySupport(wallet: string): boolean {
  const now = Date.now();
  const last = supportNotifyMap.get(wallet) ?? 0;
  if (now - last < SUPPORT_NOTIFY_COOLDOWN) return false;
  supportNotifyMap.set(wallet, now);
  /* Lazy GC: prune entries older than 1h */
  if (supportNotifyMap.size > 500) {
    for (const [k, v] of supportNotifyMap) {
      if (now - v > 3_600_000) supportNotifyMap.delete(k);
    }
  }
  return true;
}

/* ── Rate limiting ───────────────────────────────────────────────────────── */
const rateLimitMap = new BoundedMap<string, { count: number; resetAt: number }>(10_000);
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
  const channel = normalizeChannel(String(req.params["channel"] ?? ""));
  if (!channel) {
    res.status(400).json({ error: "Unsupported chat channel." });
    return;
  }
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const msgs = getChannel(channel).slice(-limit);
  res.json({ channel, messages: msgs });
});

/* GET /api/chat/channels/:channel/stream — SSE real-time feed */
router.get("/channels/:channel/stream", (req: Request, res: Response) => {
  const channel = normalizeChannel(String(req.params["channel"] ?? ""));
  if (!channel) {
    res.status(400).json({ error: "Unsupported chat channel." });
    return;
  }
  const clients = sseClients.get(channel);
  if (totalSseClients >= MAX_SSE_CLIENTS_TOTAL || (clients?.size ?? 0) >= MAX_SSE_CLIENTS_PER_CHANNEL) {
    res.status(503).json({ error: "Chat stream capacity is temporarily full. Please retry shortly." });
    return;
  }
  if (!clients && sseClients.size >= MAX_CHAT_CHANNELS) {
    res.status(503).json({ error: "Too many active chat channels. Please retry shortly." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const channelClients = clients ?? new Set<Response>();
  if (!clients) sseClients.set(channel, channelClients);
  channelClients.add(res);
  totalSseClients++;

  /* Send last 20 messages immediately as backfill */
  const backfill = getChannel(channel).slice(-20);
  res.write(`data: ${JSON.stringify({ type: "backfill", messages: backfill })}\n\n`);

  /* Keepalive ping every 25s */
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 25_000);

  res.on("close", () => {
    clearInterval(ping);
    const activeClients = sseClients.get(channel);
    if (activeClients?.delete(res)) {
      totalSseClients = Math.max(0, totalSseClients - 1);
      if (activeClients.size === 0) sseClients.delete(channel);
    }
  });
});

/* POST /api/chat/channels/:channel/messages — send a message */
router.post("/channels/:channel/messages", (req: Request, res: Response) => {
  const channel = normalizeChannel(String(req.params["channel"] ?? ""));
  if (!channel) {
    res.status(400).json({ error: "Unsupported chat channel." });
    return;
  }

  /* System announcements are server/admin controlled. */
  if (channel === "system") {
    res.status(403).json({ error: "This chat channel is read-only." });
    return;
  }

  const { text, wallet, displayName, replyTo } = req.body as {
    text?: string;
    wallet?: string;
    displayName?: string;
    replyTo?: string;
  };

  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (wallet !== undefined && typeof wallet !== "string") {
    res.status(400).json({ error: "wallet must be a string" });
    return;
  }
  if (displayName !== undefined && typeof displayName !== "string") {
    res.status(400).json({ error: "displayName must be a string" });
    return;
  }
  if (replyTo !== undefined && typeof replyTo !== "string") {
    res.status(400).json({ error: "replyTo must be a string" });
    return;
  }
  if (wallet && wallet.length > 120) {
    res.status(400).json({ error: "wallet must be 120 characters or fewer" });
    return;
  }
  if (displayName && displayName.length > 40) {
    res.status(400).json({ error: "displayName must be 40 characters or fewer" });
    return;
  }
  if (replyTo && replyTo.length > 80) {
    res.status(400).json({ error: "replyTo must be 80 characters or fewer" });
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
    displayName: displayName?.trim().slice(0, 40) || formatWallet(senderWallet),
    role: "trader",
    text: text.trim(),
    ts: Date.now(),
    ...(txid && { txid }),
    ...(replyTo && { replyTo }),
  };

  addMessage(channel, msg);
  logger.debug({ channel, wallet: msg.wallet, msgId: msg.id }, "chat message posted");

  /* Fire admin notification for support-channel user messages (Telegram/Discord/ntfy/Pushover)
   * Debounced per wallet (5 min cooldown) to avoid spamming admin channels when a user types
   * many messages in a row. The first message of each "burst" pings; subsequent messages
   * within the window are silently delivered via SSE only. */
  if (channel === "support" && msg.role !== "support" && msg.role !== "system") {
    if (shouldNotifySupport(msg.wallet)) {
      const subjectPreview = msg.text.length > 60 ? msg.text.slice(0, 60) + "…" : msg.text;
      notifyNewTicket({
        id: Math.floor(msg.ts / 1000) % 1_000_000, // pseudo-id for visual distinction
        name: msg.displayName,
        email: msg.wallet,
        subject: `Live chat: ${subjectPreview}`,
        category: "live_chat",
        message: msg.text,
        priority: "normal",
      }).catch(e => logger.warn({ err: e?.message }, "support chat notify failed"));
    }
  }

  res.json({ ok: true, message: msg });
});

/* GET /api/chat/channels — list available channels with stats */
router.get("/channels", (_req: Request, res: Response) => {
  const channels = [
    { id: "global",  label: "Global",  description: "Exchange-wide chat", readOnly: false },
    { id: "support", label: "Support", description: "Human support", readOnly: false },
    { id: "system",  label: "System",  description: "Protocol announcements", readOnly: true },
  ];
  const withCounts = channels.map(c => ({
    ...c,
    messageCount: getChannel(c.id).length,
    activeClients: sseClients.get(c.id)?.size ?? 0,
  }));
  res.json({ channels: withCounts });
});

/* POST /api/chat/system — authenticated admin-only system message */
router.post("/system", requireAdminToken, (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text required" });
    return;
  }
  if (text.length > 2_000) {
    res.status(413).json({ error: "text must be 2000 characters or fewer" });
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
