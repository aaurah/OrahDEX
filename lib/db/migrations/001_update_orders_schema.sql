-- Migration: Update orders table schema to match Drizzle ORM definition
-- Date: 2026-05-28
-- Purpose: Add missing columns, indexes, and constraints to reduce deadlock risk

-- Step 1: Add missing columns (idempotent with IF NOT EXISTS equivalent)
ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "network_type" text DEFAULT 'evm' NOT NULL;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "matched_order_id" text;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "funding_ref" text;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "nonce" text;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "expiry" text;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "is_bot" boolean DEFAULT false NOT NULL;

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "is_synthetic" boolean DEFAULT false NOT NULL;

-- Step 2: Create unique index for wallet_address + nonce (case-insensitive)
-- This prevents replay attacks and enforces nonce uniqueness per wallet
CREATE UNIQUE INDEX IF NOT EXISTS "orders_wallet_nonce_uidx" 
  ON "orders" (lower("wallet_address"), "nonce") 
  WHERE "nonce" IS NOT NULL;

-- Step 3: Create composite indexes for common query patterns
-- These speed up order matching and status lookups, reducing lock duration

CREATE INDEX IF NOT EXISTS "orders_symbol_status_idx" 
  ON "orders" ("symbol", "status");

CREATE INDEX IF NOT EXISTS "orders_wallet_status_idx" 
  ON "orders" ("wallet_address", "status");

-- Step 4: Add supplementary indexes to further reduce deadlock risk

-- Index for status-based queries with created_at ordering
CREATE INDEX IF NOT EXISTS "orders_status_created_idx" 
  ON "orders" ("status", "created_at");

-- Index for matched order lookups (only when matched_order_id exists)
CREATE INDEX IF NOT EXISTS "orders_matched_order_idx" 
  ON "orders" ("matched_order_id") 
  WHERE "matched_order_id" IS NOT NULL;

-- Index for nonce lookups (only when nonce exists)
CREATE INDEX IF NOT EXISTS "orders_nonce_idx" 
  ON "orders" ("nonce") 
  WHERE "nonce" IS NOT NULL;

-- Index for bot/synthetic order filtering
CREATE INDEX IF NOT EXISTS "orders_bot_synthetic_idx" 
  ON "orders" ("is_bot", "is_synthetic") 
  WHERE "is_bot" = true OR "is_synthetic" = true;

-- Index for expiry-based cleanup queries
CREATE INDEX IF NOT EXISTS "orders_expiry_idx" 
  ON "orders" ("expiry") 
  WHERE "expiry" IS NOT NULL;

-- Step 5: Add table constraint if needed (optional - uncomment if desired)
-- ALTER TABLE "orders" 
-- ADD CONSTRAINT check_order_quantity 
--   CHECK ("quantity" > 0) 
--   NOT DEFERRABLE;

-- Step 6: Enable table statistics collection for query optimization
ANALYZE "orders";
