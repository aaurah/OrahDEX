import { pgTable, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  total: numeric("total", { precision: 30, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 20, scale: 8 }).notNull().default("0"),
  feeAsset: text("fee_asset").notNull().default("USDT"),
  walletAddress: text("wallet_address"),
  txid: text("txid"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ timestamp: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
