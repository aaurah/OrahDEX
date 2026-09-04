import { pgTable, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 36, scale: 18 }).notNull(),
  quantity: numeric("quantity", { precision: 36, scale: 18 }).notNull(),
  total: numeric("total", { precision: 36, scale: 18 }).notNull(),
  fee: numeric("fee", { precision: 36, scale: 18 }).notNull().default("0"),
  feeAsset: text("fee_asset").notNull().default("USDT"),
  walletAddress: text("wallet_address"),
  txid: text("txid"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("trades_wallet_ts_idx").on(t.walletAddress, t.timestamp),
  index("trades_symbol_ts_idx").on(t.symbol, t.timestamp),
]);

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ timestamp: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
