import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import diagnosticsRouter from "./diagnostics.js";
import aiRouter from "./ai.js";
import marketsRouter from "./markets.js";
import ordersRouter from "./orders.js";
import tradesRouter from "./trades.js";
import portfolioRouter from "./portfolio.js";
import futuresRouter from "./futures.js";
import adminRouter from "./admin.js";
import dexRouter from "./dex.js";
import globalMarketsRouter from "./globalMarkets.js";
import bridgeRouter from "./bridge.js";
import dexscreenerRouter from "./dexscreener.js";
import geckoTerminalRouter from "./geckoTerminal.js";
import coinVotesRouter from "./coinVotes.js";
import cexRouter from "./cex.js";
import copyTradingRouter from "./copyTrading.js";
import tvRouter from "./tradingview.js";
import supportRouter from "./support.js";
import virtualAmmRouter from "./virtualAmm.js";
import liquidityRouter from "./liquidity.js";
import swapRouter from "./swap.js";
import keeperRouter from "./keeper.js";
import p2pIntentsRouter from "./p2pIntents.js";
import { db, pool } from "@workspace/db";
import { platformSettingsTable, adminEmailsTable, walletsTable } from "@workspace/db/schema";
import { sql as drizzleSql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOrCreateEvmWallet, getEvmWallet } from "../lib/internalEvmWallet.js";
import { pubKeyToAddress, isBsvAddress, isPaymail } from "../lib/bsvWallet.js";
import { getNotifications, clearNotifications } from "../lib/notifQueue.js";

const router: IRouter = Router();

// Public settings — only whitelisted keys exposed (Reown project ID is a public identifier)
const PUBLIC_SETTING_KEYS = ["reown_project_id"];
router.get("/settings/public", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const result: Record<string, string> = {};
    for (const key of PUBLIC_SETTING_KEYS) {
      const row = rows.find(r => r.key === key);
      if (row?.value) result[key] = row.value;
    }
    res.json(result);
  } catch {
    res.json({});
  }
});

