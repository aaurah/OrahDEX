import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * EVM → BSV Swap Sessions — cross-chain atomic swap initiated from the EVM side.
 *
 * The user locks EVM tokens in the escrow contract; a solver monitors the
 * lock event and delivers BSV to the user's BSV receive address.
 *
 * ── Status lifecycle ──────────────────────────────────────────────────────────
 *
 *   PENDING_LOCK   — record created; awaiting user's EVM lock tx
 *   LOCKED         — EVM lock tx confirmed on-chain
 *   AWAITING_BSV   — solver picked up the lock; BSV delivery in progress
 *   BSV_SENT       — solver broadcast the BSV tx; awaiting confirmation
 *   COMPLETE       — BSV confirmed; swap settled                [TERMINAL]
 *   FAILED         — lock failed or timed out without fill     [TERMINAL]
 *   REFUNDED       — EVM escrow returned to user               [TERMINAL]
 */
export const evmToBsvSwapsTable = pgTable("evm_to_bsv_swaps", {
  id:              text("id").primaryKey(),

  userEvmAddress:  text("user_evm_address").notNull(),
  bsvReceiveAddr:  text("bsv_receive_addr").notNull(),

  tokenIn:         text("token_in").notNull(),
  tokenAddress:    text("token_address").notNull(),
  amountInRaw:     text("amount_in_raw").notNull(),
  amountInHuman:   text("amount_in_human").notNull(),
  chainId:         integer("chain_id").notNull(),

  estimatedBsvOut: text("estimated_bsv_out"),

  evmLockTxHash:   text("evm_lock_tx_hash"),
  solverBsvTxid:   text("solver_bsv_txid"),

  status:          text("status").notNull().default("PENDING_LOCK"),

  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
  expiresAt:       timestamp("expires_at").notNull(),
}, (t) => [
  index("evm_to_bsv_user_idx").on(t.userEvmAddress),
  index("evm_to_bsv_status_idx").on(t.status),
  index("evm_to_bsv_chain_idx").on(t.chainId),
  index("evm_to_bsv_expires_idx").on(t.expiresAt),
]);
