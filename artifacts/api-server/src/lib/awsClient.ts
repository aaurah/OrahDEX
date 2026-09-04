import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const AWS_REGION          = process.env.AWS_REGION           ?? "us-east-1";
const AWS_S3_BUCKET       = process.env.AWS_S3_BUCKET        ?? "";
// Access point alias takes priority over raw bucket name — same API, separate IAM policy surface.
const AWS_S3_ACCESS_POINT = process.env.AWS_S3_ACCESS_POINT  ?? "";
const AWS_KEY_ID          = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY      = process.env.AWS_SECRET_ACCESS_KEY;

// Resolved target: access point alias when set, otherwise raw bucket name.
const S3_TARGET = AWS_S3_ACCESS_POINT || AWS_S3_BUCKET;

if (!AWS_KEY_ID || !AWS_SECRET_KEY) {
  logger.warn("awsClient: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — AWS features disabled");
}

const credentials = AWS_KEY_ID && AWS_SECRET_KEY
  ? { accessKeyId: AWS_KEY_ID, secretAccessKey: AWS_SECRET_KEY }
  : undefined;

// ─── Clients (lazy singletons) ────────────────────────────────────────────────

let _s3: S3Client | null = null;
let _ses: SESClient | null = null;

export function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: AWS_REGION, credentials });
  }
  return _s3;
}

export function getSesClient(): SESClient {
  if (!_ses) {
    _ses = new SESClient({ region: AWS_REGION, credentials });
  }
  return _ses;
}

export function isAwsConfigured(): boolean {
  return !!(AWS_KEY_ID && AWS_SECRET_KEY);
}

export function getS3BucketName(): string {
  return S3_TARGET;
}

export function getS3AccessPoint(): string {
  return AWS_S3_ACCESS_POINT;
}

// ─── S3 Helpers ───────────────────────────────────────────────────────────────

export interface S3UploadOptions {
  bucket?: string;
  key: string;
  body: Buffer | Uint8Array | string | ReadableStream;
  contentType?: string;
  metadata?: Record<string, string>;
  /** If true, object is publicly readable */
  public?: boolean;
}

export interface S3UploadResult {
  ok: boolean;
  url?: string;
  key?: string;
  error?: string;
}

/** Upload a file to S3 (streams supported — uses multipart for large files) */
export async function s3Upload(opts: S3UploadOptions): Promise<S3UploadResult> {
  const bucket = opts.bucket ?? S3_TARGET;
  if (!bucket) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket:      bucket,
        Key:         opts.key,
        Body:        opts.body as any,
        ContentType: opts.contentType ?? "application/octet-stream",
        Metadata:    opts.metadata,
        ACL:         opts.public ? "public-read" : undefined,
      },
    });

    await upload.done();

    const url = opts.public
      ? `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${opts.key}`
      : undefined;

    logger.info({ bucket, key: opts.key }, "s3Upload: success");
    return { ok: true, key: opts.key, url };
  } catch (err: any) {
    logger.warn({ err, bucket, key: opts.key }, "s3Upload: failed");
    return { ok: false, error: err?.message ?? "S3 upload failed" };
  }
}

/** Download an object from S3 as a Buffer */
export async function s3Download(key: string, bucket?: string): Promise<{ ok: boolean; data?: Buffer; contentType?: string; error?: string }> {
  const b = bucket ?? S3_TARGET;
  if (!b) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    const cmd = new GetObjectCommand({ Bucket: b, Key: key });
    const res  = await getS3Client().send(cmd);
    const body = res.Body as any;
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    return {
      ok:          true,
      data:        Buffer.concat(chunks),
      contentType: res.ContentType,
    };
  } catch (err: any) {
    logger.warn({ err, key }, "s3Download: failed");
    return { ok: false, error: err?.message ?? "S3 download failed" };
  }
}