router.use(healthRouter);
router.use(diagnosticsRouter);
router.use(aiRouter);
router.use(marketsRouter);
router.use(ordersRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(futuresRouter);
router.use(dexRouter);
router.use(liquidityRouter);
router.use(swapRouter);
router.use("/admin", adminRouter);
router.use("/admin", cexRouter);
router.use("/tv", tvRouter);
router.use("/global-markets", globalMarketsRouter);
router.use("/bridge", bridgeRouter);
router.use(dexscreenerRouter);
router.use(geckoTerminalRouter);
router.use(coinVotesRouter);
router.use(copyTradingRouter);
router.use(supportRouter);
router.use(virtualAmmRouter);
router.use(keeperRouter);
router.use(p2pIntentsRouter);

/* ── Demo Account — POST /api/demo/activate ─────────────────────────────────
 * Creates or resets a demo wallet with $80,000 in paper-trading funds.
 * The demo address has the prefix "DEMO_" so the API can distinguish it.
 * Calling this multiple times with the same address simply refills the balance.
 */

router.post("/demo/activate", async (req, res) => {
  try {
    const { address } = req.body as { address?: string };

    if (!address || typeof address !== "string" || !address.startsWith("DEMO_")) {
      res.status(400).json({ error: "A valid demo address starting with DEMO_ is required" });
      return;
    }

    // Sanitize
    const demoAddr = address.trim().slice(0, 80);

    // Seed $80,000 in paper-trading funds (a mix of major assets)
    // Always SET to exact amounts (not additive), so repeated calls = clean reset.
    const DEMO_BALANCES = [
      { asset: "USDT", amount: "50000" },    // $50,000 stable
      { asset: "BTC",  amount: "0.1"    },   // ~$8,300
      { asset: "ETH",  amount: "7"      },   // ~$12,600
      { asset: "BNB",  amount: "8"      },   // ~$4,640
      { asset: "BSV",  amount: "500"    },   // ~$7,450
      { asset: "SOL",  amount: "50"     },   // ~$7,500 bonus
    ];

    // Reset available balance for each asset (upsert to exact demo amount)
    for (const b of DEMO_BALANCES) {
      await pool.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
         VALUES ($1, $2, $3, '0', now())
         ON CONFLICT (wallet_address, asset_symbol)
         DO UPDATE SET available = $3, locked = '0', updated_at = now()`,
        [demoAddr, b.asset, b.amount],
      );
    }

    res.json({
      success: true,
      address: demoAddr,
      balances: DEMO_BALANCES,
      totalUSD: 90490,
      message: "Demo account ready — $80,000+ in paper-trading funds",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to activate demo account");
    res.status(500).json({ error: err?.message ?? "Failed to activate demo account" });
  }
});

/* ── BSV HandCash handle resolution proxy ────────────────────────────────── */
router.get("/bsv/resolve-handle/:handle", async (req, res) => {
  const raw = req.params.handle ?? "";
  const handle = raw.replace(/^\$/, "").trim().toLowerCase();

  if (!handle || !/^[a-z0-9_.-]{1,50}$/.test(handle)) {
    res.status(400).json({ error: "Invalid handle format." });
    return;
  }

  // Paymail is the canonical BSV address format for HandCash: handle@handcash.io
  const paymailAddr = `${handle}@handcash.io`;

  // Strategy 1: Try HandCash Cloud API (server-side to avoid CORS)
  const tryUrls = [
    `https://cloud.handcash.io/v2/users/public-data?alias=${encodeURIComponent(handle)}`,
    `https://api.handcash.io/api/users/public-data?alias=${encodeURIComponent(handle)}`,
  ];

  for (const url of tryUrls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } });
      clearTimeout(timer);
      if (r.ok) {
        const data = await r.json() as any;
        const addr: string =
          data?.publicProfile?.receivingAddress ??
          data?.publicProfile?.paymail ??
          data?.receivingAddress ??
          data?.paymail ??
          paymailAddr;
        const displayName: string = data?.publicProfile?.displayName ?? `$${handle}`;
        const avatarUrl: string | null = data?.publicProfile?.avatarUrl ?? null;
        res.json({ handle: `$${handle}`, address: addr, paymail: paymailAddr, displayName, avatarUrl, resolved: true });
        return;
      }
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 2: Try paymail resolution protocol (SRV/well-known)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`https://handcash.io/.well-known/bsvalias`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const cap = await r.json() as any;
      const profileUrl = cap?.capabilities?.["f12f968c92d6"]?.replace("{alias}", handle).replace("{domain.tld}", "handcash.io");
      if (profileUrl) {
        const pr = await fetch(profileUrl, { signal: new AbortController().signal });
        if (pr.ok) {
          const pd = await pr.json() as any;
          const addr = pd?.pubkey ? paymailAddr : paymailAddr;
          res.json({ handle: `$${handle}`, address: addr, paymail: paymailAddr, displayName: `$${handle}`, avatarUrl: null, resolved: true });
          return;
        }
      }
    }
  } catch {
    // continue to fallback
  }

  // Strategy 3: Fallback — paymail IS a valid BSV address (handle@handcash.io)
  logger.info({ handle }, "HandCash API unavailable — falling back to paymail format");
  res.json({
    handle: `$${handle}`,
    address: paymailAddr,
    paymail: paymailAddr,
    displayName: `$${handle}`,
    avatarUrl: null,
    resolved: false,
    fallback: true,
    message: "Resolved via paymail format — HandCash API unreachable",
  });
});

