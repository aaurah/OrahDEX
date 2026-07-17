import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

const HANDCASH_APP_ID     = process.env.HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = process.env.HANDCASH_APP_SECRET;

let sdkInstance: any        = null;
let sdkImportAttempted      = false;

async function getSDK(): Promise<any> {
  if (sdkInstance)         return sdkInstance;
  if (sdkImportAttempted)  return null;
  sdkImportAttempted = true;
  if (!HANDCASH_APP_ID || !HANDCASH_APP_SECRET) {
    logger.warn("HandCash: HANDCASH_APP_ID / HANDCASH_APP_SECRET not set");
    return null;
  }
  try {
    const { getInstance } = await import("@handcash/sdk");
    sdkInstance = getInstance({ appId: HANDCASH_APP_ID, appSecret: HANDCASH_APP_SECRET });
    return sdkInstance;
  } catch (err) {
    logger.warn({ err }, "HandCash SDK import failed — is @handcash/sdk installed?");
    return null;
  }
}

// ─── GET /api/handcash/auth-url ───────────────────────────────────────────────
// Returns the HandCash OAuth redirect URL for this app.
router.get("/handcash/auth-url", async (_req, res) => {
  try {
    const sdk = await getSDK();
    if (!sdk) return void res.status(503).json({ error: "HandCash not configured — add HANDCASH_APP_ID and HANDCASH_APP_SECRET" });
    const url = sdk.getRedirectionUrl();
    res.json({ url });
  } catch (err: any) {
    logger.error({ err }, "HandCash auth-url error");
    res.status(500).json({ error: err?.message ?? "Failed to get auth URL" });
  }
});

// ─── GET /api/handcash/profile?authToken=... ─────────────────────────────────
// Returns the connected user's profile (handle, displayName, avatarUrl).
router.get("/handcash/profile", async (req, res) => {
  const { authToken } = req.query;
  if (!authToken || typeof authToken !== "string") {
    return void res.status(400).json({ error: "authToken required" });
  }
  try {
    const sdk = await getSDK();
    if (!sdk) return void res.status(503).json({ error: "HandCash not configured" });
    const { Connect } = await import("@handcash/sdk");
    const client  = sdk.getAccountClient(authToken);
    const result  = await Connect.getCurrentUserProfile({ client });
    const pub     = (result as any)?.data?.publicProfile ?? {};
    res.json({
      handle:      pub.handle      ?? "",
      displayName: pub.displayName ?? pub.handle ?? "",
      avatarUrl:   pub.avatarUrl   ?? null,
      paymail:     `${pub.handle}@handcash.io`,
    });
  } catch (err: any) {
    logger.error({ err }, "HandCash profile error");
    res.status(400).json({ error: err?.message ?? "Failed to get profile" });
  }
});

// ─── GET /api/handcash/balance?authToken=... ─────────────────────────────────
// Returns the user's spendable BSV balance.
router.get("/handcash/balance", async (req, res) => {
  const { authToken } = req.query;
  if (!authToken || typeof authToken !== "string") {
    return void res.status(400).json({ error: "authToken required" });
  }
  try {
    const sdk = await getSDK();
    if (!sdk) return void res.status(503).json({ error: "HandCash not configured" });
    const { Connect } = await import("@handcash/sdk");
    const client  = sdk.getAccountClient(authToken);
    const result  = await Connect.getSpendableBalances({ client });
    const items   = (result as any)?.data?.items ?? [];
    const bsvItem = items.find((i: any) => i.currencyCode === "BSV");
    res.json({ bsv: bsvItem?.amount ?? 0, items });
  } catch (err: any) {
    logger.error({ err }, "HandCash balance error");
    res.status(400).json({ error: err?.message ?? "Failed to get balance" });
  }
});

// ─── POST /api/handcash/pay ───────────────────────────────────────────────────
// Send BSV from the connected HandCash wallet to any handle or BSV address.
// Body: { authToken, destination, amount, currencyCode? }
router.post("/handcash/pay", async (req, res) => {
  const { authToken, destination, amount, currencyCode = "BSV" } = req.body ?? {};
  if (!authToken || !destination || !amount) {
    return void res.status(400).json({ error: "authToken, destination, and amount are required" });
  }
  const parsedAmt = parseFloat(amount);
  if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
    return void res.status(400).json({ error: "amount must be a positive number" });
  }
  try {
    const sdk = await getSDK();
    if (!sdk) return void res.status(503).json({ error: "HandCash not configured" });
    const { Connect } = await import("@handcash/sdk");
    const client = sdk.getAccountClient(authToken);
    const result = await Connect.pay({
      client,
      body: {
        instrumentCurrencyCode:     "BSV",
        denominationCurrencyCode:   currencyCode,
        receivers: [{ sendAmount: parsedAmt, destination }],
      },
    } as any);
    const txid = (result as any)?.data?.transactionId ?? "submitted";
    res.json({ txid, status: "success" });
  } catch (err: any) {
    logger.error({ err }, "HandCash pay error");
    res.status(400).json({ error: err?.message ?? "Payment failed" });
  }
});

// ─── GET /api/handcash/resolve-handle?handle=... ─────────────────────────────
// Resolve a $handle to its public BSV address (no auth required).
router.get("/handcash/resolve-handle", async (req, res) => {
  const { handle } = req.query;
  if (!handle || typeof handle !== "string") {
    return void res.status(400).json({ error: "handle required" });
  }
  const raw = handle.trim().replace(/^\$/, "");
  try {
    const apiRes = await fetch(
      `https://api.handcash.io/api/users/public-data?alias=${encodeURIComponent(raw)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000) },
    );
    if (!apiRes.ok) {
      return void res.status(404).json({ error: `Handle $${raw} not found` });
    }
    const data: any    = await apiRes.json();
    const pub          = data?.publicProfile ?? {};
    res.json({
      handle:      raw,
      address:     pub.receivingAddress ?? null,
      paymail:     pub.paymail          ?? `${raw}@handcash.io`,
      avatarUrl:   pub.avatarUrl        ?? null,
      displayName: pub.displayName      ?? raw,
    });
  } catch (err: any) {
    logger.error({ err }, "HandCash resolve-handle error");
    res.status(500).json({ error: err?.message ?? "Resolution failed" });
  }
});

export default router;
