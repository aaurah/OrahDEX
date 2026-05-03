import { Router } from "express";

const router = Router();

router.get("/coinbase/onramp-config", (_req, res) => {
  const projectId = process.env.COINBASE_PROJECT_ID ?? "";
  if (!projectId) {
    return res.status(503).json({ error: "Coinbase Onramp not configured", projectId: null });
  }
  res.json({ projectId });
});

export default router;
