/**
 * CEX Exchange Account Management
 *
 * Stores encrypted API credentials for CEX venues (Binance, Bybit, OKX, etc.)
 * so the hybrid router can pull orderbook liquidity alongside the on-chain AMM.
 *
 * Encryption: AES-256-GCM with a key derived from DATABASE_URL.
 * Keys are NEVER returned in plaintext after storage.
 */

import { Router } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { cexAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Encryption helpers ─────────────────────────────────────────────────────
// Key MUST be supplied via the CEX_ENCRYPT_KEY environment variable.
// Falling back to DATABASE_URL or a hardcoded string is explicitly prohibited:
// both are observable by anyone with container/DB access and would expose all
// stored CEX API credentials.
// If the key is absent the module still loads (so other admin routes keep
// working) but any encrypt/decrypt operation returns a 503.
const ENCRYPT_KEY: Buffer | null = (() => {
  const raw = process.env.CEX_ENCRYPT_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
})();

function requireEncryptKey(): Buffer {
  if (!ENCRYPT_KEY) {
    throw new Error(
      "CEX_ENCRYPT_KEY is not configured. " +
      "Set this environment secret before using CEX account management.",
    );
  }
  return ENCRYPT_KEY;
}

function encrypt(plain: string): string {
  const key = requireEncryptKey();
  const iv  = crypto.randomBytes(12);
  const cip = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cip.update(plain, "utf8"), cip.final()]);
  const tag = cip.getAuthTag();
  // iv(12) | tag(16) | ciphertext — base64-encoded
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(b64: string): string {
  const key = requireEncryptKey();
  const buf = Buffer.from(b64, "base64");
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const dec = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString("utf8");
}

function maskKey(enc: string): string {
  try {
    const plain = decrypt(enc);
    if (plain.length <= 8) return "••••••••";
    return plain.slice(0, 4) + "••••••••••••" + plain.slice(-4);
  } catch {
    return "••••••••••••";
  }
}

// ── Serialise a row for the API (never include raw keys) ──────────────────
function serializeAccount(row: typeof cexAccountsTable.$inferSelect) {
  return {
    id:             row.id,
    exchange:       row.exchange,
    label:          row.label,
    apiKeyMasked:   maskKey(row.apiKeyEnc),
    hasPassphrase:  !!row.passphraseEnc,
    status:         row.status,
    enabled:        row.enabled,
    permissions:    row.permissions,
    lastTestedAt:   row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    createdAt:      row.createdAt,
  };
}

// ── Exchange metadata ──────────────────────────────────────────────────────
const EXCHANGE_META: Record<string, {
  name: string; color: string; logo: string;
  needsPassphrase: boolean;
  testUrl: string;      // public endpoint just to verify network
  docsUrl: string;
  features: string[];
}> = {
  binance: {
    name: "Binance", color: "#F3BA2F", logo: "B",
    needsPassphrase: false,
    testUrl: "https://api.binance.com/api/v3/ping",
    docsUrl: "https://binance-docs.github.io/apidocs/spot/en/",
    features: ["Spot", "Futures", "Margin", "Deep Liquidity"],
  },
  bybit: {
    name: "Bybit", color: "#F7A600", logo: "Y",
    needsPassphrase: false,
    testUrl: "https://api.bybit.com/v5/market/time",
    docsUrl: "https://bybit-exchange.github.io/docs/",
    features: ["Spot", "Perpetuals", "Options", "Copy Trading"],
  },
  okx: {
    name: "OKX", color: "#1E9AFF", logo: "O",
    needsPassphrase: true,
    testUrl: "https://www.okx.com/api/v5/public/time",
    docsUrl: "https://www.okx.com/docs-v5/en/",
    features: ["Spot", "Futures", "DeFi", "Options"],
  },
  coinbase: {
    name: "Coinbase Advanced", color: "#1652F0", logo: "C",
    needsPassphrase: false,
    testUrl: "https://api.coinbase.com/api/v3/brokerage/products?limit=1",
    docsUrl: "https://docs.cdp.coinbase.com/advanced-trade/docs/",
    features: ["Spot", "USD Pairs", "Institutional"],
  },
  kraken: {
    name: "Kraken", color: "#5741D9", logo: "K",
    needsPassphrase: false,
    testUrl: "https://api.kraken.com/0/public/Time",
    docsUrl: "https://docs.kraken.com/api/",
    features: ["Spot", "Futures", "Staking"],
  },
  kucoin: {
    name: "KuCoin", color: "#26A17B", logo: "K",
    needsPassphrase: true,
    testUrl: "https://api.kucoin.com/api/v1/timestamp",
    docsUrl: "https://docs.kucoin.com/",
    features: ["Spot", "Futures", "Margin"],
  },
  gateio: {
    name: "Gate.io", color: "#E40C5B", logo: "G",
    needsPassphrase: false,
    testUrl: "https://api.gateio.ws/api/v4/spot/time",
    docsUrl: "https://www.gate.io/docs/developers/apiv4/",
    features: ["Spot", "Perpetuals", "Options", "Altcoins"],
  },
  mexc: {
    name: "MEXC", color: "#02C076", logo: "M",
    needsPassphrase: false,
    testUrl: "https://api.mexc.com/api/v3/ping",
    docsUrl: "https://mexcdevelop.github.io/apidocs/",
    features: ["Spot", "Futures", "New Listings"],
  },
};

