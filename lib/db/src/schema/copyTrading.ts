import { pgTable, text, numeric, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const copyVaultsTable = pgTable("copy_vaults", {
  id: text("id").primaryKey(),
  leaderWallet:  text("leader_wallet").notNull(),
  leaderName:    text("leader_name").notNull(),
  leaderAvatar:  text("leader_avatar"),
  name:          text("name").notNull(),
  description:   text("description"),
  tradingPairs:  text("trading_pairs").notNull().default("BSV-USDT"),
  feeRate:       numeric("fee_rate", { precision: 6, scale: 4 }).notNull().default("0.10"),
  minDeposit:    numeric("min_deposit", { precision: 20, scale: 8 }).notNull().default("10"),
  maxCapacity:   numeric("max_capacity", { precision: 20, scale: 8 }),
  tvl:           numeric("tvl", { precision: 30, scale: 8 }).notNull().default("0"),
  totalShares:   numeric("total_shares", { precision: 30, scale: 8 }).notNull().default("0"),
  sharePrice:    numeric("share_price", { precision: 20, scale: 8 }).notNull().default("1"),
  totalPnl:      numeric("total_pnl", { precision: 30, scale: 8 }).notNull().default("0"),
  totalPnlPct:   numeric("total_pnl_pct", { precision: 10, scale: 4 }).notNull().default("0"),
  monthPnlPct:   numeric("month_pnl_pct", { precision: 10, scale: 4 }).notNull().default("0"),
  totalTrades:   integer("total_trades").notNull().default(0),
  winRate:       numeric("win_rate", { precision: 6, scale: 4 }).notNull().default("0"),
  followers:     integer("followers").notNull().default(0),
  isPublic:      boolean("is_public").notNull().default(true),
  status:        text("status").notNull().default("active"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("copy_vaults_leader_idx").on(t.leaderWallet),
  index("copy_vaults_status_idx").on(t.status),
]);

export const copyVaultPositionsTable = pgTable("copy_vault_positions", {
  id:                   text("id").primaryKey(),
  vaultId:              text("vault_id").notNull(),
  followerWallet:       text("follower_wallet").notNull(),
  sharesOwned:          numeric("shares_owned", { precision: 30, scale: 8 }).notNull(),
  depositAmountUsdt:    numeric("deposit_amount_usdt", { precision: 30, scale: 8 }).notNull(),
  entrySharePrice:      numeric("entry_share_price", { precision: 20, scale: 8 }).notNull(),
  currentValue:         numeric("current_value", { precision: 30, scale: 8 }).notNull(),
  unrealizedPnl:        numeric("unrealized_pnl", { precision: 30, scale: 8 }).notNull().default("0"),
  unrealizedPnlPct:     numeric("unrealized_pnl_pct", { precision: 10, scale: 4 }).notNull().default("0"),
  realizedPnl:          numeric("realized_pnl", { precision: 30, scale: 8 }).notNull().default("0"),
  feesPaid:             numeric("fees_paid", { precision: 20, scale: 8 }).notNull().default("0"),
  status:               text("status").notNull().default("active"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
  withdrawnAt:          timestamp("withdrawn_at"),
}, (t) => [
  index("cvp_vault_idx").on(t.vaultId),
  index("cvp_follower_idx").on(t.followerWallet),
]);

export const copyVaultTradesTable = pgTable("copy_vault_trades", {
  id:            text("id").primaryKey(),
  vaultId:       text("vault_id").notNull(),
  leaderOrderId: text("leader_order_id"),
  symbol:        text("symbol").notNull(),
  side:          text("side").notNull(),
  price:         numeric("price", { precision: 20, scale: 8 }).notNull(),
  quantity:      numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  total:         numeric("total", { precision: 30, scale: 8 }).notNull(),
  pnl:           numeric("pnl", { precision: 30, scale: 8 }),
  pnlPct:        numeric("pnl_pct", { precision: 10, scale: 4 }),
  txid:          text("txid"),
  status:        text("status").notNull().default("executed"),
  executedAt:    timestamp("executed_at").notNull().defaultNow(),
}, (t) => [
  index("cvt_vault_idx").on(t.vaultId),
]);

export const insertCopyVaultSchema = createInsertSchema(copyVaultsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCopyVault = z.infer<typeof insertCopyVaultSchema>;
export type CopyVault = typeof copyVaultsTable.$inferSelect;

export const insertCopyVaultPositionSchema = createInsertSchema(copyVaultPositionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCopyVaultPosition = z.infer<typeof insertCopyVaultPositionSchema>;
export type CopyVaultPosition = typeof copyVaultPositionsTable.$inferSelect;

export const insertCopyVaultTradeSchema = createInsertSchema(copyVaultTradesTable).omit({ executedAt: true });
export type InsertCopyVaultTrade = z.infer<typeof insertCopyVaultTradeSchema>;
export type CopyVaultTrade = typeof copyVaultTradesTable.$inferSelect;
