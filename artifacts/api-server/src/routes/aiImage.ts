/**
 * aiImage.ts — AI image generation for the social Create-Post flow.
 * Uses gpt-image-1 via the Replit AI Integrations OpenAI proxy.
 * Returns a base64 data-URL the client can drop directly into <img>.
 */
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const MAX_PROMPT = 1000;
type Size = "1024x1024" | "1024x1536" | "1536x1024";
const VALID_SIZES = new Set<Size>(["1024x1024", "1024x1536", "1536x1024"]);

// Strict per-IP throttle — gpt-image-1 is expensive (~$0.04/image).
const aiImageLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: "Too many image requests — please wait a minute." }),
});

router.post("/social/ai/image", aiImageLimiter, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const promptRaw = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const sizeRaw   = typeof body.size   === "string" ? body.size : "1024x1024";

    if (!promptRaw) { res.status(400).json({ error: "prompt is required" }); return; }
    if (promptRaw.length > MAX_PROMPT) {
      res.status(400).json({ error: `prompt must be ≤ ${MAX_PROMPT} chars` });
      return;
    }
    const size: Size = VALID_SIZES.has(sizeRaw as Size) ? (sizeRaw as Size) : "1024x1024";

    const buf = await generateImageBuffer(promptRaw, size);
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    res.json({ image: dataUrl, size });
  } catch (err: any) {
    // Log full detail server-side; return a generic message to clients to avoid
    // leaking upstream provider internals or auth diagnostics.
    logger.error({ err: err?.message, stack: err?.stack }, "AI image generation failed");
    const status = err?.status === 400 ? 400 : 500;
    const safeMsg = status === 400
      ? "Prompt rejected. Try rephrasing without disallowed content."
      : "Image generation is temporarily unavailable. Please try again.";
    res.status(status).json({ error: safeMsg });
  }
});

export default router;
