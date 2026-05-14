import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const stakingPositionsTable = pgTable("staking_positions", {
  id:            text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  coin:          text("coin").notNull(),
  amount:        numeric("amount",         { precision: 36, scale: 18 }).notNull(),
  apy:           numeric("apy",            { precision: 10, scale: 4  }).notNull(),
  lockDays:      text("lock_days").notNull().default("30"),
  status:        text("status").notNull().default("active"),
  rewardAccrued: numeric("reward_accrued", { precision: 36, scale: 18 }).default("0"),
  startedAt:     timestamp("started_at").defaultNow().notNull(),
  unlocksAt:     timestamp("unlocks_at").notNull(),
  completedAt:   timestamp("completed_at"),
}, t => [
  index("staking_positions_wallet_idx").on(t.walletAddress),
  index("staking_positions_status_idx").on(t.status),
  index("staking_positions_coin_idx").on(t.coin),
]);
