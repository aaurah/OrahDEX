import { rateLimit } from "express-rate-limit";

// A shared limiter keeps requests across the Ora widgets and full chat page
// under one budget, which matters when they use the same local model process.
export const aiChatRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many chat requests. Please wait a minute and try again." });
  },
});
