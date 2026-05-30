-- Migration: Add chain_id to orders table for EVM cross-chain matching safety
-- Date: 2026-05-30
-- Purpose: Store the EVM chain ID with each order so the matching engine can
--          prevent orders on different EVM chains (e.g. Ethereum vs Arbitrum)
--          from being matched against each other.
--
-- Backward compatible: nullable so existing orders (which pre-date this column)
-- remain valid. The matching engine skips the filter when both chainId values
-- are null (legacy orders can still match legacy orders).

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "chain_id" integer;

-- Sparse index: only non-null rows (EVM orders placed after this migration).
-- Speeds up the matching filter without penalising BSV / legacy EVM rows.
CREATE INDEX IF NOT EXISTS "orders_chain_id_idx"
  ON "orders" ("chain_id")
  WHERE "chain_id" IS NOT NULL;
