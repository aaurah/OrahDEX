import { pgTable, text, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketsTable = pgTable("markets", {
  symbol: text("symbol").primaryKey(),
  baseAsset: text("base_asset").notNull(),
  quoteAsset: text("quote_asset").notNull(),
  lastPrice: numeric("last_price", { precision: 36, scale: 18 }).notNull().default("0"),
  priceChange24h: numeric("price_change_24h", { precision: 36, scale: 18 }).notNull().default("0"),
  priceChangePercent24h: numeric("price_change_percent_24h", { precision: 10, scale: 4 }).notNull().default("0"),
  volume24h: numeric("volume_24h", { precision: 36, scale: 18 }).notNull().default("0"),
  high24h: numeric("high_24h", { precision: 36, scale: 18 }).notNull().default("0"),
  low24h: numeric("low_24h", { precision: 36, scale: 18 }).notNull().default("0"),
  marketCap: numeric("market_cap", { precision: 30, scale: 2 }),
  status: text("status").notNull().default("active"),
  type: text("type").notNull().default("spot"),
  minOrderSize: numeric("min_order_size", { precision: 36, scale: 18 }).notNull().default("0.00000001"),
  maxOrderSize: numeric("max_order_size", { precision: 36, scale: 18 }).notNull().default("1000000"),
  tickSize: numeric("tick_size", { precision: 36, scale: 18 }).notNull().default("0.01"),
  makerFee: numeric("maker_fee", { precision: 10, scale: 6 }).notNull().default("0.001"),
  takerFee: numeric("taker_fee", { precision: 10, scale: 6 }).notNull().default("0.001"),
  contractAddresses: jsonb("contract_addresses").$type<Record<string, string>>(),
  /**
   * enabled: false hides the market from all public API responses.
   * Admins can disable a pair without deleting it.
   */
  enabled: boolean("enabled").notNull().default(true),
  /**
   * pinned: true = internal pair (spot/futures). Never auto-disabled by seeders.
   * LetsExchange pairs are not pinned.
   */
  pinned: boolean("pinned").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMarketSchema = createInsertSchema(marketsTable);
export type InsertMarket = z.infer<typeof insertMarketSchema>;
export type Market = typeof marketsTable.$inferSelect;