/** Delete an object from S3 */
export async function s3Delete(key: string, bucket?: string): Promise<{ ok: boolean; error?: string }> {
  const b = bucket ?? S3_TARGET;
  if (!b) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: b, Key: key }));
    logger.info({ bucket: b, key }, "s3Delete: success");
    return { ok: true };
  } catch (err: any) {
    logger.warn({ err, key }, "s3Delete: failed");
    return { ok: false, error: err?.message ?? "S3 delete failed" };
  }
}

/** Check if an S3 object exists */
export async function s3Exists(key: string, bucket?: string): Promise<boolean> {
  const b = bucket ?? S3_TARGET;
  if (!b || !isAwsConfigured()) return false;

  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: b, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** List objects in S3 with optional prefix */
export async function s3List(prefix?: string, bucket?: string): Promise<{ ok: boolean; keys?: string[]; error?: string }> {
  const b = bucket ?? S3_TARGET;
  if (!b) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    const res = await getS3Client().send(
      new ListObjectsV2Command({ Bucket: b, Prefix: prefix })
    );
    const keys = (res.Contents ?? []).map(obj => obj.Key!).filter(Boolean);
    return { ok: true, keys };
  } catch (err: any) {
    logger.warn({ err, prefix }, "s3List: failed");
    return { ok: false, error: err?.message ?? "S3 list failed" };
  }
}

/**
 * Generate a pre-signed URL for temporary GET access to a private object.
 * @param expiresInSeconds default 3600 (1 hour)
 */
export async function s3PresignedGetUrl(key: string, expiresInSeconds = 3600, bucket?: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const b = bucket ?? S3_TARGET;
  if (!b) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    const cmd = new GetObjectCommand({ Bucket: b, Key: key });
    const url = await getSignedUrl(getS3Client(), cmd, { expiresIn: expiresInSeconds });
    return { ok: true, url };
  } catch (err: any) {
    logger.warn({ err, key }, "s3PresignedGetUrl: failed");
    return { ok: false, error: err?.message ?? "S3 presign failed" };
  }
}

/**
 * Generate a pre-signed URL for temporary PUT (upload) access.
 * Useful for letting the frontend upload directly to S3 without going through the API server.
 */
export async function s3PresignedPutUrl(key: string, contentType: string, expiresInSeconds = 900, bucket?: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const b = bucket ?? S3_TARGET;
  if (!b) return { ok: false, error: "S3 target not configured (set AWS_S3_ACCESS_POINT or AWS_S3_BUCKET)" };
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  try {
    const cmd = new PutObjectCommand({ Bucket: b, Key: key, ContentType: contentType });
    const url = await getSignedUrl(getS3Client(), cmd, { expiresIn: expiresInSeconds });
    return { ok: true, url };
  } catch (err: any) {
    logger.warn({ err, key }, "s3PresignedPutUrl: failed");
    return { ok: false, error: err?.message ?? "S3 presign failed" };
  }
}

// ─── SES Helpers ──────────────────────────────────────────────────────────────

export interface SesMailOptions {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SesMailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Send an email via AWS SES */
export async function sesSendMail(opts: SesMailOptions): Promise<SesMailResult> {
  if (!isAwsConfigured()) return { ok: false, error: "AWS credentials not configured" };

  const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to];

  try {
    const cmd = new SendEmailCommand({
      Source: opts.from,
      Destination: { ToAddresses: toAddresses },
      Message: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: opts.text, Charset: "UTF-8" },
          Html: { Data: opts.html ?? opts.text.replace(/\n/g, "<br>"), Charset: "UTF-8" },
        },
      },
    });

    const res = await getSesClient().send(cmd);
    logger.info({ messageId: res.MessageId, to: toAddresses }, "sesSendMail: sent");
    return { ok: true, messageId: res.MessageId };
  } catch (err: any) {
    logger.warn({ err, to: toAddresses }, "sesSendMail: failed");
    return { ok: false, error: err?.message ?? "SES send failed" };
  }
}
