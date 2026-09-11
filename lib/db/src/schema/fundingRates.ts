import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fundingRatesTable = pgTable(
  "funding_rates",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    rate: numeric("rate", { precision: 20, scale: 10 }).notNull(),
    markPrice: numeric("mark_price", { precision: 20, scale: 8 }).notNull(),
    indexPrice: numeric("index_price", { precision: 20, scale: 8 }).notNull(),
    premium: numeric("premium", { precision: 20, scale: 10 }).notNull(),
    nextFundingAt: timestamp("next_funding_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("funding_rates_symbol_idx").on(t.symbol),
    index("funding_rates_symbol_created_idx").on(t.symbol, t.createdAt),
  ],
);

export const fundingPaymentsTable = pgTable(
  "funding_payments",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    positionId: text("position_id").notNull(),
    symbol: text("symbol").notNull(),
    fundingRate: numeric("funding_rate", { precision: 20, scale: 10 }).notNull(),
    positionSize: numeric("position_size", { precision: 20, scale: 8 }).notNull(),
    payment: numeric("payment", { precision: 20, scale: 8 }).notNull(),
    direction: text("direction").notNull(), // "paid" | "received"
    settledAt: timestamp("settled_at").notNull().defaultNow(),
  },
  (t) => [
    index("funding_payments_wallet_settled_idx").on(t.walletAddress, t.settledAt),
  ],
);

export const insertFundingRateSchema = createInsertSchema(fundingRatesTable).omit({ createdAt: true });
export type InsertFundingRate = z.infer<typeof insertFundingRateSchema>;
export type FundingRate = typeof fundingRatesTable.$inferSelect;

export const insertFundingPaymentSchema = createInsertSchema(fundingPaymentsTable).omit({ settledAt: true });
export type InsertFundingPayment = z.infer<typeof insertFundingPaymentSchema>;
export type FundingPayment = typeof fundingPaymentsTable.$inferSelect;
