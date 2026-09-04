import { pgTable, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * BSV HTLC lock records — one row per cross-chain bridge request.
 *
 * Lifecycle:
 *   pending  → awaiting BSV deposit from user
 *   funded   → BSV detected at htlc_address; bridge minting wBSV on EVM
 *   minting  → wBSV mint tx submitted on EVM
 *   complete → wBSV delivered to user; HTLC claimed by relayer
 *   refunded → locktime expired; user reclaimed BSV
 *   expired  → locktime passed with no action
 */
export const htlcLocksTable = pgTable("htlc_locks", {
  /** Server-generated UUID used as the lock identifier in API and UI */
  id:              text("id").primaryKey(),

  /** Random 32-byte secret (hex) generated server-side; only revealed to relayer on claim */
  secret:          text("secret").notNull(),

  /** SHA-256 of the secret (hex) — embedded in the HTLC script */
  secretHash:      text("secret_hash").notNull(),

  /** HASH160 of the redeem script → the P2SH address the user sends BSV to */
  htlcAddress:     text("htlc_address").notNull(),

  /** Raw redeem script hex — needed by the relayer to spend the UTXO */
  redeemScript:    text("redeem_script").notNull(),

  /** BSV amount the user is supposed to deposit (BSV, not satoshis) */
  amountBsv:       numeric("amount_bsv", { precision: 20, scale: 8 }).notNull(),

  /** BSV block height after which the user can reclaim (CLTV locktime) */
  locktimeBlocks:  integer("locktime_blocks").notNull(),

  /** The user's BSV address (for refund path) */
  senderBsvAddress: text("sender_bsv_address"),

  /** The EVM address that should receive the minted wBSV */
  recipientEvmAddress: text("recipient_evm_address"),

  /** EVM chain ID where wBSV will be minted */
  evmChainId:      integer("evm_chain_id"),

  /** pending | funded | minting | complete | refunded | expired */
  status:          text("status").notNull().default("pending"),

  /** WhatsOnChain txid of the BSV funding transaction */
  fundingTxid:     text("funding_txid"),

  /** EVM transaction hash of the wBSV mint */
  mintTxHash:      text("mint_tx_hash"),

  /** BSV block height at creation time (for computing absolute locktime) */
  createdAtBlock:  integer("created_at_block"),

  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export type HtlcLock = typeof htlcLocksTable.$inferSelect;
export type NewHtlcLock = typeof htlcLocksTable.$inferInsert;

export const insertHtlcLockSchema = createInsertSchema(htlcLocksTable);
export type InsertHtlcLock = z.infer<typeof insertHtlcLockSchema>;