/* ── BSV address / paymail balance lookup ─────────────────────────────────── */
router.get("/bsv/balance/:address", async (req, res) => {
  const raw = decodeURIComponent(req.params.address ?? "").trim();

  if (!raw) {
    res.status(400).json({ error: "Address is required." });
    return;
  }

  let bsvAddress: string | null = null;
  let paymailResolved = false;

  // If it's already a P2PKH address, use it directly
  if (isBsvAddress(raw)) {
    bsvAddress = raw;
  } else if (isPaymail(raw)) {
    // Try paymail PKI resolution to get the P2PKH address
    const [alias, domain] = raw.split("@");

    // Strategy 1: Try well-known bsvalias to find pki endpoint
    const paymailDomains = [domain, `bsvalias.${domain}`];
    for (const d of paymailDomains) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const wk = await fetch(`https://${d}/.well-known/bsvalias`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (wk.ok) {
          const caps = await wk.json() as any;
          const pkiTmpl: string | undefined = caps?.capabilities?.pki;
          if (pkiTmpl) {
            const pkiUrl = pkiTmpl
              .replace("{alias}", alias)
              .replace("{domain.tld}", domain);
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 3000);
            const pkiRes = await fetch(pkiUrl, { signal: ctrl2.signal });
            clearTimeout(t2);
            if (pkiRes.ok) {
              const pkiData = await pkiRes.json() as any;
              const pubkey: string | undefined = pkiData?.pubkey ?? pkiData?.publicKey;
              if (pubkey && pubkey.length >= 66) {
                bsvAddress = pubKeyToAddress(pubkey);
                paymailResolved = true;
                break;
              }
            }
          }
        }
      } catch { /* try next */ }
      if (bsvAddress) break;
    }

    // Strategy 2: Try well-known direct PKI endpoint patterns
    if (!bsvAddress) {
      const pkiPatterns = [
        `https://bsvalias.${domain}/${alias}@${domain}/id-key`,
        `https://bsvalias.${domain}/${alias}@${domain}/public-key`,
        `https://${domain}/${alias}@${domain}/id-key`,
      ];
      for (const url of pkiPatterns) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2500);
          const r = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (r.ok) {
            const d = await r.json() as any;
            const pubkey = d?.pubkey ?? d?.publicKey ?? d?.key;
            if (pubkey && pubkey.length >= 66) {
              bsvAddress = pubKeyToAddress(pubkey);
              paymailResolved = true;
              break;
            }
          }
        } catch { /* try next */ }
      }
    }
  }

  if (!bsvAddress) {
    // Return zero balance with explanation — paymail couldn't be resolved to on-chain address
    res.json({
      input: raw,
      bsvAddress: null,
      paymailResolved: false,
      balance: 0,
      balanceSatoshis: 0,
      confirmed: 0,
      unconfirmed: 0,
      error: "paymail_unresolved",
      message: "Could not resolve paymail to a BSV address — the paymail provider's PKI service is unavailable.",
    });
    return;
  }

  // Fetch balance from WhatsOnChain
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const wocRes = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/address/${bsvAddress}/balance`,
      { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } }
    );
    clearTimeout(timer);

    if (!wocRes.ok) {
      res.json({ input: raw, bsvAddress, paymailResolved, balance: 0, balanceSatoshis: 0, confirmed: 0, unconfirmed: 0 });
      return;
    }

    const data = await wocRes.json() as { confirmed: number; unconfirmed: number };
    const totalSatoshis = (data.confirmed ?? 0) + (data.unconfirmed ?? 0);
    const bsvBalance = totalSatoshis / 1e8;

    res.json({
      input: raw,
      bsvAddress,
      paymailResolved,
      balance: bsvBalance,
      balanceSatoshis: totalSatoshis,
      confirmed: (data.confirmed ?? 0) / 1e8,
      unconfirmed: (data.unconfirmed ?? 0) / 1e8,
    });
  } catch (err: any) {
    logger.warn({ bsvAddress, err: err?.message }, "WhatsOnChain balance fetch failed");
    res.json({ input: raw, bsvAddress, paymailResolved, balance: 0, balanceSatoshis: 0, confirmed: 0, unconfirmed: 0 });
  }
});

/* ── BSV UTXO list (proxied from WhatsonChain) ───────────────────────────────
 * GET /api/bsv/utxos/:address
 * Returns unspent outputs in the same shape as the reference fetchBsvUtxos().
 */
router.get("/bsv/utxos/:address", async (req, res) => {
  const address = req.params.address ?? "";
  if (!address) { res.status(400).json({ error: "address required" }); return; }
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const wocRes = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`,
      { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } }
    );
    clearTimeout(timer);
    if (!wocRes.ok) { res.json([]); return; }
    const data = await wocRes.json() as Array<{
      tx_hash: string;
      tx_pos:  number;
      value:   number;
      height?: number;
    }>;
    res.json(data.map(u => ({
      txId:        u.tx_hash,
      outputIndex: u.tx_pos,
      script:      "",      // P2PKH script — built by client from the address
      satoshis:    u.value,
      height:      u.height ?? 0,
    })));
  } catch {
    res.json([]);
  }
});

/* ── BSV raw tx broadcast (proxied to WhatsonChain) ─────────────────────────
 * POST /api/bsv/broadcast
 * Body: { rawHex: string }
 * Mirrors signAndBroadcastBsvTx() from the reference implementation.
 * WhatsonChain returns the txid as a JSON-quoted string on success.
 */
