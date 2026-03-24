import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startPriceUpdater } from "./lib/priceUpdater.js";
import { startLiquidityBot } from "./lib/liquidityBot.js";
import { startFuturesProfitEngine } from "./lib/futuresProfitEngine.js";
import { startBsvChainMonitor, getBsvChainStatus } from "./lib/bsvChainMonitor.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

startPriceUpdater();
startLiquidityBot();
startFuturesProfitEngine();
startBsvChainMonitor();

/* ── Connectivity ping — returns 204, used by frontend status dot ────────── */
app.get("/api/ping", (_req, res) => {
  res.status(204).end();
});

/* ── Health check — returns system status ────────────────────────────────── */
app.get("/api/health", async (_req, res) => {
  try {
    const bsv = await getBsvChainStatus();
    res.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      bsvChain: { online: bsv.online, blockHeight: bsv.blockHeight },
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  }
});

/* ── BSV chain status — public endpoint ─────────────────────────────────── */
app.get("/api/bsv-status", async (_req, res) => {
  try {
    res.json(await getBsvChainStatus());
  } catch {
    res.status(500).json({ online: false, blockHeight: 0 });
  }
});

export default app;
