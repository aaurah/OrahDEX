import { pgTable, varchar, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 255 }).notNull(),
  asset:         varchar("asset", { length: 32 }).notNull(),
  amount:        numeric("amount", { precision: 36, scale: 18 }).notNull(),
  network:       varchar("network", { length: 64 }).notNull(),
  networkLabel:  varchar("network_label", { length: 128 }).notNull(),
  recipient:     varchar("recipient", { length: 255 }).notNull(),
  fee:           varchar("fee", { length: 32 }),
  // Status flow: pending → processing → completed | failed | cancelled
  status:        varchar("status", { length: 32 }).notNull().default("pending"),
  txid:          varchar("txid", { length: 255 }),
  note:          text("note"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  processedAt:   timestamp("processed_at"),
});
