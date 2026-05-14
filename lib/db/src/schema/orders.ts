import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  walletAddress: text("wallet_address").notNull(),
  // "evm" = MetaMask/EVM wallet, "bsv" = BSV native wallet
  networkType: text("network_type").default("evm"),
  side: text("side").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("open"),
  price: numeric("price", { precision: 20, scale: 8 }),
  stopPrice: numeric("stop_price", { precision: 20, scale: 8 }),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  filledQuantity: numeric("filled_quantity", { precision: 20, scale: 8 }).notNull().default("0"),
  remainingQuantity: numeric("remaining_quantity", { precision: 20, scale: 8 }).notNull(),
  total: numeric("total", { precision: 30, scale: 8 }),
  fee: numeric("fee", { precision: 20, scale: 8 }).notNull().default("0"),
  feeAsset: text("fee_asset").notNull().default("USDT"),
  timeInForce: text("time_in_force").notNull().default("GTC"),
  // BSV on-chain settlement txid (OP_RETURN transaction)
  txid: text("txid"),
  // EVM wallet signature (personal_sign) — proves the trader authorized this order
  signedTx: text("signed_tx"),
  // Which order this was matched against
  matchedOrderId: text("matched_order_id"),
  /**
   * Verifiable proof that funds are committed before this order was accepted.
   * Format: "ledger:{addr}:{asset}:{amount}" | "evm-sig:{hash}" |
   *         "utxo:{txid}:{vout}" | "margin:{addr}:{asset}:{amount}"
   * See fundingVerifier.ts for semantics.
   */
  fundingRef: text("funding_ref"),
  /** UUID v4 one-time token — replay-attack prevention. Unique index enforced. */
  nonce: text("nonce"),
  /** Unix ms — the server rejected this intent if expiry < Date.now() at receipt time */
  expiry: text("expiry"),  // stored as string to avoid bigint serialization issues
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("orders_symbol_status_idx").on(t.symbol, t.status),
  index("orders_wallet_status_idx").on(t.walletAddress, t.status),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