router.post("/bsv/broadcast", async (req, res) => {
  const { rawHex } = req.body ?? {};
  if (!rawHex || typeof rawHex !== "string") {
    res.status(400).json({ error: "rawHex is required" });
    return;
  }
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const wocRes = await fetch("https://api.whatsonchain.com/v1/bsv/main/tx/raw", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "OrahDEX/1.0" },
      body:    JSON.stringify({ txhex: rawHex }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    const text = await wocRes.text();
    if (wocRes.ok && text) {
      // WoC returns the txid as plain or JSON-quoted text
      const txid = text.trim().replace(/^"|"$/g, "");
      res.json({ txid, explorerUrl: `https://whatsonchain.com/tx/${txid}` });
    } else {
      res.status(wocRes.status).json({ error: text || "Broadcast failed" });
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "BSV broadcast failed");
    res.status(500).json({ error: err?.message ?? "Broadcast failed" });
  }
});

/* ── Passkey Wallet — Cloud Backup & Restore ────────────────────────────────
 * Stores the encrypted wallet blob on the server, keyed by credential ID.
 * The blob is AES-GCM encrypted with the passkey rawId — completely
 * safe to store server-side because it cannot be decrypted without
 * biometric authentication on the original device/OS ecosystem.
 *
 * POST /api/passkey/backup   — save encrypted wallet
 * GET  /api/passkey/backup/:credentialId — retrieve backup
 * POST /api/passkey/transfer — generate a short 8-char transfer code
 * GET  /api/passkey/transfer/:code — retrieve wallet by transfer code
 */

router.post("/passkey/backup", async (req, res) => {
  try {
    const { credentialId, encryptedKey, iv, address, label } = req.body as {
      credentialId: string; encryptedKey: string; iv: string; address: string; label?: string;
    };
    if (!credentialId || !encryptedKey || !iv || !address) {
      res.status(400).json({ error: "credentialId, encryptedKey, iv and address are required" });
      return;
    }
    const key = `pk_bk:${credentialId}`;
    const value = JSON.stringify({ credentialId, encryptedKey, iv, address, label: label ?? "Passkey Wallet", savedAt: Date.now() });
    await db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Backup failed" });
  }
});

router.get("/passkey/backup/:credentialId", async (req, res) => {
  try {
    const key = `pk_bk:${req.params.credentialId}`;
    const [row] = await db.select().from(platformSettingsTable).where(
      drizzleSql`${platformSettingsTable.key} = ${key}`
    );
    if (!row) { res.status(404).json({ error: "No backup found" }); return; }
    res.json(JSON.parse(row.value));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Restore failed" });
  }
});

router.post("/passkey/transfer", async (req, res) => {
  try {
    const { credentialId, encryptedKey, iv, address, label } = req.body as {
      credentialId: string; encryptedKey: string; iv: string; address: string; label?: string;
    };
    if (!credentialId || !encryptedKey || !iv || !address) {
      res.status(400).json({ error: "credentialId, encryptedKey, iv and address are required" });
      return;
    }
    // Generate 8-char alphanumeric code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) code += chars[b % chars.length];
    const key = `pk_tc:${code}`;
    const value = JSON.stringify({ credentialId, encryptedKey, iv, address, label: label ?? "Passkey Wallet", expiresAt: Date.now() + 10 * 60 * 1000 });
    await db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ success: true, code });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Transfer code generation failed" });
  }
});

