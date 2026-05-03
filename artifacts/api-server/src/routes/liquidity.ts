/**
 * liquidity.ts — LP add/remove with proper ledger accounting.
 *
 * Rules (from the ledger design doc):
 *  - LP value is NOT added back to user_balances (no double-counting)
 *  - LP is tracked in liquidity_positions only
 *  - /portfolio shows LP under defi.lpPositions as a separate field
 *
 * Auth model:
 *  EVM wallets (0x…) MUST sign a server-issued challenge before POST or
 *  DELETE so an attacker who learns a wallet address cannot drain or open
 *  positions on its behalf. Non-EVM (BSV, Solana, internal-only) wallets
 *  cannot produce an EVM personal_sign, so they fall through to the
 *  per-wallet ledger guard. Off-curve / unrecognised addresses are rejected.
 */

import { Router, type IRouter } from "express";
import {
  addLiquidity,
  removeLiquidity,
  getLpPositions,
} from "../lib/ledger.js";
import {
  issueLiquidityChallenge,
  verifyLiquiditySignature,
} from "../lib/walletAuth.js";
import { isInternalEvmWallet } from "../lib/internalEvmWallet.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Whitelist of asset symbols the ledger may book. Mirrors the spot universe
// + the on-chain bridges we actually settle. Add new tokens here, not via
// arbitrary user input.
const ASSET_WHITELIST = new Set<string>([
  "BTC","ETH","BSV","USDT","USDC","DAI","WBTC","WETH",
  "BNB","SOL","XRP","ADA","DOGE","DOT","LINK","TRX","BTT","WIN","JST","ORAH",
]);

const MAX_AMOUNT = 1e12;   // sanity cap; well above any realistic LP deposit
const MAX_PCT    = 100;