// ── GET /admin/cex-accounts — list all connected exchanges ────────────────
router.get("/cex-accounts", async (_req, res) => {
  try {
    const rows = await db.select().from(cexAccountsTable).orderBy(cexAccountsTable.createdAt);
    res.json({
      accounts:  rows.map(serializeAccount),
      exchanges: EXCHANGE_META,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to list CEX accounts");
    res.status(500).json({ error: "Failed to list CEX accounts" });
  }
});

// ── POST /admin/cex-accounts — add new exchange connection ────────────────
router.post("/cex-accounts", async (req, res) => {
  if (!ENCRYPT_KEY) {
    res.status(503).json({ error: "CEX_ENCRYPT_KEY is not configured. Set this environment secret to enable CEX account management." });
    return;
  }
  try {
    const { exchange, label, apiKey, apiSecret, passphrase } = req.body as {
      exchange?: string;
      label?: string;
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
    };

    if (!exchange || !label || !apiKey || !apiSecret) {
      res.status(400).json({ error: "exchange, label, apiKey, and apiSecret are required" });
      return;
    }

    if (!EXCHANGE_META[exchange]) {
      res.status(400).json({ error: `Unknown exchange: ${exchange}` });
      return;
    }

    const meta = EXCHANGE_META[exchange];
    if (meta.needsPassphrase && !passphrase) {
      res.status(400).json({ error: `${meta.name} requires a passphrase` });
      return;
    }

    const [row] = await db.insert(cexAccountsTable).values({
      exchange,
      label:           label.trim(),
      apiKeyEnc:       encrypt(apiKey.trim()),
      apiSecretEnc:    encrypt(apiSecret.trim()),
      passphraseEnc:   passphrase ? encrypt(passphrase.trim()) : null,
      status:          "untested",
      enabled:         true,
      permissions:     { spot: true, futures: true, withdraw: false },
    }).returning();

    logger.info({ id: row.id, exchange, label }, "CEX account added");
    res.status(201).json(serializeAccount(row));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to add CEX account");
    res.status(500).json({ error: "Failed to add CEX account" });
  }
});

// ── PUT /admin/cex-accounts/:id — update label / permissions / enabled ────
router.put("/cex-accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { label, enabled, permissions } = req.body as {
      label?: string; enabled?: boolean; permissions?: any;
    };

    const updates: Partial<typeof cexAccountsTable.$inferInsert> = {};
    if (label !== undefined)       updates.label       = label.trim();
    if (enabled !== undefined)     updates.enabled     = enabled;
    if (permissions !== undefined) updates.permissions = permissions;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [row] = await db.update(cexAccountsTable).set(updates)
      .where(eq(cexAccountsTable.id, id)).returning();

    if (!row) { res.status(404).json({ error: "Account not found" }); return; }
    res.json(serializeAccount(row));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to update CEX account");
    res.status(500).json({ error: "Failed to update CEX account" });
  }
});

// ── DELETE /admin/cex-accounts/:id — remove connection ────────────────────
router.delete("/cex-accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(cexAccountsTable).where(eq(cexAccountsTable.id, id));
    logger.info({ id }, "CEX account removed");
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to delete CEX account");
    res.status(500).json({ error: "Failed to delete CEX account" });
  }
});

