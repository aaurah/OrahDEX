import { Router } from "express";

const router = Router();

router.get("/coinbase/onramp-config", (_req, res) => {
  const projectId = process.env.COINBASE_PROJECT_ID ?? "";
  if (!projectId) {
    res.json({ configured: false, projectId: null });
    return;
  }
  res.json({ configured: true, projectId });
});

export default router;
