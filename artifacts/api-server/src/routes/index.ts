import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import diagnosticsRouter from "./diagnostics.js";
import aiRouter from "./ai.js";
import devaiRouter from "./devai.js";
import marketsRouter from "./markets.js";
import explorerRouter from "./explorer.js";
import ordersRouter from "./orders.js";
import tradesRouter from "./trades.js";
import portfolioRouter from "./portfolio.js";
import futuresRouter from "./futures.js";
import adminRouter from "./admin.js";
import dexRouter from "./dex.js";
import globalMarketsRouter from "./globalMarkets.js";
import bridgeRouter from "./bridge.js";
import bridgeAggRouter from "./bridgeAgg.js";
import dexscreenerRouter from "./dexscreener.js";
import geckoTerminalRouter from "./geckoTerminal.js";
import coinVotesRouter from "./coinVotes.js";
import cexRouter from "./cex.js";
import copyTradingRouter from "./copyTrading.js";
import tvRouter from "./tradingview.js";
import supportRouter from "./support.js";
import supportChatsRouter from "./supportChats.js";
import virtualAmmRouter from "./virtualAmm.js";
import liquidityRouter from "./liquidity.js";
import swapRouter from "./swap.js";
import buyRouter from "./buy.js";
import keeperRouter from "./keeper.js";
import p2pIntentsRouter from "./p2pIntents.js";
import chatRouter from "./chat.js";
import evmSettlementRouter from "./evmSettlement.js";
import withdrawalsRouter from "./withdrawals.js";
import depositRouter from "./deposit.js";
import nftRouter from "./nft.js";
import socialNftRouter from "./socialNft.js";
import catalogRouter from "./catalog.js";
import treasuryRouter from "./treasury.js";
import aiImageRouter from "./aiImage.js";
import creatorCoinsRouter from "./creatorCoins.js";
import predictionRouter from "./prediction.js";
import feeRevenueRouter from "./feeRevenue.js";
import hyperliquidRouter from "./hyperliquid.js";
import tradeRouter from "./trade.js";
import letsexchangeRouter from "./letsexchange.js";
import stakingRouter from "./staking.js";
import lpStakingRouter from "./lpStaking.js";
import bsvIntentRouter from "./bsvIntent.js";
import evmToBsvIntentRouter from "./evmToBsvIntent.js";
import swapsRouter from "./swaps.js";
import stripeCheckoutRouter from "./stripeCheckout.js";
import adminDiagnosticsRouter from "./adminDiagnostics.js";
import coinbaseRouter from "./coinbase.js";
import kycRouter from "./kyc.js";
import walletRouter from "./wallet.js";
import anthropicRouter from "./anthropic/index.js";
import quantumAuthRouter from "./quantumAuth.js";
import sorRouter from "./sor.js";
import lightningRouter from "./lightning.js";
import advancedOrdersRouter from "./advancedOrders.js";
import optionsRouter from "./options.js";
import overlayRouter from "./overlay.js";
import handcashRouter from "./handcash.js";
import tokensRouter from "./tokens.js";
import externalSwapRouter from "./externalSwap.js";
import lifiRouter from "./lifi.js";
import quicknodeRouter from "./quicknode.js";
import awsRouter from "./aws.js";
import { db, pool } from "@workspace/db";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { platformSettingsTable, adminEmailsTable, walletsTable } from "@workspace/db/schema";
import { sql as drizzleSql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOrCreateEvmWallet, getEvmWallet } from "../lib/internalEvmWallet.js";
import { getOrCreateBsvWallet, getBsvWallet } from "../lib/internalBsvWallet.js";
import { pubKeyToAddress, isBsvAddress, isPaymail } from "../lib/bsvWallet.js";
import { getNotifications, clearNotifications } from "../lib/notifQueue.js";
import { BSV_NET, getBsvNetworkConfig, type BsvNetwork } from "../lib/bsvNetworkConfig.js";
import { randomBytes } from "node:crypto";
import { issueWalletRequestChallenge, verifyWalletRequestProof, type WalletRequestResource } from "../lib/walletRequestAuth.js";
import {
  ApiKeyConfigurationError,
  createPersonalApiKey,
  listPersonalApiKeys,
  normalizePersonalApiKeyInput,
  personalApiKeyRequestContext,
  revokePersonalApiKey,
} from "../lib/personalApiKeys.js";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { fetchPublicJson } from "../lib/safePublicFetch.js";
import externalDepthRouter from "./externalDepth";
import leEstimateShimRouter from "./leEstimateShim";

