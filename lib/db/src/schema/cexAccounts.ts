import { pgTable, serial, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const cexAccountsTable = pgTable("cex_accounts", {
  id:                serial("id").primaryKey(),
  exchange:          varchar("exchange", { length: 50 }).notNull(),
  label:             varchar("label",    { length: 100 }).notNull(),
  apiKeyEnc:         text("api_key_enc").notNull(),
  apiSecretEnc:      text("api_secret_enc").notNull(),
  passphraseEnc:     text("passphrase_enc"),
  status:            varchar("status", { length: 20 }).default("untested").notNull(),
  enabled:           boolean("enabled").default(true).notNull(),
  permissions:       jsonb("permissions").$type<{ spot: boolean; futures: boolean; withdraw: boolean }>(),
  lastTestedAt:      timestamp("last_tested_at", { withTimezone: true }),
  lastTestResult:    text("last_test_result"),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
