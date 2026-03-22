import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import marketsRouter from "./markets.js";
import ordersRouter from "./orders.js";
import tradesRouter from "./trades.js";
import portfolioRouter from "./portfolio.js";
import futuresRouter from "./futures.js";
import adminRouter from "./admin.js";
import dexRouter from "./dex.js";
import globalMarketsRouter from "./globalMarkets.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketsRouter);
router.use(ordersRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(futuresRouter);
router.use(dexRouter);
router.use("/admin", adminRouter);
router.use("/global-markets", globalMarketsRouter);

export default router;
