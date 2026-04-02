import { Router } from "express";
import { db } from "@workspace/db";
import { supportTicketsTable, supportFaqsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendMail } from "../lib/mailer.js";
import { notifyNewTicket, sendTestNotification } from "../lib/notifier.js";

const router = Router();

/* ── PUBLIC: Submit contact form ticket ────────────────────────────────────── */
router.post("/support/contact", async (req, res) => {
  try {
    const { name, email, subject, category = "general", message } = req.body ?? {};
    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "name, email, subject and message are required" });
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const [ticket] = await db.insert(supportTicketsTable).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      category,
      message: message.trim(),
      status: "open",
      priority: "normal",
    }).returning();

    const settings = await db.select().from(platformSettingsTable);
    const get = (k: string) => settings.find(r => r.key === k)?.value ?? "";
    const supportEmail = get("support_email") || get("contact_email") || "support@orahdex.com";

    try {
      await sendMail({
        to: supportEmail,
        subject: `[Support Ticket #${ticket.id}] ${ticket.subject}`,
        text: `New support ticket from ${ticket.name} <${ticket.email}>\n\nCategory: ${ticket.category}\n\nMessage:\n${ticket.message}`,
        html: `<h3>New Support Ticket #${ticket.id}</h3><p><strong>From:</strong> ${ticket.name} &lt;${ticket.email}&gt;</p><p><strong>Category:</strong> ${ticket.category}</p><p><strong>Subject:</strong> ${ticket.subject}</p><hr><p>${ticket.message.replace(/\n/g, "<br>")}</p>`,
      });
    } catch (mailErr: any) {
      logger.warn({ err: mailErr?.message }, "Support ticket mail notification failed");
    }

    logger.info({ id: ticket.id, email: ticket.email }, "Support ticket created");

    notifyNewTicket({
      id: ticket.id,
      name: ticket.name,
      email: ticket.email,
      subject: ticket.subject,
      category: ticket.category,
      message: ticket.message,
      priority: ticket.priority,
    }).catch(e => logger.warn({ err: e?.message }, "notifyNewTicket failed"));

    res.json({ success: true, ticketId: ticket.id, message: "Your message has been received. We'll get back to you shortly." });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Support contact error");
    res.status(500).json({ error: "Failed to submit ticket" });
  }
});

