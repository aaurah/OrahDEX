import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import router from "./routes";
import v1Router from "./routes/v1.js";
import { logger } from "./lib/logger";
import { startPriceUpdater } from "./lib/priceUpdater.js";
import { startLiquidityBot } from "./lib/liquidityBot.js";
import { startArbBot } from "./lib/arbBot.js";
import { startFuturesProfitEngine } from "./lib/futuresProfitEngine.js";
import { startBsvChainMonitor, getBsvChainStatus } from "./lib/bsvChainMonitor.js";
import { startBsvDepositWatcher } from "./lib/bsvDepositWatcher.js";
import { startEvmDepositWatcher } from "./lib/evmDepositWatcher.js";
import { startRouteCache } from "./lib/routeCache.js";
import { startHtlcWatcher } from "./lib/htlcWatcher.js";
import { startEvmHtlcWatcher } from "./lib/evmHtlc.js";
import { warmCurrenciesCache } from "./routes/letsexchange.js";
import { hydrateAdminTokens } from "./middleware/adminAuth.js";
import { startCopyOrchestrator } from "./lib/copyOrchestrator.js";
import { apiKeyAuth, startApiKeyCounterFlusher } from "./middleware/apiKeyAuth.js";
import { WebhookHandlers } from "./webhookHandlers.js";
import evmWebhookRouter from "./routes/evmWebhookRouter.js";
import { getHealthReport, startOrderReconciler } from "./lib/selfHealing.js";
import { startAllReconcilers } from "./lib/selfHealingReconcilers.js";
import { hydrateAlertsFromDB } from "./lib/alertBus.js";
import { startExchangeApiRepairEngine } from "./lib/exchangeApiRepairEngine.js";
import { startBsvIntentWatcher } from "./lib/bsvIntentWatcher.js";
import { pool } from "@workspace/db";

// Run the chain_id column migration at startup (idempotent — IF NOT EXISTS).
pool.query(`
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "chain_id" integer;
  CREATE INDEX IF NOT EXISTS "orders_chain_id_idx"
    ON "orders" ("chain_id")
    WHERE "chain_id" IS NOT NULL;
`).catch((err: Error) => logger.warn({ err: err.message }, "chain_id migration failed (non-fatal)"));
