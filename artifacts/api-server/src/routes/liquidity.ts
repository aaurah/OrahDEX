/**
 * liquidity.ts — LP add/remove with proper ledger accounting.
 *
 * Rules (from the ledger design doc):
 *  - LP value is NOT added back to user_balances (no double-counting)
 *  - LP is tracked in liquidity_positions only
 *  - /portfolio shows LP under defi.lpPositions as a separate field
 */

import { Router, type IRouter } from "express";
import {
  addLiquidity,
  removeLiquidity,
  getLpPositions,
} from "../lib/ledger.js";

const router: IRouter = Router();

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
// Body: { walletAddress, assetA, assetB, amountA, amountB }
// Deducts both assets from available and records the LP position.
router.post("/liquidity", async (req, res) => {
  const { walletAddress, assetA, assetB, amountA, amountB } = req.body ?? {};
  if (!walletAddress || !assetA || !assetB || !amountA || !amountB) {
    res.status(400).json({ error: "walletAddress, assetA, assetB, amountA, amountB are required" });
    return;
  }

  const poolId = [assetA, assetB].sort().join("-");

  try {
    const result = await addLiquidity({
      walletAddress,
      poolId,
      assetA:  assetA.toUpperCase(),
      assetB:  assetB.toUpperCase(),
      amountA: parseFloat(amountA).toString(),
      amountB: parseFloat(amountB).toString(),
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
// Returns both assets to the user's available balance.
router.delete("/liquidity/:positionId", async (req, res) => {
  const { walletAddress } = req.body ?? {};
  const positionId = parseInt(req.params.positionId);

  if (!walletAddress || isNaN(positionId)) {
    res.status(400).json({ error: "walletAddress and valid positionId are required" });
    return;
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

export default router;
