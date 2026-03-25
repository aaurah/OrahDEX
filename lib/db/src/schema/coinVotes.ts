import { pgTable, serial, text, integer, timestamp, inet } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const coinNominationsTable = pgTable("coin_nominations", {
  id:              serial("id").primaryKey(),
  symbol:          text("symbol").notNull(),
  name:            text("name").notNull(),
  logoUrl:         text("logo_url"),
  contractAddress: text("contract_address"),
  chain:           text("chain"),
  website:         text("website"),
  description:     text("description"),
  votes:           integer("votes").notNull().default(0),
  nominatedBy:     text("nominated_by"),
  status:          text("status").notNull().default("pending"),
  createdAt:       timestamp("created_at").defaultNow(),
});

export const coinVoteLogsTable = pgTable("coin_vote_logs", {
  id:           serial("id").primaryKey(),
  nominationId: integer("nomination_id").notNull(),
  voterIp:      text("voter_ip"),
  voterAddress: text("voter_address"),
  createdAt:    timestamp("created_at").defaultNow(),
});

export const insertNominationSchema = createInsertSchema(coinNominationsTable).omit({ id: true, votes: true, status: true, createdAt: true });
export type InsertNomination = z.infer<typeof insertNominationSchema>;
export type CoinNomination   = typeof coinNominationsTable.$inferSelect;
