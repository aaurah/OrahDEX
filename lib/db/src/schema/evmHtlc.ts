import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

/**
 * EVM HTLC Sessions — atomic settlement sessions for EVM-to-EVM trades.
 *
 * Each row represents one on-chain atomic swap between two EVM parties:
 *   - Seller locks ETH (or ERC-20) in the seller-side HTLC lock
 *   - Buyer  locks USDT (or ERC-20) in the buyer-side HTLC lock
 *   - Same secretHash used for both — single reveal settles both
 *
 * ── Status lifecycle ──────────────────────────────────────────────────────────
 *
 *   PENDING_LOCKS   — session created; waiting for both parties to lock on-chain
 *   SELLER_LOCKED   — seller has locked; waiting for buyer
 *   BUYER_LOCKED    — buyer has locked; waiting for seller
 *   BOTH_LOCKED     — both locked; relayer about to call reveal()
 *   REVEALING       — reveal() tx submitted for seller lock
 *   COMPLETED       — both reveal()s confirmed; trade settled
 *   SELLER_REFUNDED — seller refunded after timelock; settlement failed
 *   BUYER_REFUNDED  — buyer refunded after timelock; settlement failed
 *   EXPIRED         — timelock passed without completion; no on-chain action detected
 *
 * ── Lock IDs ──────────────────────────────────────────────────────────────────
 *
 *   sellerLockId = keccak256(abi.encodePacked(tradeId, "_seller"))
 *   buyerLockId  = keccak256(abi.encodePacked(tradeId, "_buyer"))
 *
 *   Both encoded as 0x-prefixed 32-byte hex strings.
 */
export const evmHtlcSessionsTable = pgTable("evm_htlc_sessions", {
  id:               text("id").primaryKey(),
  tradeId:          text("trade_id").notNull(),
  pair:             text("pair").notNull(),

  chainId:          integer("chain_id").notNull(),
  contractAddress:  text("contract_address").notNull(),

  secret:           text("secret").notNull(),
  secretHash:       text("secret_hash").notNull(),

  sellerAddress:    text("seller_address").notNull(),
  buyerAddress:     text("buyer_address").notNull(),

  sellerAsset:      text("seller_asset").notNull(),
  sellerAmount:     text("seller_amount").notNull(),
  sellerToken:      text("seller_token"),

  buyerAsset:       text("buyer_asset").notNull(),
  buyerAmount:      text("buyer_amount").notNull(),
  buyerToken:       text("buyer_token"),

  sellerLockId:     text("seller_lock_id").notNull(),
  buyerLockId:      text("buyer_lock_id").notNull(),

  sellerTimelockUnix: integer("seller_timelock_unix").notNull(),
  buyerTimelockUnix:  integer("buyer_timelock_unix").notNull(),

  sellerLockTxid:   text("seller_lock_txid"),
  buyerLockTxid:    text("buyer_lock_txid"),
  revealSellerTxid: text("reveal_seller_txid"),
  revealBuyerTxid:  text("reveal_buyer_txid"),

  sellerLocked:     boolean("seller_locked").notNull().default(false),
  buyerLocked:      boolean("buyer_locked").notNull().default(false),
  sellerRevealed:   boolean("seller_revealed").notNull().default(false),
  buyerRevealed:    boolean("buyer_revealed").notNull().default(false),

  status:           text("status").notNull().default("PENDING_LOCKS"),

  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
  expiresAt:        timestamp("expires_at").notNull(),
}, (t) => [
  index("evm_htlc_trade_idx").on(t.tradeId),
  index("evm_htlc_status_idx").on(t.status),
  index("evm_htlc_seller_idx").on(t.sellerAddress),
  index("evm_htlc_buyer_idx").on(t.buyerAddress),
  index("evm_htlc_expires_idx").on(t.expiresAt),
  index("evm_htlc_chain_idx").on(t.chainId),
]);