function isEvmAddress(s: unknown): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function isFiniteNumber(s: unknown): s is number | string {
  if (typeof s === "number") return Number.isFinite(s);
  if (typeof s !== "string" || s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

function asAmount(v: unknown, label: string): number {
  if (!isFiniteNumber(v)) throw new Error(`${label} must be a finite number`);
  const n = typeof v === "number" ? v : Number(v);
  if (n <= 0)            throw new Error(`${label} must be > 0`);
  if (n > MAX_AMOUNT)    throw new Error(`${label} exceeds max ${MAX_AMOUNT}`);
  return n;
}

function asAsset(v: unknown, label: string): string {
  if (typeof v !== "string" || !v) throw new Error(`${label} is required`);
  const sym = v.toUpperCase();
  if (!ASSET_WHITELIST.has(sym))   throw new Error(`${label} '${sym}' is not a supported asset`);
  return sym;
}

// ── POST /liquidity/challenge ──────────────────────────────────────────────────
// Body: { walletAddress, action: "add"|"remove", poolId }
router.post("/liquidity/challenge", (req, res) => {
  const { walletAddress, action, poolId } = (req.body ?? {}) as {
    walletAddress?: string; action?: string; poolId?: string;
  };
  if (!isEvmAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be an EVM (0x…) address" });
    return;
  }
  if (action !== "add" && action !== "remove") {
    res.status(400).json({ error: "action must be 'add' or 'remove'" });
    return;
  }
  if (typeof poolId !== "string" || !poolId) {
    res.status(400).json({ error: "poolId is required" });
    return;
  }
  const challenge = issueLiquidityChallenge({ walletAddress, action, poolId });
  res.json(challenge);
});

// ── GET /liquidity ─────────────────────────────────────────────────────────────
router.get("/liquidity", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  try {
    const positions = await getLpPositions(walletAddress);
    res.json({ walletAddress, positions });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LP positions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /liquidity ────────────────────────────────────────────────────────────
// Body: { walletAddress, assetA, assetB, amountA, amountB, nonce?, signature? }
// EVM wallets MUST include nonce + signature (from /liquidity/challenge).
router.post("/liquidity", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const walletAddress = body.walletAddress;

  if (typeof walletAddress !== "string" || !walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  let assetA: string, assetB: string, amountA: number, amountB: number;
  try {
    assetA  = asAsset(body.assetA, "assetA");
    assetB  = asAsset(body.assetB, "assetB");
    amountA = asAmount(body.amountA, "amountA");
    amountB = asAmount(body.amountB, "amountB");
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Invalid input" });
    return;
  }
  if (assetA === assetB) {
    res.status(400).json({ error: "assetA and assetB must differ" });
    return;
  }

  const poolId = [assetA, assetB].sort().join("-");

  // External EVM wallets MUST produce a fresh signature bound to (action, pool)
  // so an attacker who learns the address cannot deposit/drain. Internal EVM
  // wallets are server-provisioned (rows in internal_evm_wallets) and have no
  // off-server signing surface — we recognise them via the registry and skip
  // the sig check. Anything that looks like an EVM address but is NOT in the
  // registry is treated as external and rejected without a valid signature.
  if (isEvmAddress(walletAddress)) {
    const nonce     = typeof body.nonce     === "string" ? body.nonce     : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const internal  = await isInternalEvmWallet(walletAddress);

    if (!internal) {
      if (!nonce || !signature) {
        // Re-check the registry once to close the TOCTOU race where the
        // wallet was provisioned in another request between our first check
        // and now — we don't want to spuriously 401 a freshly-created
        // internal wallet under concurrent provisioning.
        const recheck = await isInternalEvmWallet(walletAddress);
        if (recheck) {
          // Promote to internal, fall through to the no-sig-required path.
        } else {
          res.status(401).json({
            error: "Signed challenge required for external EVM wallets. " +
                   "Call POST /liquidity/challenge first.",
          });
          return;
        }
      } else {
        try {
          verifyLiquiditySignature({ walletAddress, nonce, signature, action: "add", poolId });
        } catch (err: any) {
          res.status(401).json({ error: err?.message ?? "Invalid signature" });
          return;
        }
      }
    } else if (signature) {
      // Internal wallet but caller still supplied a sig — verify strictly.

      try {
        verifyLiquiditySignature({ walletAddress, nonce, signature, action: "add", poolId });
      } catch (err: any) {
        res.status(401).json({ error: err?.message ?? "Invalid signature" });
        return;
      }
    } else if (signature) {
      // Internal wallet but caller still supplied a sig — verify strictly so
      // a forged sig can't masquerade as a valid one for audit purposes.
      try {
        verifyLiquiditySignature({ walletAddress, nonce, signature, action: "add", poolId });
      } catch (err: any) {
        res.status(401).json({ error: err?.message ?? "Invalid signature" });
        return;
      }
    }
  }

  try {
    const result = await addLiquidity({
      walletAddress,
      poolId,
      assetA,
      assetB,
      amountA: amountA.toString(),
      amountB: amountB.toString(),
    });

    req.log.info({ walletAddress, poolId, amountA, amountB, lpTokens: result.lpTokens }, "LP added");
    res.status(201).json({
      positionId: result.positionId,
      poolId,
      assetA,
      assetB,
      amountA,
      amountB,
      lpTokens:  result.lpTokens,
      status:    "active",
    });
  } catch (err: any) {
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      const asset = err.message.split(":")[1] ?? "unknown";
      res.status(422).json({ error: "Insufficient balance", asset });
      return;
    }
    req.log.error({ err }, "Failed to add liquidity");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /liquidity/:positionId ──────────────────────────────────────────────
// Body: { walletAddress, nonce?, signature? } — same auth rules as POST.
router.delete("/liquidity/:positionId", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const walletAddress = body.walletAddress;
  const positionId    = parseInt(req.params.positionId, 10);

  if (typeof walletAddress !== "string" || !walletAddress || !Number.isInteger(positionId) || positionId <= 0) {
    res.status(400).json({ error: "walletAddress and a valid positionId are required" });
    return;
  }

  if (isEvmAddress(walletAddress)) {
    const nonce     = typeof body.nonce     === "string" ? body.nonce     : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const internal  = await isInternalEvmWallet(walletAddress);

    let needsSig = !internal;
    if (needsSig && (!nonce || !signature)) {
      // Same TOCTOU re-check as POST /liquidity: a wallet could have been
      // provisioned concurrently after our first check.
      const recheck = await isInternalEvmWallet(walletAddress);
      if (recheck) {
        needsSig = false;
      } else {
        res.status(401).json({
          error: "Signed challenge required for external EVM wallets. " +
                 "Call POST /liquidity/challenge first.",
        });
        return;
      }
    }

    if (signature) {
      // Bind the challenge to the position's actual poolId so a remove-
      // challenge for pool A cannot authorise a remove on pool B.
      let resolvedPool = "";
      try {
        const { rows } = await pool.query<{ pool_id: string }>(
          "SELECT pool_id FROM liquidity_positions WHERE id = $1 AND wallet_address = $2",
          [positionId, walletAddress],
        );
        resolvedPool = rows[0]?.pool_id ?? "";
      } catch (err) {
        req.log.error({ err }, "Failed to resolve poolId for liquidity remove");
      }
      if (!resolvedPool) {
        res.status(404).json({ error: "Position not found or already removed" });
        return;
      }
      try {
        verifyLiquiditySignature({
          walletAddress, nonce, signature, action: "remove", poolId: resolvedPool,
        });
      } catch (err: any) {
        res.status(401).json({ error: err?.message ?? "Invalid signature" });
        return;
      }
    }
  }

  try {
    const result = await removeLiquidity({ walletAddress, positionId });
    req.log.info({ walletAddress, positionId }, "LP removed");
    res.json({
      positionId,
      status:  "removed",
      returned: { [result.assetA]: result.amountA, [result.assetB]: result.amountB },
    });
  } catch (err: any) {
    if (err?.message === "POSITION_NOT_FOUND") {
      res.status(404).json({ error: "Position not found or already removed" });
      return;
    }
    req.log.error({ err }, "Failed to remove liquidity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { MAX_AMOUNT as LIQUIDITY_MAX_AMOUNT };
export default router;
