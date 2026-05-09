import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

/* Lightweight connectivity probe — no DB dependency, always 204 */
router.get("/ping", (_req, res) => {
  res.status(204).end();
});

export default router;
