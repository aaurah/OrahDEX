import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { supportChatConversationsTable, supportChatMessagesTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createChatLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
});
const customerMessageLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use("/admin/support/chats", requireAdminToken);

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token: string, storedHash: string): boolean {
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getBearerToken(req: Request): string | null {
  const authorization = req.header("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(authorization);
  return match?.[1] ?? null;
}

function safeConversationId(value: string): boolean {
  return UUID_RE.test(value);
}

function getMessageText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 2_000 ? text : null;
}

function messagePreview(text: string): string {
  const preview = text.replace(/\s+/g, " ").trim();
  return preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
}

async function getCustomerConversation(req: Request, res: Response) {
  const id = String(req.params.id ?? "");
  const token = getBearerToken(req);
  if (!safeConversationId(id) || !token) {
    res.status(404).json({ error: "Support conversation not found" });
    return null;
  }

  const [conversation] = await db.select().from(supportChatConversationsTable)
    .where(eq(supportChatConversationsTable.id, id))
    .limit(1);
  if (!conversation || !validToken(token, conversation.accessTokenHash)) {
    res.status(404).json({ error: "Support conversation not found" });
    return null;
  }
  return conversation;
}

router.post("/support/chats", createChatLimiter, async (req, res) => {
  try {
    const displayName = typeof req.body?.displayName === "string"
      ? req.body.displayName.trim().slice(0, 40) || "Guest"
      : "Guest";
    const wallet = typeof req.body?.wallet === "string" && req.body.wallet.length <= 120
      ? req.body.wallet.trim() || "anonymous"
      : "anonymous";
    const accessToken = randomBytes(32).toString("base64url");
    const [conversation] = await db.insert(supportChatConversationsTable).values({
      accessTokenHash: tokenHash(accessToken),
      displayName,
      wallet,
    }).returning({
      id: supportChatConversationsTable.id,
      displayName: supportChatConversationsTable.displayName,
    });

    res.status(201).json({ conversation, accessToken });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to create private support conversation");
    res.status(500).json({ error: "Could not start support chat" });
  }
});

router.get("/support/chats/:id/messages", async (req, res) => {
  try {
    const conversation = await getCustomerConversation(req, res);
    if (!conversation) return;

    const messages = await db.select({
      id: supportChatMessagesTable.id,
      senderRole: supportChatMessagesTable.senderRole,
      senderName: supportChatMessagesTable.senderName,
      text: supportChatMessagesTable.text,
      createdAt: supportChatMessagesTable.createdAt,
    }).from(supportChatMessagesTable)
      .where(eq(supportChatMessagesTable.conversationId, conversation.id))
      .orderBy(desc(supportChatMessagesTable.createdAt))
      .limit(200);

    res.json({ conversation: { id: conversation.id, status: conversation.status }, messages: messages.reverse() });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to load private support conversation");
    res.status(500).json({ error: "Could not load support chat" });
  }
});

router.post("/support/chats/:id/messages", customerMessageLimiter, async (req, res) => {
  try {
    const conversation = await getCustomerConversation(req, res);
    if (!conversation) return;
    const text = getMessageText(req.body?.text);
    if (!text) {
      res.status(400).json({ error: "Message must contain 1–2000 characters" });
      return;
    }

    const message = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM ${supportChatConversationsTable} WHERE id = ${conversation.id} FOR UPDATE`);
      const [inserted] = await tx.insert(supportChatMessagesTable).values({
        conversationId: conversation.id,
        senderRole: "customer",
        senderName: conversation.displayName,
        text,
      }).returning();
      await tx.update(supportChatConversationsTable)
        .set({
          status: "open",
          lastMessageId: inserted.id,
          lastMessageRole: "customer",
          lastMessagePreview: messagePreview(text),
          lastMessageAt: inserted.createdAt,
          updatedAt: new Date(),
        })
        .where(eq(supportChatConversationsTable.id, conversation.id));
      return inserted;
    });

    res.status(201).json({ message });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to save customer support message");
    res.status(500).json({ error: "Could not send support message" });
  }
});

router.get("/admin/support/chats", async (_req, res) => {
  try {
    const conversations = await db.select({
      id: supportChatConversationsTable.id,
      displayName: supportChatConversationsTable.displayName,
      wallet: supportChatConversationsTable.wallet,
      status: supportChatConversationsTable.status,
      lastMessageId: supportChatConversationsTable.lastMessageId,
      lastMessageRole: supportChatConversationsTable.lastMessageRole,
      lastMessagePreview: supportChatConversationsTable.lastMessagePreview,
      lastMessageAt: supportChatConversationsTable.lastMessageAt,
      adminReadAt: supportChatConversationsTable.adminReadAt,
      adminReadMessageId: supportChatConversationsTable.adminReadMessageId,
      createdAt: supportChatConversationsTable.createdAt,
      updatedAt: supportChatConversationsTable.updatedAt,
    }).from(supportChatConversationsTable)
      .orderBy(desc(supportChatConversationsTable.updatedAt))
      .limit(200);

    res.json(conversations.filter(chat => chat.lastMessageId).map(chat => ({
      ...chat,
      unread: chat.lastMessageRole === "customer"
        && !!chat.lastMessageAt
        && chat.lastMessageId !== chat.adminReadMessageId,
    })));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to list private support chats");
    res.status(500).json({ error: "Could not load support chats" });
  }
});

router.get("/admin/support/chats/:id/messages", async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    if (!safeConversationId(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const [conversation] = await db.select().from(supportChatConversationsTable)
      .where(eq(supportChatConversationsTable.id, id))
      .limit(1);
    if (!conversation) {
      res.status(404).json({ error: "Support conversation not found" });
      return;
    }

    const messages = await db.select({
      id: supportChatMessagesTable.id,
      senderRole: supportChatMessagesTable.senderRole,
      senderName: supportChatMessagesTable.senderName,
      text: supportChatMessagesTable.text,
      createdAt: supportChatMessagesTable.createdAt,
    }).from(supportChatMessagesTable)
      .where(eq(supportChatMessagesTable.conversationId, id))
      .orderBy(desc(supportChatMessagesTable.createdAt))
      .limit(200);
    const orderedMessages = messages.reverse();
    const latestReadMessage = orderedMessages.at(-1);
    if (latestReadMessage) {
      await db.update(supportChatConversationsTable)
        .set({
          adminReadAt: latestReadMessage.createdAt,
          adminReadMessageId: latestReadMessage.id,
        })
        .where(eq(supportChatConversationsTable.id, id));
    }

    res.json({ conversation: { id: conversation.id, displayName: conversation.displayName, wallet: conversation.wallet, status: conversation.status }, messages: orderedMessages });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to load admin support chat");
    res.status(500).json({ error: "Could not load support chat" });
  }
});

router.post("/admin/support/chats/:id/messages", async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    if (!safeConversationId(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const text = getMessageText(req.body?.text);
    if (!text) {
      res.status(400).json({ error: "Message must contain 1–2000 characters" });
      return;
    }
    const [conversation] = await db.select().from(supportChatConversationsTable)
      .where(eq(supportChatConversationsTable.id, id))
      .limit(1);
    if (!conversation) {
      res.status(404).json({ error: "Support conversation not found" });
      return;
    }

    const message = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM ${supportChatConversationsTable} WHERE id = ${id} FOR UPDATE`);
      const [inserted] = await tx.insert(supportChatMessagesTable).values({
        conversationId: id,
        senderRole: "support",
        senderName: "OrahDEX Support",
        text,
      }).returning({
        id: supportChatMessagesTable.id,
        senderRole: supportChatMessagesTable.senderRole,
        senderName: supportChatMessagesTable.senderName,
        text: supportChatMessagesTable.text,
        createdAt: supportChatMessagesTable.createdAt,
      });
      await tx.update(supportChatConversationsTable)
        .set({
          status: "open",
          lastMessageId: inserted.id,
          lastMessageRole: "support",
          lastMessagePreview: messagePreview(text),
          lastMessageAt: inserted.createdAt,
          adminReadAt: inserted.createdAt,
          adminReadMessageId: inserted.id,
          updatedAt: new Date(),
        })
        .where(eq(supportChatConversationsTable.id, id));
      return inserted;
    });

    res.status(201).json({ message });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to save admin support reply");
    res.status(500).json({ error: "Could not send support reply" });
  }
});

export default router;