router.get("/passkey/transfer/:code", async (req, res) => {
  try {
    const code = (req.params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!code) { res.status(400).json({ error: "Invalid code" }); return; }
    const key = `pk_tc:${code}`;
    const [row] = await db.select().from(platformSettingsTable).where(
      drizzleSql`${platformSettingsTable.key} = ${key}`
    );
    if (!row) { res.status(404).json({ error: "Code not found or expired" }); return; }
    const data = JSON.parse(row.value);
    if (data.expiresAt && Date.now() > data.expiresAt) {
      res.status(410).json({ error: "Transfer code has expired (10 min limit)" }); return;
    }
    // Delete code after use
    await db.delete(platformSettingsTable).where(drizzleSql`${platformSettingsTable.key} = ${key}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Transfer code lookup failed" });
  }
});

/* ── Inbound Email Webhook ───────────────────────────────────────────────────
 * POST /api/webhook/email-inbound
 *
 * Receives inbound emails from Mailgun, SendGrid, Postmark, or any
 * email forwarding service. Each provider posts different fields — we
 * parse the common ones and store the email in the admin inbox.
 *
 * Mailgun:  sender, recipient, subject, body-plain, body-html, timestamp
 * SendGrid: from, to, subject, text, html
 * Postmark: From, To, Subject, TextBody, HtmlBody
 * Generic:  from / fromAddress, to / toAddress, subject, body / text
 *
 * The webhook URL to configure in your provider:
 *   https://YOUR_DOMAIN/api/webhook/email-inbound
 */
router.post("/webhook/email-inbound", async (req, res) => {
  try {
    const b = req.body as Record<string, any>;

    // Normalise across providers
    const from: string =
      b.sender ?? b.from ?? b.From ?? b.fromAddress ?? b.from_email ?? "unknown@unknown.com";

    const to: string =
      b.recipient ?? b.to ?? b.To ?? b.toAddress ?? b.to_email ?? "inbox@orahdex.org";

    const subject: string =
      b.subject ?? b.Subject ?? "(no subject)";

    const body: string =
      b["body-plain"] ?? b.text ?? b.TextBody ?? b.body ?? b.plain ??
      b["body-html"] ?? b.html ?? b.HtmlBody ?? "(empty)";

    // Strip basic HTML tags for storage if we only got HTML
    const cleanBody = body.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();

    if (!from || !subject) {
      res.status(400).json({ error: "Missing required fields: from, subject" });
      return;
    }

    const [inserted] = await db.insert(adminEmailsTable).values({
      folder: "inbox",
      fromAddress: from,
      toAddress: to,
      subject,
      body: cleanBody || body,
      category: "contact",
      isRead: false,
      isStarred: false,
    }).returning();

    logger.info({ from, to, subject, id: inserted.id }, "Inbound email received via webhook");
    res.json({ success: true, id: inserted.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to process inbound email webhook");
    res.status(500).json({ error: err?.message ?? "Failed to process inbound email" });
  }
});

/* ── Wallet ping — register / refresh a connected wallet in the DB ───────────
 * POST /api/users/ping
 * Body: { address, network, provider, chainId? }
 * Called by the frontend every time a wallet connects.
 * Uses an upsert so repeated calls are idempotent.
 */
router.post("/users/ping", async (req, res) => {
  try {
    const { address, network, provider, chainId } = req.body as {
      address?: string;
      network?: string;
      provider?: string;
      chainId?: string | number;
    };

    if (!address || typeof address !== "string" || address.trim().length < 10) {
      res.status(400).json({ error: "Valid address is required" });
      return;
    }

    const addr = address.trim().toLowerCase();
    const networkType = (network ?? (addr.startsWith("0x") ? "evm" : "bsv")).toLowerCase();

    await db.insert(walletsTable)
      .values({
        address: addr,
        networkType,
        provider: provider ?? null,
        chainId: chainId != null ? String(chainId) : null,
        firstSeen: new Date(),
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: walletsTable.address,
        set: {
          lastSeen: new Date(),
          ...(provider && { provider }),
          ...(chainId != null && { chainId: String(chainId) }),
          ...(network && { networkType }),
        },
      });

    res.json({ success: true, address: addr });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to ping wallet");
    res.status(500).json({ error: err?.message ?? "Failed to register wallet" });
  }
});

/**
 * GET /api/notifications?address=0x…&since=<timestamp>
 * Returns latest notifications for a wallet address.
 */
router.get("/notifications", (req, res) => {
  const addr = (req.query.address as string | undefined);
  if (!addr) return res.json({ notifications: [] });
  const since = Number(req.query.since ?? 0);
  return res.json({ notifications: getNotifications(addr, since) });
});

/**
 * DELETE /api/notifications?address=0x…
 */
router.delete("/notifications", (req, res) => {
  const addr = (req.query.address as string | undefined);
  if (addr) clearNotifications(addr);
  res.json({ success: true });
});

/* ── QR Connect Session ───────────────────────────────────────────────────
 * Ephemeral in-memory store: desktop creates a session, mobile scans the
 * QR and posts its wallet address; desktop polls until connected.
 * Sessions expire after 5 minutes automatically.
 * ─────────────────────────────────────────────────────────────────────── */
interface ConnectSession {
  token: string;
  status: "pending" | "connected";
  address?: string;
  chain?: string;
  walletType?: string;
  createdAt: number;
  expiresAt: number;
}
const connectSessions = new Map<string, ConnectSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

// Prune expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of connectSessions) {
    if (s.expiresAt < now) connectSessions.delete(k);
  }
}, 60_000);

/* ─── USER API KEYS ───────────────────────────────────────────────────────── */

const userApiKeys: Map<string, {
  id: string; wallet: string; name: string;
  key: string; permission: string; rateLimit: number;
  calls24h: number; status: string; createdAt: string;
}> = new Map();

router.get("/user/api-keys", (req, res) => {
  const wallet = (req.query.wallet as string ?? "").toLowerCase().trim();
  if (!wallet) { res.status(400).json({ error: "wallet required" }); return; }
  const keys = [...userApiKeys.values()].filter(k => k.wallet === wallet);
  res.json(keys);
});

router.post("/user/api-keys", (req, res) => {
  const { wallet, name, permission = "read", rateLimit = 100 } = req.body as any;
  if (!wallet || !name) { res.status(400).json({ error: "wallet and name required" }); return; }
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const rand = Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const id = `ukey_${Date.now().toString(36)}`;
  const key = {
    id, wallet: wallet.toLowerCase(),
    name, permission, rateLimit: parseInt(rateLimit) || 100,
    key: `orah_usr_${rand}`,
    calls24h: 0, status: "active",
    createdAt: new Date().toISOString().split("T")[0],
  };
  userApiKeys.set(id, key);
  res.status(201).json(key);
});

router.delete("/user/api-keys/:id", (req, res) => {
  const k = userApiKeys.get(req.params.id);
  if (!k) { res.status(404).json({ error: "Key not found" }); return; }
  k.status = "revoked";
  res.json({ success: true });
});

/* ─── INTERNAL EVM WALLET (auto-provisioned for BSV users) ──────────────────
 *
 *  GET  /api/user/evm-wallet?bsvAddress=<addr>   — fetch existing address
 *  POST /api/user/evm-wallet                     — create-or-get (idempotent)
 *
 *  Response: { evmAddress: string, isNew: boolean }
 *  The private key is NEVER returned to the client.
 * ─────────────────────────────────────────────────────────────────────────── */

router.get("/user/evm-wallet", async (req, res) => {
  const bsvAddress = (req.query.bsvAddress as string ?? "").trim();
  if (!bsvAddress) { res.status(400).json({ error: "bsvAddress required" }); return; }
  try {
    const evmAddress = await getEvmWallet(bsvAddress);
    if (!evmAddress) { res.status(404).json({ error: "No internal EVM wallet provisioned yet" }); return; }
    res.json({ evmAddress, isNew: false });
  } catch (err) {
    logger.error({ err }, "Failed to fetch internal EVM wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user/evm-wallet", async (req, res) => {
  const { bsvAddress } = req.body as { bsvAddress?: string };
  if (!bsvAddress || typeof bsvAddress !== "string" || !bsvAddress.trim()) {
    res.status(400).json({ error: "bsvAddress required" });
    return;
  }
  try {
    const result = await getOrCreateEvmWallet(bsvAddress.trim());
    res.status(result.isNew ? 201 : 200).json(result);
  } catch (err) {
    logger.error({ err }, "Failed to provision internal EVM wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/connect-session — desktop creates a pairing session */
router.post("/connect-session", (_req, res) => {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const now = Date.now();
  const session: ConnectSession = { token, status: "pending", createdAt: now, expiresAt: now + SESSION_TTL_MS };
  connectSessions.set(token, session);
  res.json({ token, expiresAt: session.expiresAt });
});

/** GET /api/connect-session/:token — desktop polls for connection */
router.get("/connect-session/:token", (req, res) => {
  const session = connectSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Session not found or expired" });
  }
  res.json({ status: session.status, address: session.address, chain: session.chain, walletType: session.walletType });
});

/** PUT /api/connect-session/:token — mobile submits wallet address */
router.put("/connect-session/:token", (req, res) => {
  const session = connectSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Session not found or expired" });
  }
  const { address, chain, walletType } = req.body as { address?: string; chain?: string; walletType?: string };
  if (!address) return res.status(400).json({ error: "address is required" });
  session.status = "connected";
  session.address = address;
  session.chain = chain ?? "BSV";
  session.walletType = walletType ?? "unknown";
  res.json({ success: true });
});

export default router;