/* ── PUBLIC: Get published FAQs ────────────────────────────────────────────── */
router.get("/support/faqs", async (_req, res) => {
  try {
    const faqs = await db.select().from(supportFaqsTable)
      .where(eq(supportFaqsTable.isPublished, true))
      .orderBy(asc(supportFaqsTable.order), asc(supportFaqsTable.id));
    res.json(faqs);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Get all tickets ─────────────────────────────────────────────────── */
router.get("/admin/support/tickets", async (req, res) => {
  try {
    const tickets = await db.select().from(supportTicketsTable)
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Update ticket (status, reply) ──────────────────────────────────── */
router.patch("/admin/support/tickets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, priority, adminReply } = req.body ?? {};
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (adminReply !== undefined) {
      updates.adminReply = adminReply;
      updates.repliedAt = new Date();
      if (status !== "closed") updates.status = "replied";
    }
    const [ticket] = await db.update(supportTicketsTable)
      .set(updates)
      .where(eq(supportTicketsTable.id, id))
      .returning();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    if (adminReply && ticket.email) {
      try {
        const settings = await db.select().from(platformSettingsTable);
        const siteName = settings.find(r => r.key === "site_name")?.value || "OrahDEX";
        const supportEmail = settings.find(r => r.key === "support_email")?.value || "support@orahdex.com";
        await sendMail({
          to: ticket.email,
          subject: `Re: [Ticket #${ticket.id}] ${ticket.subject}`,
          text: `Hi ${ticket.name},\n\n${adminReply}\n\nBest regards,\n${siteName} Support Team\n${supportEmail}`,
          html: `<p>Hi ${ticket.name},</p><p>${adminReply.replace(/\n/g, "<br>")}</p><p>Best regards,<br><strong>${siteName} Support Team</strong></p>`,
        });
      } catch (mailErr: any) {
        logger.warn({ err: mailErr?.message }, "Support reply mail failed");
      }
    }

    res.json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Delete ticket ───────────────────────────────────────────────────── */
router.delete("/admin/support/tickets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(supportTicketsTable).where(eq(supportTicketsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Get all FAQs ────────────────────────────────────────────────────── */
router.get("/admin/support/faqs", async (_req, res) => {
  try {
    const faqs = await db.select().from(supportFaqsTable)
      .orderBy(asc(supportFaqsTable.order), asc(supportFaqsTable.id));
    res.json(faqs);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Create FAQ ──────────────────────────────────────────────────────── */
router.post("/admin/support/faqs", async (req, res) => {
  try {
    const { question, answer, category = "general", isPublished = true } = req.body ?? {};
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ error: "question and answer are required" });
    }
    const [faq] = await db.insert(supportFaqsTable).values({
      question: question.trim(),
      answer: answer.trim(),
      category,
      isPublished,
    }).returning();
    res.json(faq);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Update FAQ ──────────────────────────────────────────────────────── */
router.put("/admin/support/faqs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { question, answer, category, isPublished } = req.body ?? {};
    const updates: any = { updatedAt: new Date() };
    if (question !== undefined) updates.question = question;
    if (answer !== undefined) updates.answer = answer;
    if (category !== undefined) updates.category = category;
    if (isPublished !== undefined) updates.isPublished = isPublished;
    const [faq] = await db.update(supportFaqsTable).set(updates).where(eq(supportFaqsTable.id, id)).returning();
    if (!faq) return res.status(404).json({ error: "FAQ not found" });
    res.json(faq);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Delete FAQ ──────────────────────────────────────────────────────── */
router.delete("/admin/support/faqs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(supportFaqsTable).where(eq(supportFaqsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Get support settings ────────────────────────────────────────────── */
router.get("/admin/support/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const keys = [
      "support_email", "support_email_legal", "support_email_billing",
      "support_email_press", "support_email_privacy", "support_chat_enabled",
      "support_chat_welcome", "support_chat_offline_msg", "support_hours",
      "support_response_time", "support_telegram_url", "support_discord_url",
      "notif_telegram_token", "notif_telegram_chat_id",
      "notif_ntfy_topic", "notif_ntfy_server",
      "notif_discord_webhook",
      "notif_pushover_token", "notif_pushover_user",
      "notif_enabled",
    ];
    const settings: Record<string, string> = {};
    for (const key of keys) {
      settings[key] = rows.find(r => r.key === key)?.value ?? "";
    }
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Save support settings ──────────────────────────────────────────── */
router.post("/admin/support/settings", async (req, res) => {
  try {
    const body = req.body ?? {};
    const allowed = [
      "support_email", "support_email_legal", "support_email_billing",
      "support_email_press", "support_email_privacy", "support_chat_enabled",
      "support_chat_welcome", "support_chat_offline_msg", "support_hours",
      "support_response_time", "support_telegram_url", "support_discord_url",
      "notif_telegram_token", "notif_telegram_chat_id",
      "notif_ntfy_topic", "notif_ntfy_server",
      "notif_discord_webhook",
      "notif_pushover_token", "notif_pushover_user",
      "notif_enabled",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        await db.insert(platformSettingsTable)
          .values({ key, value: String(body[key]) })
          .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(body[key]), updatedAt: new Date() } });
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── ADMIN: Test notification ───────────────────────────────────────────────── */
router.post("/admin/support/notifications/test", async (req, res) => {
  try {
    const { channel, ...settings } = req.body ?? {};
    if (!channel) return res.status(400).json({ error: "channel is required" });
    const result = await sendTestNotification(channel, settings);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export default router;
