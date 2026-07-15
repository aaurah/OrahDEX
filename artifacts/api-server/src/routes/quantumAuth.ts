/**
 * quantumAuth.ts — Quantum-resistant key registration and status endpoints.
 *
 * Implements a forward-compatible CRYSTALS-Dilithium2 public key registry.
 * Ownership of the walletAddress is proven via an existing EVM ECDSA signature
 * over the dilithiumPublicKey. The dilithium public key itself is stored as a
 * commitment for future post-quantum authentication schemes.
 *
 * POST /auth/quantum/register
 *   Body: { walletAddress, dilithiumPublicKey (hex), signature (EVM personal_sign of dilithiumPublicKey) }
 *   Returns: { registered: boolean, algorithm: string }
 *
 * GET  /auth/quantum/status?walletAddress=
 *   Returns: { hasQuantumKey: boolean, algorithm: string | null, registeredAt: Date | null }
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { quantumKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { verifyEvmSignature } from "../lib/walletAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

const DILITHIUM_ALGORITHM = "CRYSTALS-Dilithium2";

// ── POST /auth/quantum/register ───────────────────────────────────────────────

router.post("/auth/quantum/register", async (req, res) => {
  try {
    const { walletAddress, dilithiumPublicKey, signature } = req.body as {
      walletAddress?:      string;
      dilithiumPublicKey?: string;
      signature?:          string;
    };

    if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.trim()) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "walletAddress must be a valid EVM address (0x followed by 40 hex characters)" });
      return;
    }
    if (!dilithiumPublicKey || typeof dilithiumPublicKey !== "string" || !dilithiumPublicKey.trim()) {
      res.status(400).json({ error: "dilithiumPublicKey (hex) is required" });
      return;
    }
    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "signature (ECDSA personal_sign of dilithiumPublicKey) is required" });
      return;
    }

    // Validate dilithiumPublicKey is a valid hex string
    if (!/^[0-9a-fA-F]+$/.test(dilithiumPublicKey)) {
      res.status(400).json({ error: "dilithiumPublicKey must be a hex-encoded string" });
      return;
    }

    // Dilithium2 public keys are 1312 bytes (2624 hex chars). Accept any non-trivial
    // hex length for forward compatibility (minimum 64 chars / 32 bytes).
    if (dilithiumPublicKey.length < 64) {
      res.status(400).json({ error: "dilithiumPublicKey is too short (minimum 32 bytes / 64 hex chars)" });
      return;
    }
    // Dilithium2 public keys are 1312 bytes (2624 hex chars). Cap at 4096 to
    // prevent oversized payloads from being hashed and written to the DB.
    if (dilithiumPublicKey.length > 4096) {
      res.status(400).json({ error: "dilithiumPublicKey exceeds maximum allowed length" });
      return;
    }

    // Verify ECDSA ownership: the user must sign the dilithiumPublicKey with their EVM wallet
    // The message signed is the raw hex string of the Dilithium public key.
    const message = `OrahDEX Quantum Key Registration\n\nWallet: ${walletAddress}\nDilithium2 Public Key: ${dilithiumPublicKey}`;
    try {
      verifyEvmSignature(walletAddress, message, signature);
    } catch (sigErr) {
      logger.warn({ walletAddress, err: sigErr instanceof Error ? sigErr.message : String(sigErr) }, "Quantum key registration: ECDSA verification failed");
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    const addr = walletAddress.toLowerCase();

    // Upsert: one quantum key per wallet address
    await db
      .insert(quantumKeysTable)
      .values({
        id:            randomUUID(),
        walletAddress: addr,
        publicKey:     dilithiumPublicKey,
        algorithm:     "dilithium2",
      })
      .onConflictDoUpdate({
        target:       quantumKeysTable.walletAddress,
        set: {
          publicKey:  dilithiumPublicKey,
          algorithm:  "dilithium2",
          createdAt:  new Date(),
        },
      });

    logger.info({ walletAddress: addr }, "Quantum key registered");

    res.status(201).json({
      registered: true,
      walletAddress: addr,
      algorithm:  DILITHIUM_ALGORITHM,
    });
  } catch (err) {
    logger.error({ err }, "POST /auth/quantum/register failed");
    res.status(500).json({ error: "Failed to register quantum key" });
  }
});

// ── GET /auth/quantum/status ──────────────────────────────────────────────────

router.get("/auth/quantum/status", async (req, res) => {
  try {
    const walletAddress = (req.query.walletAddress as string ?? "").trim();

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const addr = walletAddress.toLowerCase();
    const [row] = await db
      .select()
      .from(quantumKeysTable)
      .where(eq(quantumKeysTable.walletAddress, addr))
      .limit(1);

    if (!row) {
      res.json({
        walletAddress: addr,
        hasQuantumKey: false,
        algorithm:     null,
        registeredAt:  null,
      });
      return;
    }

    res.json({
      walletAddress: addr,
      hasQuantumKey: true,
      algorithm:     DILITHIUM_ALGORITHM,
      registeredAt:  row.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "GET /auth/quantum/status failed");
    res.status(500).json({ error: "Failed to fetch quantum key status" });
  }
});

export default router;
