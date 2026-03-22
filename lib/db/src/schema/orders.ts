import { pgTable, text, numeric, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  walletAddress: text("wallet_address").notNull(),
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
  txid: text("txid"),
  signedTx: text("signed_tx"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
