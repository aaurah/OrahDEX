import { pgTable, bigserial, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const userBalancesTable = pgTable("user_balances", {
  id:          bigserial("id", { mode: "number" }).primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  assetSymbol: text("asset_symbol").notNull(),
  available:   numeric("available", { precision: 36, scale: 18 }).notNull().default("0"),
  locked:      numeric("locked",    { precision: 36, scale: 18 }).notNull().default("0"),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("user_balances_wallet_asset_idx").on(t.walletAddress, t.assetSymbol),
  index("user_balances_wallet_idx").on(t.walletAddress),
]);

export const liquidityPositionsTable = pgTable("liquidity_positions", {
  id:            bigserial("id", { mode: "number" }).primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  poolId:        text("pool_id").notNull(),
  assetA:        text("asset_a").notNull(),
  assetB:        text("asset_b").notNull(),
  amountA:       numeric("amount_a", { precision: 36, scale: 18 }).notNull(),
  amountB:       numeric("amount_b", { precision: 36, scale: 18 }).notNull(),
  lpTokens:      numeric("lp_tokens", { precision: 36, scale: 18 }).notNull(),
  status:        text("status").notNull().default("active"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("lp_positions_wallet_idx").on(t.walletAddress),
  index("lp_positions_pool_idx").on(t.poolId),
]);

export type UserBalance        = typeof userBalancesTable.$inferSelect;
export type LiquidityPosition  = typeof liquidityPositionsTable.$inferSelect;
