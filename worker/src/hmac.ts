import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time HMAC-SHA256 verification.
 * Accepts signatures with or without the "sha256=" prefix, hex or base64.
 * Single canonical header only (x-webhook-signature) — the dual-header
 * surface from the Express server is intentionally not carried over.
 */
export function verifyWebhookSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !secret) return false;
  const sig = signatureHeader.trim().replace(/^sha256=/i, "");
  if (!sig) return false;

  const sigBuf = Buffer.from(sig, "utf8");

  // Hex-encoded digest candidate
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const hexBuf = Buffer.from(hex, "utf8");
  if (hexBuf.length === sigBuf.length && timingSafeEqual(hexBuf, sigBuf)) {
    return true;
  }

  // Base64-encoded raw digest candidate
  const b64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const b64Buf = Buffer.from(b64, "utf8");
  if (b64Buf.length === sigBuf.length && timingSafeEqual(b64Buf, sigBuf)) {
    return true;
  }

  return false;
}

export function extractEventId(rawBody: string, idField: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed === "object" && parsed !== null) {
      const id = (parsed as Record<string, unknown>)[idField];
      if (typeof id === "string" && id.length > 0 && id.length <= 128) return id;
    }
  } catch {
    /* not JSON — id stays null */
  }
  return null;
}
