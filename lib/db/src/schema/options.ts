import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const optionsContractsTable = pgTable(
  "options_contracts",
  {
    id: text("id").primaryKey(),
    underlyingSymbol: text("underlying_symbol").notNull(),
    optionType: text("option_type").notNull(), // "call" | "put"
    strike: numeric("strike", { precision: 20, scale: 8 }).notNull(),
    expiry: timestamp("expiry").notNull(),
    settlementPrice: numeric("settlement_price", { precision: 20, scale: 8 }),
    impliedVolatility: numeric("implied_volatility", { precision: 10, scale: 6 }).notNull(),
    openInterest: numeric("open_interest", { precision: 20, scale: 8 }).notNull().default("0"),
    delta: numeric("delta", { precision: 10, scale: 6 }).notNull(),
    gamma: numeric("gamma", { precision: 10, scale: 6 }).notNull(),
    theta: numeric("theta", { precision: 10, scale: 6 }).notNull(),
    vega: numeric("vega", { precision: 10, scale: 6 }).notNull(),
    rho: numeric("rho", { precision: 10, scale: 6 }).notNull(),
    status: text("status").notNull().default("active"), // "active" | "expired" | "settled"
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("options_contracts_underlying_expiry_status_idx").on(
      t.underlyingSymbol,
      t.expiry,
      t.status,
    ),
  ],
);

export const optionsPositionsTable = pgTable(
  "options_positions",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    contractId: text("contract_id").notNull(),
    side: text("side").notNull(), // "long" | "short"
    quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
    entryPremium: numeric("entry_premium", { precision: 20, scale: 8 }).notNull(),
    currentPremium: numeric("current_premium", { precision: 20, scale: 8 }),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
    realizedPnl: numeric("realized_pnl", { precision: 20, scale: 8 }).notNull().default("0"),
    collateral: numeric("collateral", { precision: 20, scale: 8 }).notNull().default("0"),
    status: text("status").notNull().default("open"), // "open" | "closed" | "exercised" | "expired"
    exercisedAt: timestamp("exercised_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("options_positions_wallet_status_idx").on(t.walletAddress, t.status),
  ],
);

export const optionsOrdersTable = pgTable("options_orders", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  contractId: text("contract_id").notNull(),
  side: text("side").notNull(), // "buy" | "sell"
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  limitPremium: numeric("limit_premium", { precision: 20, scale: 8 }),
  status: text("status").notNull().default("open"), // "open" | "filled" | "cancelled"
  filledQuantity: numeric("filled_quantity", { precision: 20, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOptionsContractSchema = createInsertSchema(optionsContractsTable).omit({ createdAt: true, updatedAt: true });
export type InsertOptionsContract = z.infer<typeof insertOptionsContractSchema>;
export type OptionsContract = typeof optionsContractsTable.$inferSelect;

export const insertOptionsPositionSchema = createInsertSchema(optionsPositionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertOptionsPosition = z.infer<typeof insertOptionsPositionSchema>;
export type OptionsPosition = typeof optionsPositionsTable.$inferSelect;

export const insertOptionsOrderSchema = createInsertSchema(optionsOrdersTable).omit({ createdAt: true });
export type InsertOptionsOrder = z.infer<typeof insertOptionsOrderSchema>;
export type OptionsOrder = typeof optionsOrdersTable.$inferSelect;
