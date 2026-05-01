import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const leSwapsTable = pgTable("le_swaps", {
  id:               text("id").primaryKey(),
  coinFrom:         text("coin_from").notNull(),
  coinTo:           text("coin_to").notNull(),
  networkFrom:      text("network_from"),
  networkTo:        text("network_to"),
  depositAmount:    numeric("deposit_amount", { precision: 36, scale: 18 }).notNull(),
  withdrawalAmount: numeric("withdrawal_amount", { precision: 36, scale: 18 }),
  depositAmountUsd: numeric("deposit_amount_usd", { precision: 20, scale: 4 }),
  status:           text("status").notNull().default("waiting"),
  withdrawal:       text("withdrawal").notNull(),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  completedAt:      timestamp("completed_at"),
}, t => [
  index("le_swaps_created_idx").on(t.createdAt),
  index("le_swaps_status_idx").on(t.status),
  index("le_swaps_coin_from_idx").on(t.coinFrom),
]);
