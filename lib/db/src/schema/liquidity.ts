import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

// Liquidity provider positions — users stake coins into OrahDEX pools
// to back exchange liquidity and earn trading fee rewards + APY bonus.
export const lpPositionsTable = pgTable("lp_positions", {
  id:            text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  pool:          text("pool").notNull(),         // e.g. "BSV/USDT"
  coin:          text("coin").notNull(),          // e.g. "BSV" or "USDT" (single-sided)
  amount:        numeric("amount",          { precision: 36, scale: 18 }).notNull(),
  apy:           numeric("apy",             { precision: 10, scale: 4  }).notNull(),
  lockDays:      text("lock_days").notNull().default("0"),
  status:        text("status").notNull().default("active"),  // active | withdrawn
  rewardAccrued: numeric("reward_accrued",  { precision: 36, scale: 18 }).default("0"),
  startedAt:     timestamp("started_at").defaultNow().notNull(),
  unlocksAt:     timestamp("unlocks_at").notNull(),
  withdrawnAt:   timestamp("withdrawn_at"),
}, t => [
  index("lp_pos_wallet_idx").on(t.walletAddress),
  index("lp_pos_status_idx").on(t.status),
  index("lp_pos_pool_idx").on(t.pool),
]);
