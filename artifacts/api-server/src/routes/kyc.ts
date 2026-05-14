import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Create kyc_verifications table if needed ────────────────────────────── */
async function ensureKycTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_verifications (
      id TEXT PRIMARY KEY,
      wallet_address TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      nationality TEXT NOT NULL,
      country_of_residence TEXT NOT NULL,
      id_type TEXT NOT NULL,
      id_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
ensureKycTable().catch(e =>
  logger.warn({ err: e?.message }, "kyc_verifications table setup failed (non-fatal)")
);

/* ── GET /api/kyc/status?walletAddress= ──────────────────────────────────── */
router.get("/kyc/status", async (req, res) => {
  const { walletAddress } = req.query;
  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress query param required" });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT id, status, first_name, last_name, submitted_at
       FROM kyc_verifications WHERE wallet_address = $1 LIMIT 1`,
      [walletAddress.toLowerCase()]
    );
    if (result.rows.length === 0) {
      res.json({ verified: false, status: "not_submitted" });
      return;
    }
    const row = result.rows[0];
    res.json({
      verified: row.status === "approved",
      status: row.status,
      firstName: row.first_name,
      lastName: row.last_name,
      submittedAt: row.submitted_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to check KYC status" });
  }
});

/* ── POST /api/kyc/submit ────────────────────────────────────────────────── */
router.post("/kyc/submit", async (req, res) => {
  const {
    walletAddress, firstName, lastName, dateOfBirth,
    nationality, countryOfResidence, idType, idNumber,
  } = req.body as {
    walletAddress?: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    nationality?: string;
    countryOfResidence?: string;
    idType?: string;
    idNumber?: string;
  };

  if (!walletAddress || walletAddress.trim().length < 10) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!firstName?.trim() || !lastName?.trim()) {
    res.status(400).json({ error: "First and last name are required" });
    return;
  }
  if (!dateOfBirth) {
    res.status(400).json({ error: "Date of birth is required" });
    return;
  }
  const dob = new Date(dateOfBirth);
  const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (age < 18) {
    res.status(400).json({ error: "You must be 18 or older to purchase crypto" });
    return;
  }
  if (!nationality?.trim() || !countryOfResidence?.trim()) {
    res.status(400).json({ error: "Nationality and country of residence are required" });
    return;
  }
  if (!idType) {
    res.status(400).json({ error: "ID type is required" });
    return;
  }
  if (!idNumber?.trim() || idNumber.trim().length < 5) {
    res.status(400).json({ error: "A valid ID number is required (min 5 characters)" });
    return;
  }

  try {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO kyc_verifications
         (id, wallet_address, first_name, last_name, date_of_birth,
          nationality, country_of_residence, id_type, id_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')
       ON CONFLICT (wallet_address) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         date_of_birth = EXCLUDED.date_of_birth,
         nationality = EXCLUDED.nationality,
         country_of_residence = EXCLUDED.country_of_residence,
         id_type = EXCLUDED.id_type,
         id_number = EXCLUDED.id_number,
         status = 'approved',
         updated_at = NOW()`,
      [
        id,
        walletAddress.trim().toLowerCase(),
        firstName.trim(),
        lastName.trim(),
        dateOfBirth,
        nationality.trim(),
        countryOfResidence.trim(),
        idType,
        idNumber.trim(),
      ]
    );

    logger.info(
      { walletAddress: walletAddress.slice(0, 8), idType },
      "KYC submission approved"
    );

    res.json({
      success: true,
      status: "approved",
      message: "Identity verified successfully",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "KYC submission failed");
    res.status(500).json({ error: "KYC submission failed" });
  }
});

export default router;
