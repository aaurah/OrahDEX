import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 30_000).unref();

export function createRateLimit(options: RateLimitOptions) {
  const keyGenerator = options.keyGenerator ?? ((req: Request) => `${req.ip ?? "unknown"}:${req.path}`);

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyGenerator(req);
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "Too many requests. Please try again shortly." });
      return;
    }

    existing.count += 1;
    next();
  };
}
