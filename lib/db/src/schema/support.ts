import { pgTable, serial, text, boolean, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  adminReply: text("admin_reply"),
  repliedAt: timestamp("replied_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supportFaqsTable = pgTable("support_faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("general"),
  order: serial("order"),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supportChatConversationsTable = pgTable("support_chat_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  displayName: text("display_name").notNull().default("Guest"),
  wallet: text("wallet").notNull().default("anonymous"),
  status: text("status").notNull().default("open"),
  lastMessageId: text("last_message_id"),
  lastMessageRole: text("last_message_role"),
  lastMessagePreview: text("last_message_preview"),
  lastMessageAt: timestamp("last_message_at"),
  adminReadAt: timestamp("admin_read_at"),
  adminReadMessageId: text("admin_read_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [
  index("support_chat_conversations_updated_idx").on(table.updatedAt),
  index("support_chat_conversations_last_message_idx").on(table.lastMessageAt),
]);

export const supportChatMessagesTable = pgTable("support_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => supportChatConversationsTable.id, { onDelete: "cascade" }),
  senderRole: text("sender_role").notNull(),
  senderName: text("sender_name").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  index("support_chat_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);
