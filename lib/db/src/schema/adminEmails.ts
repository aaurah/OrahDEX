import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const adminEmailsTable = pgTable("admin_emails", {
  id: serial("id").primaryKey(),
  folder: text("folder").notNull().default("inbox"),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
