import { Router } from "express";
import { logger } from "../lib/logger.js";
import {
  isAwsConfigured,
  getS3BucketName,
  getS3AccessPoint,
  s3Upload,
  s3Download,
  s3Delete,
  s3Exists,
  s3List,
  s3PresignedGetUrl,
  s3PresignedPutUrl,
  sesSendMail,
} from "../lib/awsClient.js";

const router = Router();

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/aws/status", (_req, res) => {
  const ap = getS3AccessPoint();
  res.json({
    configured:  isAwsConfigured(),
    region:      process.env.AWS_REGION ?? "us-east-1",
    bucket:      process.env.AWS_S3_BUCKET || null,
    accessPoint: ap || null,
    s3Target:    getS3BucketName() || null,
  });
});

// ─── S3: list objects ─────────────────────────────────────────────────────────

router.get("/aws/s3/list", async (req, res) => {
  const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
  const result = await s3List(prefix);
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ keys: result.keys });
});

// ─── S3: check existence ──────────────────────────────────────────────────────

router.get("/aws/s3/exists", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) return void res.status(400).json({ error: "key required" });
  const exists = await s3Exists(key);
  res.json({ exists });
});

// ─── S3: upload (server-side, body forwarded) ─────────────────────────────────
// For large files prefer the presigned PUT URL approach instead.

router.post("/aws/s3/upload", async (req, res) => {
  const key         = typeof req.query.key === "string"         ? req.query.key         : "";
  const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "application/octet-stream";
  const isPublic    = req.query.public === "true";

  if (!key) return void res.status(400).json({ error: "key query param required" });

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > 20 * 1024 * 1024) {
        return void res.status(413).json({ error: "Upload exceeds the 20 MB server-upload limit; use a presigned upload URL." });
      }
      chunks.push(buffer);
    }
    const result = await s3Upload({ key, body: Buffer.concat(chunks), contentType, public: isPublic });
    if (!result.ok) return void res.status(500).json({ error: result.error });
    res.json({ ok: true, key: result.key, url: result.url ?? null });
  } catch (err) {
    logger.warn({ err }, "aws/s3/upload: request or storage error");
    if (!res.headersSent) res.status(500).json({ error: "Upload failed" });
  }
});

// ─── S3: download (proxy through server) ─────────────────────────────────────

router.get("/aws/s3/download", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) return void res.status(400).json({ error: "key required" });

  const result = await s3Download(key);
  if (!result.ok) return void res.status(500).json({ error: result.error });

  res.setHeader("Content-Type", result.contentType ?? "application/octet-stream");
  const filename = (key.split("/").pop() || "download").replace(/[\r\n"]/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(result.data);
});

// ─── S3: delete ───────────────────────────────────────────────────────────────

router.delete("/aws/s3/delete", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) return void res.status(400).json({ error: "key required" });

  const result = await s3Delete(key);
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ ok: true });
});

// ─── S3: presigned GET URL (temporary access to private object) ───────────────

router.get("/aws/s3/presign/get", async (req, res) => {
  const key     = typeof req.query.key === "string"     ? req.query.key     : "";
  const requestedExpires = typeof req.query.expires === "string" ? Number.parseInt(req.query.expires, 10) : 3600;
  const expires = Number.isFinite(requestedExpires) ? Math.max(1, Math.min(requestedExpires, 3600)) : 3600;
  if (!key) return void res.status(400).json({ error: "key required" });

  const result = await s3PresignedGetUrl(key, expires);
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ url: result.url });
});

// ─── S3: presigned PUT URL (direct browser → S3 upload, bypasses API server) ──

router.post("/aws/s3/presign/put", async (req, res) => {
  const { key, contentType, expires } = (req.body ?? {}) as {
    key: string;
    contentType?: string;
    expires?: number;
  };
  if (!key) return void res.status(400).json({ error: "key required" });
  const safeExpires = typeof expires === "number" && Number.isFinite(expires)
    ? Math.max(1, Math.min(Math.floor(expires), 3600))
    : 900;

  const result = await s3PresignedPutUrl(
    key,
    contentType ?? "application/octet-stream",
    safeExpires,
  );
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ url: result.url, key });
});

// ─── SES: send email ──────────────────────────────────────────────────────────

router.post("/aws/ses/send", async (req, res) => {
  const { from, to, subject, text, html } = req.body as {
    from: string;
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
  };

  if (!from || !to || !subject || !text) {
    return void res.status(400).json({ error: "from, to, subject, text are required" });
  }

  const result = await sesSendMail({ from, to, subject, text, html });
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ ok: true, messageId: result.messageId });
});

// ─── SES: test (send to self) ─────────────────────────────────────────────────

router.post("/aws/ses/test", async (req, res) => {
  const from = (req.body as any)?.from ?? "support@orahdex.com";
  const result = await sesSendMail({
    from,
    to:      from,
    subject: "OrahDEX — AWS SES connection test",
    text:    "This is an automated SES connection test from OrahDEX admin panel.",
  });
  if (!result.ok) return void res.status(500).json({ error: result.error });
  res.json({ ok: true, messageId: result.messageId });
});

export default router;