const router: IRouter = Router()

router.use(externalDepthRouter);
router.use(leEstimateShimRouter);;

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
router.use(devaiRouter);
router.use(marketsRouter);
router.use(explorerRouter);
router.use(ordersRouter);
router.use(advancedOrdersRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(futuresRouter);
router.use(optionsRouter);
router.use(dexRouter);
router.use(liquidityRouter);
router.use(swapRouter);
router.use(sorRouter);
router.use(buyRouter);
router.use(handcashRouter);
router.use(tokensRouter);
router.use(externalSwapRouter);
router.use(lifiRouter);
// Protect all /admin routes — allow only the public auth endpoints through without a token.
const ADMIN_OPEN_METHODS_PATHS = new Set([
  "POST:/auth",
  "POST:/auth/totp",
  "POST:/auth/wallet-challenge",
  "POST:/auth/wallet",
]);
router.use("/admin", (req, res, next) => {
  if (ADMIN_OPEN_METHODS_PATHS.has(`${req.method}:${req.path}`)) return next();
  return requireAdminToken(req, res, next);
});
router.use("/admin", adminRouter);
router.use("/admin", adminDiagnosticsRouter);
router.use("/admin", cexRouter);
router.use("/admin", awsRouter);
router.use("/tv", tvRouter);
router.use("/global-markets", globalMarketsRouter);
router.use("/bridge", bridgeRouter);
router.use("/bridge-agg", bridgeAggRouter);
router.use(dexscreenerRouter);
router.use(geckoTerminalRouter);
router.use(coinVotesRouter);
router.use(copyTradingRouter);
router.use(supportRouter);
router.use(supportChatsRouter);
router.use(virtualAmmRouter);
router.use(keeperRouter);
router.use(p2pIntentsRouter);
router.use(feeRevenueRouter);
router.use(withdrawalsRouter);
router.use("/lightning", lightningRouter);
router.use(tradeRouter);
router.use("/chat", chatRouter);
router.use("/settlement/evm", evmSettlementRouter);
router.use(depositRouter);
router.use(nftRouter);
router.use(socialNftRouter);
router.use(catalogRouter);
router.use(treasuryRouter);
router.use(aiImageRouter);
router.use(creatorCoinsRouter);
router.use(predictionRouter);
router.use(letsexchangeRouter);
router.use(stakingRouter);
router.use(lpStakingRouter);
router.use(bsvIntentRouter);
router.use(evmToBsvIntentRouter);
router.use(swapsRouter);
router.use(stripeCheckoutRouter);
router.use(coinbaseRouter);
router.use(kycRouter);
router.use("/wallet", walletRouter);
router.use(anthropicRouter);
router.use(quantumAuthRouter);
router.use("/overlay", overlayRouter);
router.use(quicknodeRouter);
router.use(hyperliquidRouter);


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

/* ── BSV network info ────────────────────────────────────────────────────── */
router.get("/bsv/network-info", (_req, res) => {
  res.json({
    network:    BSV_NET.network,
    isTestnet:  BSV_NET.isTestnet,
    explorer:   BSV_NET.explorer,
    wocBase:    BSV_NET.wocBase,
    label:      BSV_NET.isTestnet ? "Bitcoin SV Testnet" : "Bitcoin SV",
    networkKey: BSV_NET.isTestnet ? "bsv-test" : "bsv",
  });
});

/* ── BSV address / paymail balance lookup ─────────────────────────────────── */
router.get("/bsv/balance/:address", async (req, res) => {
  const raw = decodeURIComponent(req.params.address ?? "").trim();
  const networkParam = String(req.query.network ?? "").trim().toLowerCase();
  let selectedNetwork: BsvNetwork = BSV_NET.network;

  if (networkParam) {
    if (["test", "testnet", "bsv-test"].includes(networkParam)) selectedNetwork = "test";
    else if (["main", "mainnet", "bsv"].includes(networkParam)) selectedNetwork = "main";
    else {
      res.status(400).json({ error: "network must be main or test." });
      return;
    }
  }
  const networkConfig = getBsvNetworkConfig(selectedNetwork);

  if (!raw) {
    res.status(400).json({ error: "Address is required." });
    return;
  }

  let bsvAddress: string | null = null;
  let paymailResolved = false;

  // If it's already a P2PKH address, use it directly
  if (isBsvAddress(raw, selectedNetwork)) {
    bsvAddress = raw;
  } else if (isPaymail(raw)) {
    // Try paymail PKI resolution to get the P2PKH address
    const [alias, domain] = raw.split("@");

    // Validate domain is a safe public hostname to prevent SSRF
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(domain)) {
      res.status(400).json({ error: "Invalid paymail domain." });
      return;
    }

    // Strategy 1: Try well-known bsvalias to find pki endpoint
    const paymailDomains = [domain, `bsvalias.${domain}`];
    for (const d of paymailDomains) {
      try {
        const caps = await fetchPublicJson<any>(`https://${d}/.well-known/bsvalias`, { timeoutMs: 3000, maxBytes: 64 * 1024 });
        if (caps) {
          const pkiTmpl: string | undefined = caps?.capabilities?.pki;
          if (pkiTmpl) {
            // Only follow https:// PKI template URLs to prevent SSRF
            const pkiUrl = pkiTmpl
              .replace("{alias}", encodeURIComponent(alias))
              .replace("{domain.tld}", encodeURIComponent(domain));
            if (!pkiUrl.startsWith("https://")) { break; }
            const pkiData = await fetchPublicJson<any>(pkiUrl, { timeoutMs: 3000, maxBytes: 64 * 1024 });
            if (pkiData) {
              const pubkey: string | undefined = pkiData?.pubkey ?? pkiData?.publicKey;
              if (pubkey && pubkey.length >= 66) {
                bsvAddress = pubKeyToAddress(pubkey, selectedNetwork);
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
      const encodedAlias = encodeURIComponent(alias);
      const encodedDomain = encodeURIComponent(domain);
      const pkiPatterns = [
        `https://bsvalias.${domain}/${encodedAlias}@${encodedDomain}/id-key`,
        `https://bsvalias.${domain}/${encodedAlias}@${encodedDomain}/public-key`,
        `https://${domain}/${encodedAlias}@${encodedDomain}/id-key`,
      ];
      for (const url of pkiPatterns) {
        try {
          const d = await fetchPublicJson<any>(url, { timeoutMs: 2500, maxBytes: 64 * 1024 });
          if (d) {
            const pubkey = d?.pubkey ?? d?.publicKey ?? d?.key;
            if (pubkey && pubkey.length >= 66) {
              bsvAddress = pubKeyToAddress(pubkey, selectedNetwork);
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

  // Fetch balance from WhatsOnChain, falling back to UTXO sum when the
  // balance endpoint lags behind the mempool (common for fresh unconfirmed txs).
  try {
    const fetchWithTimeout = async (url: string, ms = 5000) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try { return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } }); }
      finally { clearTimeout(t); }
    };

    const wocRes = await fetchWithTimeout(`${networkConfig.wocBase}/address/${encodeURIComponent(bsvAddress)}/balance`);
    if (!wocRes.ok) throw new Error(`WhatsOnChain balance request failed (${wocRes.status})`);

    let confirmedSat = 0;
    let unconfirmedSat = 0;

    const data = await wocRes.json() as { confirmed: number; unconfirmed: number };
    confirmedSat   = data.confirmed   ?? 0;
    unconfirmedSat = data.unconfirmed ?? 0;

    // WhatsonChain's /balance endpoint sometimes returns 0 for both fields
    // even when an unconfirmed UTXO is in the mempool.  Fall back to the
    // /unspent endpoint and sum the raw values — it is always up-to-date.
    if (confirmedSat === 0 && unconfirmedSat === 0) {
      try {
        const utxoRes = await fetchWithTimeout(`${networkConfig.wocBase}/address/${encodeURIComponent(bsvAddress)}/unspent`);
        if (!utxoRes.ok) throw new Error(`WhatsOnChain UTXO request failed (${utxoRes.status})`);
        if (utxoRes.ok) {
          const utxos = await utxoRes.json() as Array<{ value: number; height: number }>;
          for (const u of utxos) {
            if ((u.height ?? 0) > 0) confirmedSat   += u.value;
            else                      unconfirmedSat += u.value;
          }
        }
      } catch { /* non-fatal */ }
    }

    const totalSatoshis = confirmedSat + unconfirmedSat;
    const bsvBalance = totalSatoshis / 1e8;

    res.json({
      input: raw,
      network: selectedNetwork,
      bsvAddress,
      paymailResolved,
      balance:        bsvBalance,
      balanceSatoshis: totalSatoshis,
      confirmed:      confirmedSat   / 1e8,
      unconfirmed:    unconfirmedSat / 1e8,
      explorerTx:     `${networkConfig.explorer}/tx/`,
    });
  } catch (err: any) {
    logger.warn({ bsvAddress, err: err?.message }, "WhatsOnChain balance fetch failed");
    res.status(502).json({
      error: "balance_unavailable",
      message: "Could not confirm the on-chain balance. The previous balance was left unchanged.",
    });
  }
});

/* ── BSV UTXO list (proxied from WhatsonChain) ───────────────────────────────
 * GET /api/bsv/utxos/:address
 * Returns unspent outputs in the same shape as the reference fetchBsvUtxos().
 */
router.get("/bsv/utxos/:address", async (req, res) => {
  const address = req.params.address ?? "";
  if (!address) { res.status(400).json({ error: "address required" }); return; }
  // Validate BSV address format to prevent SSRF
  if (!isBsvAddress(address)) { res.status(400).json({ error: "invalid BSV address" }); return; }
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const wocRes = await fetch(
      `${BSV_NET.wocBase}/address/${address}/unspent`,
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

/* The unauthenticated raw-transaction relay was abused as a public ARC proxy.
 * Wallets should broadcast their own signed transaction through their provider.
 */
router.post("/bsv/broadcast", (_req, res) => {
  res.status(410).json({ error: "Public BSV broadcast relay is disabled. Broadcast signed transactions through your wallet provider." });
});

/* ── Passkey Wallet — Cloud Backup & Restore ────────────────────────────────
 * Stores the encrypted wallet blob on the server, keyed by credential ID.
 * The blob is AES-GCM encrypted with the passkey rawId — completely
 * safe to store server-side because it cannot be decrypted without
 * biometric authentication on the original device/OS ecosystem.
 *
 * POST /api/passkey/backup   — save encrypted wallet
 * GET  /api/passkey/backup/:credentialId — retrieve backup
 * POST /api/passkey/transfer — generate a short 12-char transfer code
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
    res.status(500).json({ error: "Backup failed" });
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
    res.status(500).json({ error: "Restore failed" });
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
    // Generate a 12-char alphanumeric code using rejection sampling (no modulo bias).
    // Only its SHA-256 digest is stored; the plaintext is returned once.
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
    const threshold = 256 - (256 % chars.length);      // 256 (no remainder, so threshold = 256 → accept all)
    let code = "";
    while (code.length < 12) {
      const buf = randomBytes(16);
      for (let i = 0; i < buf.length && code.length < 12; i++) {
        if (buf[i]! < threshold) code += chars[buf[i]! % chars.length];
      }
    }
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const key = `pk_tc:${codeHash}`;
    const value = JSON.stringify({ credentialId, encryptedKey, iv, address, label: label ?? "Passkey Wallet", expiresAt: Date.now() + 2 * 60 * 1000 });
    await pool.query(
      "DELETE FROM platform_settings WHERE key LIKE 'pk_tc:%' AND updated_at < $1",
      [new Date(Date.now() - 2 * 60 * 1000)],
    );
    await db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ success: true, code });
  } catch (err: any) {
    res.status(500).json({ error: "Transfer code generation failed" });
  }
});

const passkeyTransferRedeemLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many transfer-code attempts. Try again later." },
});

router.post("/passkey/transfer/redeem", passkeyTransferRedeemLimiter, async (req, res) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code)) {
      res.status(400).json({ error: "Enter a valid 12-character transfer code." });
      return;
    }
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const key = `pk_tc:${codeHash}`;
    // Atomic consume: concurrent requests can never redeem the same code twice.
    const { rows } = await pool.query<{ value: string }>(
      `DELETE FROM platform_settings WHERE key = $1 RETURNING value`,
      [key],
    );
    const row = rows[0];
    if (!row) { res.status(404).json({ error: "Code not found or expired" }); return; }
    const data = JSON.parse(row.value);
    if (data.expiresAt && Date.now() > data.expiresAt) {
      res.status(410).json({ error: "Transfer code has expired (2 minute limit)" }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: "Transfer code lookup failed" });
  }
});

// Old codes in URLs can leak through browser history and access logs.
router.get("/passkey/transfer/:code", (_req, res) => {
  res.status(410).json({ error: "Transfer codes are no longer accepted in URLs. Submit the code through the secure redeem request." });
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
const inboundEmailLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/webhook/email-inbound", inboundEmailLimiter, async (req, res) => {
  try {
    const webhookSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
    const suppliedSecret =
      req.header("x-orahdex-webhook-secret") ??
      req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!webhookSecret) {
      res.status(503).json({ error: "Inbound email webhook is not configured." });
      return;
    }
    if (
      typeof suppliedSecret !== "string" ||
      !crypto.timingSafeEqual(
        crypto.createHash("sha256").update(suppliedSecret).digest(),
        crypto.createHash("sha256").update(webhookSecret).digest(),
      )
    ) {
      res.status(401).json({ error: "Invalid inbound email webhook authorization." });
      return;
    }

    const b = req.body as Record<string, any>;

    // Normalise across providers
    const from: string =
      b.sender ?? b.from ?? b.From ?? b.fromAddress ?? b.from_email ?? "unknown@unknown.com";

    const to: string =
      b.recipient ?? b.to ?? b.To ?? b.toAddress ?? b.to_email ?? "inbox@orahdex.com";

    const subject: string =
      b.subject ?? b.Subject ?? "(no subject)";

    // Prefer plain-text body; fall back to HTML variants
    const plainBody: string | undefined =
      b["body-plain"] ?? b.text ?? b.TextBody ?? b.body ?? b.plain;

    const htmlBody: string | undefined =
      b["body-html"] ?? b.html ?? b.HtmlBody;

    // Proper HTML→text converter: skips style/script/head content, adds
    // newlines for block elements. Safe against ReDoS (no regex on input).
    function htmlToPlainText(html: string, max = 50_000): string {
      const SKIP  = new Set(["style","script","head","noscript"]);
      const BLOCK = new Set(["p","div","br","hr","tr","td","th","h1","h2","h3",
                             "h4","h5","h6","li","article","section","header",
                             "footer","blockquote","pre"]);
      let out = "", i = 0, skip = 0;
      const src = html.slice(0, max);
      while (i < src.length) {
        if (src[i] !== "<") { if (!skip) out += src[i]; i++; continue; }
        let j = i + 1, inQ = "";
        while (j < src.length && (src[j] !== ">" || inQ)) {
          if ((src[j] === '"' || src[j] === "'") && !inQ) inQ = src[j];
          else if (src[j] === inQ) inQ = "";
          j++;
        }
        const inner = src.slice(i + 1, j).trim();
        const isClose = inner.startsWith("/");
        const name = (isClose ? inner.slice(1) : inner).split(/[\s/]/)[0].toLowerCase();
        if (!isClose && SKIP.has(name)) skip++;
        else if (isClose && SKIP.has(name) && skip > 0) { skip--; out += "\n"; }
        else if (!skip) out += BLOCK.has(name) ? "\n" : " ";
        i = j + 1;
      }
      return out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Store raw HTML when available so the frontend can render images,
    // branded layouts, and styled verification codes via sandboxed iframe.
    // Fall back to plain text, then "(empty)".
    let storedBody: string;
    if (htmlBody && htmlBody.trim()) {
      storedBody = htmlToPlainText(htmlBody);
    } else if (plainBody && plainBody.trim()) {
      storedBody = plainBody.slice(0, 50_000).trim();
    } else {
      storedBody = "(empty)";
    }

    if (!from || !subject || from.length > 500 || to.length > 500 || subject.length > 2_000) {
      res.status(400).json({ error: "Missing required fields: from, subject" });
      return;
    }

    const [inserted] = await db.insert(adminEmailsTable).values({
      folder: "inbox",
      fromAddress: from,
      toAddress: to,
      subject,
      body: storedBody,
      category: "contact",
      isRead: false,
      isStarred: false,
    }).returning();

    logger.info({ from, to, subject, id: inserted.id }, "Inbound email received via webhook");
    res.json({ success: true, id: inserted.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to process inbound email webhook");
    res.status(500).json({ error: "Failed to process inbound email" });
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

    // Upsert wallet registration
    const inserted = await db.insert(walletsTable)
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
      })
      .returning({ address: walletsTable.address });

    const isNewEntry = inserted.length > 0;

    res.json({ success: true, address: addr, isNew: isNewEntry });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to ping wallet");
    res.status(500).json({ error: "Failed to register wallet" });
  }
});

/**
 * GET /api/notifications?address=0x…&since=<timestamp>
 * Returns latest notifications for a wallet address.
 */
const walletRequestChallengeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/wallet-request/challenge", walletRequestChallengeLimiter, async (req, res) => {
  try {
    const { walletAddress, resource, method, resourceId, context } = req.body ?? {};
    if (
      typeof walletAddress !== "string" ||
      !["withdrawal-history", "notifications", "social-notifications", "personal-api-keys"].includes(resource)
    ) {
      res.status(400).json({ error: "walletAddress and a supported resource are required." });
      return;
    }
    const normalizedMethod = String(method ?? "").toUpperCase();
    const canonicalContext = resource === "personal-api-keys" && normalizedMethod === "POST"
      ? personalApiKeyRequestContext(context)
      : undefined;
    const challenge = await issueWalletRequestChallenge({
      walletAddress,
      resource: resource as WalletRequestResource,
      method: normalizedMethod,
      ...(typeof resourceId === "string" ? { resourceId } : {}),
      ...(canonicalContext ? { context: canonicalContext } : {}),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(challenge);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Could not issue wallet authorization." });
  }
});

router.get("/notifications", async (req, res) => {
  const addr = (req.query.address as string | undefined);
  if (!addr) { res.status(400).json({ error: "address required" }); return; }
  try {
    await verifyWalletRequestProof({
      walletAddress: addr,
      resource: "notifications",
      method: "GET",
      challengeId: req.header("x-wallet-auth-challenge"),
      signature: req.header("x-wallet-auth-signature"),
    });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Wallet authorization failed." });
    return;
  }
  const since = Number(req.query.since ?? 0);
  return res.json({ notifications: getNotifications(addr, since) });
});

/**
 * DELETE /api/notifications?address=0x…
 */
router.delete("/notifications", async (req, res) => {
  const addr = (req.query.address as string | undefined);
  if (!addr) { res.status(400).json({ error: "address required" }); return; }
  try {
    await verifyWalletRequestProof({
      walletAddress: addr,
      resource: "notifications",
      method: "DELETE",
      challengeId: req.header("x-wallet-auth-challenge"),
      signature: req.header("x-wallet-auth-signature"),
    });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Wallet authorization failed." });
    return;
  }
  clearNotifications(addr);
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

router.get("/user/api-keys", async (req, res) => {
  const walletAddress = String(req.query.walletAddress ?? "").trim();
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required." });
    return;
  }
  try {
    await verifyWalletRequestProof({
      walletAddress,
      resource: "personal-api-keys",
      method: "GET",
      challengeId: req.header("x-wallet-auth-challenge"),
      signature: req.header("x-wallet-auth-signature"),
    });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Wallet authorization failed." });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ keys: await listPersonalApiKeys(walletAddress) });
  } catch (err: any) {
    req.log.error({ err }, "personal-api-keys: list failed");
    res.status(503).json({ error: "Personal API keys are temporarily unavailable." });
  }
});

router.post("/user/api-keys", async (req, res) => {
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
  let input;
  try {
    if (!walletAddress) throw new Error("walletAddress is required.");
    input = normalizePersonalApiKeyInput(req.body);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Invalid API key details." });
    return;
  }
  try {
    await verifyWalletRequestProof({
      walletAddress,
      resource: "personal-api-keys",
      method: "POST",
      context: personalApiKeyRequestContext(input),
      challengeId: req.header("x-wallet-auth-challenge"),
      signature: req.header("x-wallet-auth-signature"),
    });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Wallet authorization failed." });
    return;
  }
  try {
    const created = await createPersonalApiKey(walletAddress, input);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ ...created, oneTimeReveal: true });
  } catch (err: any) {
    req.log.error({ err }, "personal-api-keys: create failed");
    if (err instanceof ApiKeyConfigurationError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    res.status(503).json({ error: "Personal API keys are temporarily unavailable." });
  }
});

router.delete("/user/api-keys/:id", async (req, res) => {
  const walletAddress = String(req.query.walletAddress ?? "").trim();
  const id = String(req.params.id ?? "");
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required." });
    return;
  }
  try {
    await verifyWalletRequestProof({
      walletAddress,
      resource: "personal-api-keys",
      method: "DELETE",
      resourceId: id,
      challengeId: req.header("x-wallet-auth-challenge"),
      signature: req.header("x-wallet-auth-signature"),
    });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Wallet authorization failed." });
    return;
  }
  try {
    const revoked = await revokePersonalApiKey(id, walletAddress);
    if (!revoked) {
      res.status(404).json({ error: "API key not found for this wallet." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "personal-api-keys: revoke failed");
    res.status(503).json({ error: "Personal API keys are temporarily unavailable." });
  }
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

/* ─── INTERNAL BSV WALLET (auto-provisioned for EVM users) ──────────────────
 *
 *  GET  /api/user/bsv-wallet?evmAddress=<addr>   — fetch existing address
 *  POST /api/user/bsv-wallet                     — create-or-get (idempotent)
 *
 *  Response: { bsvAddress: string, isNew: boolean }
 *  The private key is NEVER returned to the client.
 * ─────────────────────────────────────────────────────────────────────────── */

router.get("/user/bsv-wallet", async (req, res) => {
  const evmAddress = (req.query.evmAddress as string ?? "").trim();
  if (!evmAddress) { res.status(400).json({ error: "evmAddress required" }); return; }
  try {
    const result = await getBsvWallet(evmAddress);
    if (!result) { res.status(404).json({ error: "No internal BSV wallet provisioned yet" }); return; }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch internal BSV wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user/bsv-wallet", async (req, res) => {
  const { evmAddress, phantomBtcAddress } = req.body as {
    evmAddress?: string;
    phantomBtcAddress?: string;
  };
  if (!evmAddress || typeof evmAddress !== "string" || !evmAddress.trim()) {
    res.status(400).json({ error: "evmAddress required" });
    return;
  }
  try {
    const result = await getOrCreateBsvWallet(
      evmAddress.trim(),
      phantomBtcAddress?.trim() || undefined,
    );
    res.status(result.isNew ? 201 : 200).json(result);
  } catch (err) {
    logger.error({ err }, "Failed to provision internal BSV wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/connect-session — desktop creates a pairing session */
router.post("/connect-session", (_req, res) => {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const session: ConnectSession = { token, status: "pending", createdAt: now, expiresAt: now + SESSION_TTL_MS };
  connectSessions.set(token, session);
  res.json({ token, expiresAt: session.expiresAt });
});

/** GET /api/connect-session/:token — desktop polls for connection */
router.get("/connect-session/:token", (req, res) => {
  const session = connectSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now()) {
    res.status(404).json({ error: "Session not found or expired" }); return;
  }
  res.json({ status: session.status, address: session.address, chain: session.chain, walletType: session.walletType });
});

/** PUT /api/connect-session/:token — mobile submits wallet address */
router.put("/connect-session/:token", (req, res) => {
  const session = connectSessions.get(req.params.token);
  if (!session || session.expiresAt < Date.now()) {
    res.status(404).json({ error: "Session not found or expired" }); return;
  }
  const { address, chain, walletType } = req.body as { address?: string; chain?: string; walletType?: string };
  if (!address) { res.status(400).json({ error: "address is required" }); return; }
  session.status = "connected";
  session.address = address;
  session.chain = chain ?? "BSV";
  session.walletType = walletType ?? "unknown";
  res.json({ success: true });
});

export default router;

