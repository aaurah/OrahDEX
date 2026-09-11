import { pgTable, text, timestamp, numeric, boolean, bigserial, index } from "drizzle-orm/pg-core";

/**
 * P2P Intent Layer — signed intents for peer-to-peer trades.
 *
 * A Keeper posts a swap intent ("I will swap up to X of A for B at price P or better").
 * Intents are signed off-chain, matched off-chain, settled on-chain.
 * This table tracks the intent lifecycle: open → filled | cancelled | expired.
 */
export const p2pIntentsTable = pgTable("p2p_intents", {
  id:              bigserial("id", { mode: "number" }).primaryKey(),
  intentId:        text("intent_id").notNull(),           // UUID, used as on-chain order hash
  makerAddress:    text("maker_address").notNull(),        // Keeper wallet posting the intent
  takerAddress:    text("taker_address"),                  // filled by — set when matched
  tokenIn:         text("token_in").notNull(),             // asset offered (e.g. USDT)
  tokenOut:        text("token_out").notNull(),            // asset wanted (e.g. BSV)
  amountIn:        numeric("amount_in", { precision: 36, scale: 18 }).notNull(),
  minAmountOut:    numeric("min_amount_out", { precision: 36, scale: 18 }).notNull(),
  filledAmountOut: numeric("filled_amount_out", { precision: 36, scale: 18 }),
  price:           numeric("price", { precision: 36, scale: 18 }),    // implied rate (tokenOut per tokenIn)
  fiat:            text("fiat").default("USD"),             // for P2P fiat trades
  paymentMethods:  text("payment_methods").default(""),    // comma-separated
  terms:           text("terms").default(""),
  signature:       text("signature").default(""),          // EIP-712 signature from maker
  status:          text("status").notNull().default("open"), // open | filled | cancelled | expired
  expiresAt:       timestamp("expires_at").notNull(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("p2p_intents_intent_id_idx").on(t.intentId),
  index("p2p_intents_maker_idx").on(t.makerAddress),
  index("p2p_intents_status_idx").on(t.status),
  index("p2p_intents_tokens_idx").on(t.tokenIn, t.tokenOut),
]);

export type P2PIntent = typeof p2pIntentsTable.$inferSelect;
