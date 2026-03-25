import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const walletsTable = pgTable("wallets", {
  address:         text("address").primaryKey(),
  networkType:     text("network_type").default("evm"),
  provider:        text("provider"),
  chainId:         text("chain_id"),
  status:          text("status").default("active"),
  country:         text("country").default("US"),
  verified:        text("verified").default("false"),
  balanceOverride: numeric("balance_override", { precision: 20, scale: 8 }),
  firstSeen:       timestamp("first_seen").defaultNow().notNull(),
  lastSeen:        timestamp("last_seen").defaultNow().notNull(),
});

export type Wallet = typeof walletsTable.$inferSelect;
