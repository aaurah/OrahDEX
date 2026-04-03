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

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await db.select().from(platformSettingsTable);
  const get = (key: string) => rows.find(r => r.key === key)?.value ?? "";

  const host = get("smtp_host");
  const user = get("smtp_user");
  const pass = get("smtp_pass");
  const from = get("smtp_from") || user;
  const portStr = get("smtp_port");
  const port = portStr ? parseInt(portStr) : 587;

  if (!host || !user || !pass) return null;

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: from || user,
  };
}

function createTransporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

export async function sendMail(opts: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return { success: false, error: "Email not configured. Go to Admin → Integrations → Email and click 'Generate Free Test Account' or enter your SMTP details." };
    }

    const transporter = createTransporter(cfg);

    const mailOptions: SendMailOptions = {
      from: `"OrahDEX" <${opts.from || cfg.from}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? opts.text.replace(/\n/g, "<br>"),
    };

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    return { success: true, messageId: info.messageId, previewUrl: previewUrl as string | undefined };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "SMTP send failed" };
  }
}

export async function testSmtpConnection(): Promise<MailResult> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return { success: false, error: "Email not configured. Click 'Generate Free Test Account' in Admin → Integrations → Email to set up instantly." };
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
}> {
  const cfg = await getSmtpConfig();
  if (!cfg) return { configured: false };
  return {
    configured: true,
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    from: cfg.from,
    secure: cfg.secure,
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
