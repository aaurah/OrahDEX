import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

// ─── Postmark HTTP API ────────────────────────────────────────────────────────
// Used when POSTMARK_SERVER_TOKEN env var is present. Takes priority over SMTP.

const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM  = "support@orahdex.org";

async function sendViaPostmark(opts: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_TOKEN!,
    },
    body: JSON.stringify({
      From:          opts.from || POSTMARK_FROM,
      To:            opts.to,
      Subject:       opts.subject,
      TextBody:      opts.text,
      HtmlBody:      opts.html ?? opts.text.replace(/\n/g, "<br>"),
      MessageStream: "outbound",
    }),
  });

  const data = await res.json() as { MessageID?: string; ErrorCode?: number; Message?: string };

  if (!res.ok || data.ErrorCode) {
    return { success: false, error: data.Message ?? `Postmark error ${res.status}` };
  }

  return { success: true, messageId: data.MessageID };
}

// ─── SMTP (nodemailer) fallback ───────────────────────────────────────────────

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await db.select().from(platformSettingsTable);
  const get = (key: string) => rows.find(r => r.key === key)?.value ?? "";

  const host    = get("smtp_host");
  const user    = get("smtp_user");
  const pass    = get("smtp_pass");
  const from    = get("smtp_from") || user;
  const portStr = get("smtp_port");
  const port    = portStr ? parseInt(portStr) : 587;

  if (!host || !user || !pass) return null;

  return { host, port, secure: port === 465, user, pass, from: from || user };
}

function createTransporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendMail(opts: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  // Postmark takes priority when token is configured
  if (POSTMARK_TOKEN) {
    return sendViaPostmark(opts);
  }

  // Fall back to SMTP
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return {
        success: false,
        error: "Email not configured. Set POSTMARK_SERVER_TOKEN or go to Admin → Integrations → Email.",
      };
    }

    const transporter  = createTransporter(cfg);
    const mailOptions: SendMailOptions = {
      from:    `"OrahDEX" <${opts.from || cfg.from}>`,
      to:      opts.to,
      subject: opts.subject,
      text:    opts.text,
      html:    opts.html ?? opts.text.replace(/\n/g, "<br>"),
    };

    const info       = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    return { success: true, messageId: info.messageId, previewUrl: previewUrl as string | undefined };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "SMTP send failed" };
  }
}

export async function testSmtpConnection(): Promise<MailResult> {
  if (POSTMARK_TOKEN) {
    // Verify Postmark token by sending to the bounce-testing address
    const res = await sendViaPostmark({
      from:    POSTMARK_FROM,
      to:      POSTMARK_FROM,
      subject: "OrahDEX — Postmark connection test",
      text:    "This is an automated connection test from OrahDEX admin panel.",
    });
    return res;
  }

  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return {
        success: false,
        error: "Email not configured. Set POSTMARK_SERVER_TOKEN or click 'Generate Free Test Account'.",
      };
    }
    const transporter = createTransporter(cfg);
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "SMTP connection failed" };
  }
}

export async function getSmtpStatus(): Promise<{
  configured: boolean;
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  secure?: boolean;
  isTestAccount?: boolean;
  provider?: string;
}> {
  if (POSTMARK_TOKEN) {
    return {
      configured: true,
      host:       "api.postmarkapp.com",
      from:       POSTMARK_FROM,
      provider:   "postmark",
      isTestAccount: false,
    };
  }

  const cfg = await getSmtpConfig();
  if (!cfg) return { configured: false };
  return {
    configured: true,
    host:       cfg.host,
    port:       cfg.port,
    user:       cfg.user,
    from:       cfg.from,
    secure:     cfg.secure,
    isTestAccount: cfg.host === "smtp.ethereal.email",
  };
}

export async function autoSetupTestEmail(): Promise<{ user: string; pass: string; host: string; port: number; from: string }> {
  const testAccount = await nodemailer.createTestAccount();

  const settings = [
    { key: "smtp_host", value: "smtp.ethereal.email" },
    { key: "smtp_port", value: "587" },
    { key: "smtp_user", value: testAccount.user },
    { key: "smtp_pass", value: testAccount.pass },
    { key: "smtp_from", value: testAccount.user },
  ];

  for (const { key, value } of settings) {
    await db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  }

  return {
    user: testAccount.user,
    pass: testAccount.pass,
    host: "smtp.ethereal.email",
    port: 587,
    from: testAccount.user,
  };
}
