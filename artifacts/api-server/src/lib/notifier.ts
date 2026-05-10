import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { logger } from "./logger.js";

function isAsciiTokenChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "-"
  );
}

function isValidTelegramToken(token: string): boolean {
  const sep = token.indexOf(":");
  if (sep < 6 || sep !== token.lastIndexOf(":") || sep >= token.length - 20) return false;
  for (let i = 0; i < sep; i++) {
    const ch = token[i];
    if (ch < "0" || ch > "9") return false;
  }
  for (let i = sep + 1; i < token.length; i++) {
    if (!isAsciiTokenChar(token[i])) return false;
  }
  return true;
}

function normalizeDiscordWebhook(webhookUrl: string): URL | null {
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    let origin: string | null = null;
    if (host === "discord.com") origin = "https://discord.com";
    if (host === "discordapp.com") origin = "https://discordapp.com";
    if (host === "canary.discord.com") origin = "https://canary.discord.com";
    if (host === "ptb.discord.com") origin = "https://ptb.discord.com";
    if (!origin) return null;
    if (!url.pathname.startsWith("/api/webhooks/")) return null;
    return new URL(`${url.pathname}${url.search}`, origin);
  } catch {
    return null;
  }
}

async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(platformSettingsTable);
  return rows.find(r => r.key === key)?.value ?? "";
}

/* ── Telegram Bot ─────────────────────────────────────────────────────────── */
async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  if (!isValidTelegramToken(token)) {
    throw new Error("Invalid Telegram bot token format");
  }
  const url = new URL(`/bot${encodeURIComponent(token)}/sendMessage`, "https://api.telegram.org");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

/* ── ntfy.sh Push Notification ────────────────────────────────────────────── */
async function sendNtfy(topic: string, title: string, message: string, priority: string): Promise<void> {
  const ntfyPriority: Record<string, string> = {
    urgent: "5", high: "4", normal: "3", low: "2",
  };
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Title": title.replace(/[^\x20-\x7E]/g, ""),
      "Priority": ntfyPriority[priority] ?? "3",
      "Tags": "envelope",
    },
    body: message,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ntfy error ${res.status}: ${body}`);
  }
}

/* ── Discord Webhook ──────────────────────────────────────────────────────── */
async function sendDiscord(webhookUrl: string, title: string, message: string, priority: string): Promise<void> {
  const safeWebhook = normalizeDiscordWebhook(webhookUrl);
  if (!safeWebhook) throw new Error("Invalid Discord webhook URL");

  const colorMap: Record<string, number> = {
    urgent: 0xe74c3c, high: 0xe67e22, normal: 0x3498db, low: 0x95a5a6,
  };
  const res = await fetch(safeWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description: message,
        color: colorMap[priority] ?? colorMap.normal,
        footer: { text: "Orah Support" },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord webhook error ${res.status}: ${body}`);
  }
}

/* ── Pushover ─────────────────────────────────────────────────────────────── */
async function sendPushover(appToken: string, userKey: string, title: string, message: string, priority: string): Promise<void> {
  const priorityMap: Record<string, number> = { urgent: 1, high: 0, normal: 0, low: -1 };
  const body = new URLSearchParams({
    token: appToken,
    user: userKey,
    title,
    message,
    priority: String(priorityMap[priority] ?? 0),
  });
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Pushover error ${res.status}: ${JSON.stringify(data)}`);
  }
}

/* ── Main dispatcher ─────────────────────────────────────────────────────── */
export interface NotifyTicketOptions {
  id: number;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  priority: string;
}

export async function notifyNewTicket(ticket: NotifyTicketOptions): Promise<void> {
  const title = `[Ticket #${ticket.id}] ${ticket.subject}`;
  const body = [
    `From: ${ticket.name} <${ticket.email}>`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    ``,
    ticket.message.slice(0, 300) + (ticket.message.length > 300 ? "…" : ""),
  ].join("\n");

  const htmlBody = [
    `<b>New Support Ticket #${ticket.id}</b>`,
    `<b>From:</b> ${ticket.name} (${ticket.email})`,
    `<b>Category:</b> ${ticket.category}  |  <b>Priority:</b> ${ticket.priority}`,
    `<b>Subject:</b> ${ticket.subject}`,
    ``,
    ticket.message.slice(0, 400) + (ticket.message.length > 400 ? "…" : ""),
  ].join("\n");

  const jobs: Promise<void>[] = [];

  try {
    const [
      tgToken, tgChatId,
      ntfyTopic,
      discordUrl,
      poToken, poUser,
    ] = await Promise.all([
      getSetting("notif_telegram_token"),
      getSetting("notif_telegram_chat_id"),
      getSetting("notif_ntfy_topic"),
      getSetting("notif_discord_webhook"),
      getSetting("notif_pushover_token"),
      getSetting("notif_pushover_user"),
    ]);

    if (tgToken && tgChatId) {
      jobs.push(
        sendTelegram(tgToken, tgChatId, htmlBody).catch(e =>
          logger.warn({ err: e?.message }, "Telegram notification failed")
        )
      );
    }

    if (ntfyTopic) {
      jobs.push(
        sendNtfy(ntfyTopic, title, body, ticket.priority).catch(e =>
          logger.warn({ err: e?.message }, "ntfy notification failed")
        )
      );
    }

    if (discordUrl) {
      jobs.push(
        sendDiscord(discordUrl, title, body, ticket.priority).catch(e =>
          logger.warn({ err: e?.message }, "Discord notification failed")
        )
      );
    }

    if (poToken && poUser) {
      jobs.push(
        sendPushover(poToken, poUser, title, body, ticket.priority).catch(e =>
          logger.warn({ err: e?.message }, "Pushover notification failed")
        )
      );
    }

    await Promise.all(jobs);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "notifyNewTicket: settings fetch failed");
  }
}

/* ── Test notification ───────────────────────────────────────────────────── */
export async function sendTestNotification(channel: string, settings: Record<string, string>): Promise<{ success: boolean; error?: string }> {
  const title = "Orah Support — Test Notification";
  const body = "This is a test notification from Orah Admin Panel. Your alerts are working correctly!";

  try {
    if (channel === "telegram") {
      await sendTelegram(settings.token, settings.chatId, `<b>${title}</b>\n\n${body}`);
    } else if (channel === "ntfy") {
      await sendNtfy(settings.topic, title, body, "normal");
    } else if (channel === "discord") {
      await sendDiscord(settings.webhookUrl, title, body, "normal");
    } else if (channel === "pushover") {
      await sendPushover(settings.token, settings.userKey, title, body, "normal");
    } else {
      return { success: false, error: "Unknown channel" };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
