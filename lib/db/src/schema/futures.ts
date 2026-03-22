import { pgTable, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const futuresPositionsTable = pgTable("futures_positions", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  leverage: numeric("leverage", { precision: 6, scale: 2 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  markPrice: numeric("mark_price", { precision: 20, scale: 8 }).notNull(),
  liquidationPrice: numeric("liquidation_price", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  margin: numeric("margin", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  unrealizedPnlPercent: numeric("unrealized_pnl_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  realizedPnl: numeric("realized_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  fundingFee: numeric("funding_fee", { precision: 20, scale: 8 }).notNull().default("0"),
  marginMode: text("margin_mode").notNull().default("isolated"),
  status: text("status").notNull().default("open"),
  txid: text("txid"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertFuturesPositionSchema = createInsertSchema(futuresPositionsTable).omit({ openedAt: true });
export type InsertFuturesPosition = z.infer<typeof insertFuturesPositionSchema>;
export type FuturesPosition = typeof futuresPositionsTable.$inferSelect;

export const candlesTable = pgTable("candles", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  time: numeric("time", { precision: 20, scale: 0 }).notNull(),
  open: numeric("open", { precision: 20, scale: 8 }).notNull(),
  high: numeric("high", { precision: 20, scale: 8 }).notNull(),
  low: numeric("low", { precision: 20, scale: 8 }).notNull(),
  close: numeric("close", { precision: 20, scale: 8 }).notNull(),
  volume: numeric("volume", { precision: 30, scale: 8 }).notNull(),
});

export const insertCandleSchema = createInsertSchema(candlesTable);
export type InsertCandle = z.infer<typeof insertCandleSchema>;
export type Candle = typeof candlesTable.$inferSelect;