// ── POST /admin/cex-accounts/:id/test — test connectivity ─────────────────
router.post("/cex-accounts/:id/test", async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const row = await db.select().from(cexAccountsTable).where(eq(cexAccountsTable.id, id)).limit(1);
    if (!row[0]) { res.status(404).json({ error: "Account not found" }); return; }

    const account  = row[0];
    const meta     = EXCHANGE_META[account.exchange];
    let   status: "active" | "error" = "error";
    let   result   = "";

    // Step 1 — Check network reachability (public endpoint)
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(meta.testUrl, {
        signal: ctrl.signal,
        headers: { "User-Agent": "OrahDEX-HybridRouter/1.0" },
      });
      clearTimeout(timer);

      if (r.ok) {
        // Step 2 — Validate key format (lightweight)
        const apiKey = decrypt(account.apiKeyEnc);
        const apiSecret = decrypt(account.apiSecretEnc);

        if (apiKey.length < 8 || apiSecret.length < 8) {
          result = "Stored credentials appear too short — please re-enter";
          status = "error";
        } else {
          // Exchange-specific signed ping
          if (account.exchange === "binance") {
            const ts    = Date.now();
            const query = `timestamp=${ts}`;
            const sig   = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
            const ar    = await fetch(
              `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
              { headers: { "X-MBX-APIKEY": apiKey }, signal: new AbortController().signal }
            ).catch(() => null);
            if (ar && ar.ok) {
              const data = await ar.json() as any;
              const perms = (data.permissions ?? []) as string[];
              result = `✓ Binance account verified · Permissions: ${perms.join(", ") || "none"}`;
              // Update permissions in DB
              await db.update(cexAccountsTable).set({
                permissions: {
                  spot:    perms.includes("SPOT"),
                  futures: perms.includes("FUTURES"),
                  withdraw: perms.includes("WITHDRAWAL"),
                },
              }).where(eq(cexAccountsTable.id, id));
              status = "active";
            } else {
              const errBody = ar ? await ar.text().catch(() => "") : "";
              result = `Binance auth failed: ${errBody.slice(0, 120) || "check API key & IP whitelist"}`;
            }
          } else if (account.exchange === "bybit") {
            const ts  = Date.now().toString();
            const str = ts + apiKey + "5000";
            const sig = crypto.createHmac("sha256", apiSecret).update(str).digest("hex");
            const ar  = await fetch("https://api.bybit.com/v5/account/info", {
              headers: {
                "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": ts,
                "X-BAPI-SIGN": sig, "X-BAPI-RECV-WINDOW": "5000",
              },
              signal: new AbortController().signal,
            }).catch(() => null);
            if (ar && ar.ok) {
              const data = await ar.json() as any;
              if (data.retCode === 0) {
                result = `✓ Bybit account verified · UID: ${data.result?.uid ?? "—"}`;
                status = "active";
              } else {
                result = `Bybit error: ${data.retMsg ?? "auth failed"}`;
              }
            } else {
              result = "Bybit auth failed — check API key & permissions";
            }
          } else if (account.exchange === "okx") {
            const passphrase = account.passphraseEnc ? decrypt(account.passphraseEnc) : "";
            const ts    = new Date().toISOString();
            const method = "GET";
            const path  = "/api/v5/account/balance";
            const prehash = ts + method + path;
            const sig   = crypto.createHmac("sha256", apiSecret).update(prehash).digest("base64");
            const ar    = await fetch(`https://www.okx.com${path}`, {
              headers: {
                "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": sig,
                "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase,
                "x-simulated-trading": "0",
              },
              signal: new AbortController().signal,
            }).catch(() => null);
            if (ar && ar.ok) {
              const data = await ar.json() as any;
              if (data.code === "0") {
                result = "✓ OKX account verified";
                status = "active";
              } else {
                result = `OKX error: ${data.msg ?? "auth failed"}`;
              }
            } else {
              result = "OKX auth failed — check API key & passphrase";
            }
          } else {
            // Generic — just confirm network reachability
            result = `✓ ${meta.name} network reachable · Key format OK · Full auth requires exchange-specific setup`;
            status = "active";
          }
        }
      } else {
        result = `${meta.name} API unreachable (HTTP ${r.status})`;
      }
    } catch (fetchErr: any) {
      result = `Network error: ${fetchErr?.message ?? "timeout"}`;
    }

    // Persist test result
    await db.update(cexAccountsTable).set({
      status, lastTestedAt: new Date(), lastTestResult: result,
    }).where(eq(cexAccountsTable.id, id));

    logger.info({ id, status, result }, "CEX account tested");
    res.json({ success: true, status, result });
  } catch (err: any) {
    logger.error({ err: err?.message }, "CEX account test failed");
    res.status(500).json({ error: "Test failed" });
  }
});

// ── GET /admin/cex-accounts/quote — live quote comparison ─────────────────
// Compare CEX best bid/ask vs internal AMM price for a given symbol
router.get("/cex-accounts/quote", async (req, res) => {
  try {
    const symbol = (req.query.symbol as string ?? "BTCUSDT").toUpperCase();
    const quotes: Record<string, any> = {};

    // Fetch Binance ticker (public, no auth needed)
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`, { signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json() as any;
        quotes.binance = {
          exchange: "Binance", bid: parseFloat(d.bidPrice), ask: parseFloat(d.askPrice),
          spread: ((parseFloat(d.askPrice) - parseFloat(d.bidPrice)) / parseFloat(d.askPrice) * 100).toFixed(4),
          source: "CEX",
        };
      }
    } catch { /* skip */ }

    // Fetch Bybit ticker (public)
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`, { signal: ctrl.signal });
      if (r.ok) {
        const d = await r.json() as any;
        const t = d.result?.list?.[0];
        if (t) {
          quotes.bybit = {
            exchange: "Bybit", bid: parseFloat(t.bid1Price), ask: parseFloat(t.ask1Price),
            spread: ((parseFloat(t.ask1Price) - parseFloat(t.bid1Price)) / parseFloat(t.ask1Price) * 100).toFixed(4),
            source: "CEX",
          };
        }
      }
    } catch { /* skip */ }

    res.json({ symbol, quotes });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

export default router;
