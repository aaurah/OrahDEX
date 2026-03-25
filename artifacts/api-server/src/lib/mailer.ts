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
      return { success: false, error: "SMTP not configured. Go to Admin → Setup → Step D to add your mail server settings." };
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
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "SMTP send failed" };
  }
}

export async function testSmtpConnection(): Promise<MailResult> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return { success: false, error: "SMTP not configured. Add smtp_host, smtp_user, smtp_pass in Integrations." };
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
  };
}
