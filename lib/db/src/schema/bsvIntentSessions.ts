import { pgTable, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * BSV Intent Sessions — production cross-chain intent settlement.
 *
 * Every BSV-leg cross-chain trade is anchored here. The user commits an
 * intent (tokenIn/Out, amounts, deadline, nonce) and locks BSV into a
 * P2SH contract that enforces the full set of trade terms on-chain.
 *
 * ── Contract enforcement model ─────────────────────────────────────────────
 *
 *   The locking script (bsvIntentSettlement.ts) requires the spender to
 *   produce BOTH the server-side secret AND the exact canonicalized intent
 *   payload whose SHA-256 hash is embedded in the script.  This means:
 *
 *   • The relayer cannot claim without knowing the secret (same as HTLC).
 *   • The relayer cannot claim with a *different* intent (minAmountOut,
 *     nonce, deadline, addresses are all pinned by intentHash).
 *   • The user can always reclaim via CLTV after deadlineBlocks.
 *
 * ── Status lifecycle ───────────────────────────────────────────────────────
 *
 *   PENDING_FUNDING — contract created; awaiting user's BSV funding tx
 *   FUNDED          — funding tx seen on-chain (unconfirmed)
 *   CONFIRMED       — funding tx has ≥ 3 confirmations
 *   FILLED          — solver confirmed payment on destination chain
 *   CLAIMING        — relayer has broadcast the claim transaction
 *   CLAIMED         — claim confirmed; swap complete          [TERMINAL]
 *   EXPIRED         — deadlineTs passed without a fill        [TERMINAL]
 *   REFUNDING       — refund tx broadcast by relayer/user
 *   REFUNDED        — refund confirmed; BSV returned to user  [TERMINAL]
 *   CANCELLED       — cancelled before any BSV was sent       [TERMINAL]
 *
 * ── Nonce replay protection ────────────────────────────────────────────────
 *
 *   (userAddress, nonce) must be globally unique.  The server generates the
 *   nonce so it is always fresh; the intentHash provides an additional
 *   on-chain uniqueness anchor embedded in the redeem script.
 */
export const bsvIntentSessionsTable = pgTable("bsv_intent_sessions", {
  id:                 text("id").primaryKey(),

  intentHash:         text("intent_hash").notNull(),
  nonce:              text("nonce").notNull(),

  userAddress:        text("user_address").notNull(),
  solverAddress:      text("solver_address"),

  tokenIn:            text("token_in").notNull().default("BSV"),
  tokenOut:           text("token_out").notNull(),
  amountInSat:        integer("amount_in_sat").notNull(),
  minAmountOut:       text("min_amount_out").notNull(),

  destinationChain:   text("destination_chain").notNull(),
  destinationAddress: text("destination_address").notNull(),

  deadlineTs:         integer("deadline_ts").notNull(),
  deadlineBlocks:     integer("deadline_blocks").notNull(),

  secret:             text("secret").notNull(),
  secretHash:         text("secret_hash").notNull(),
  redeemScript:       text("redeem_script").notNull(),
  htlcAddress:        text("htlc_address").notNull(),

  fundingTxid:        text("funding_txid"),
  fundingVout:        integer("funding_vout"),
  fundingConfirmed:   boolean("funding_confirmed").notNull().default(false),
  confirmations:      integer("confirmations").notNull().default(0),

  solverPaymentTxid:  text("solver_payment_txid"),
  fillNote:           text("fill_note"),

  claimTxid:          text("claim_txid"),
  refundTxid:         text("refund_txid"),
  auditTxid:          text("audit_txid"),

  status:             text("status").notNull().default("PENDING_FUNDING"),
  terminalAt:         timestamp("terminal_at"),

  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
  expiresAt:          timestamp("expires_at").notNull(),
}, (t) => [
  uniqueIndex("bsv_intent_hash_idx").on(t.intentHash),
  uniqueIndex("bsv_intent_nonce_user_idx").on(t.userAddress, t.nonce),
  index("bsv_intent_status_idx").on(t.status),
  index("bsv_intent_user_idx").on(t.userAddress),
  index("bsv_intent_solver_idx").on(t.solverAddress),
  index("bsv_intent_htlc_addr_idx").on(t.htlcAddress),
  index("bsv_intent_expires_idx").on(t.expiresAt),
  index("bsv_intent_terminal_idx").on(t.terminalAt),
]);
