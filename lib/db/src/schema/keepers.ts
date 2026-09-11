import { pgTable, text, timestamp, boolean, jsonb, index, uniqueIndex, bigserial, numeric } from "drizzle-orm/pg-core";

/**
 * Keeper Registry — identity spine of OrahDEX.
 *
 * A Keeper is a wallet that has explicitly registered an identity on the
 * protocol. Roles are first-class: Trader, LiquidityKeeper, Relayer,
 * OracleKeeper. Multiple roles per Keeper are allowed.
 *
 * In Phase 2 these will be mirrored to an on-chain registry contract;
 * for Phase 1 this DB table is the canonical source.
 */
export const keepersTable = pgTable("keepers", {
  id:              bigserial("id", { mode: "number" }).primaryKey(),
  walletAddress:   text("wallet_address").notNull(),
  uri:             text("uri").default(""),                // off-chain metadata JSON URL or inline JSON
  roles:           jsonb("roles").$type<string[]>().notNull().default([]),
  active:          boolean("active").notNull().default(true),
  displayName:     text("display_name").default(""),
  avatarUrl:       text("avatar_url").default(""),
  registeredAt:    timestamp("registered_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("keepers_wallet_idx").on(t.walletAddress),
  index("keepers_active_idx").on(t.active),
]);

/**
 * Keeper Fee Earnings — tracks cumulative fee revenue distributed to
 * LiquidityKeepers and RelayerKeepers.
 */
export const keeperEarningsTable = pgTable("keeper_earnings", {
  id:            bigserial("id", { mode: "number" }).primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  asset:         text("asset").notNull().default("USDT"),
  source:        text("source").notNull(),  // "lp_fee" | "bridge_relay" | "referral"
  amount:        numeric("amount", { precision: 36, scale: 18 }).notNull(),
  txRef:         text("tx_ref").default(""),  // order/swap/bridge id
  earnedAt:      timestamp("earned_at").notNull().defaultNow(),
}, (t) => [
  index("keeper_earnings_wallet_idx").on(t.walletAddress),
  index("keeper_earnings_source_idx").on(t.source),
]);

export type Keeper        = typeof keepersTable.$inferSelect;
export type KeeperEarning = typeof keeperEarningsTable.$inferSelect;
