import { bigint, index, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const orderbookQuoteCandlesTable = pgTable("orderbook_quote_candles", {
  symbol: text("symbol").notNull(),
  bucketSec: bigint("bucket_sec", { mode: "number" }).notNull(),
  open: numeric("open", { precision: 56, scale: 30 }).notNull(),
  high: numeric("high", { precision: 56, scale: 30 }).notNull(),
  low: numeric("low", { precision: 56, scale: 30 }).notNull(),
  close: numeric("close", { precision: 56, scale: 30 }).notNull(),
  sampleCount: integer("sample_count").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.symbol, table.bucketSec] }),
  index("orderbook_quote_candles_symbol_bucket_idx").on(table.symbol, table.bucketSec),
]);

export type OrderbookQuoteCandle = typeof orderbookQuoteCandlesTable.$inferSelect;
