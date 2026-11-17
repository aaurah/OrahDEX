import { Router, type IRouter } from "express";
import { sweepTreasury } from "../lib/treasurySweep.js";
import { requireAdminToken } from "../middleware/adminAuth.js";

const router: IRouter = Router();

// POST /api/admin/treasury/sweep?dryRun=1 → report only
// POST /api/admin/treasury/sweep        → execute (respects threshold)
router.post("/admin/treasury/sweep", requireAdminToken, async (req, res) => {
  try {
    const dry = String(req.query.dryRun ?? "") === "1" || (req.body as any)?.dryRun === true;
    res.json(await sweepTreasury(dry));
  } catch (e: any) {
    res.status(500).json({ error: "sweep failed", detail: String(e?.message ?? e) });
  }
});

export default router;
