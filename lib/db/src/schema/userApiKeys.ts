import { pgTable, varchar, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const userApiKeysTable = pgTable("user_api_keys", {
  id: varchar("id", { length: 48 }).primaryKey(),
  ownerWallet: text("owner_wallet").notNull(),
  ownerWalletKey: text("owner_wallet_key").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  permission: varchar("permission", { length: 16 }).notNull(),
  rateLimit: integer("rate_limit").notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  keyPreview: varchar("key_preview", { length: 40 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  rateWindowStartedAt: timestamp("rate_window_started_at"),
  rateWindowCalls: integer("rate_window_calls").notNull().default(0),
}, (table) => [
  uniqueIndex("user_api_keys_hash_uidx").on(table.keyHash),
  index("user_api_keys_owner_created_idx").on(table.ownerWalletKey, table.createdAt),
]);
