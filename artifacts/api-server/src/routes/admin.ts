import { Router } from "express";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { getWatcherState, getWatcherSummary } from "../lib/errorWatcher.js";

import { generateAdminToken, revokeAllAdminTokens, requireAdminToken } from "../middleware/adminAuth.js";
// Note: generateAdminToken and revokeAllAdminTokens are now async (DB-persisted)
import { marketsTable, platformSettingsTable, adminEmailsTable, ordersTable, tradesTable, walletsTable, conversations, messages, leSwapsTable, routingProfilesTable, keeperEarningsTable } from "@workspace/db/schema";
import { invalidatePairConfigCache } from "../lib/hybridRouter.js";
import { invalidateCnKeyCache } from "../lib/changenow.js";
import { invalidateSzKeyCache } from "../lib/swapzone.js";
import { invalidateLetsExchangeCredentialCache } from "../lib/lePriceCache.js";
import { eq, desc, and, sql, ne, isNotNull, or, like, ilike, sum, gte, count } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { getOrCreateWallet, fetchWalletBalance, privKeyToWif, privKeyToAddress, privKeyToPubKey, buildAndBroadcastBsvTx, isBsvAddress } from "../lib/bsvWallet.js";
import { getEvmHotWalletAddress, getOrCreateEvmHotWallet } from "../lib/exchangeHotWallet.js";
import { decrypt as decryptEvmKey } from "../lib/internalEvmWallet.js";
import { createPublicClient, createWalletClient, http as viemHttp, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sendMail, testSmtpConnection, getSmtpStatus, autoSetupTestEmail } from "../lib/mailer.js";
import { updateMarketPrices, syncAllLEPairs } from "../lib/priceUpdater.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";
import { logger } from "../lib/logger.js";
import { parseUnits, mulDiv, pow10 } from "../lib/money.js";
import {
  buildFilterFunction,
  WATCHED_CONTRACTS,
  TOPIC_HTLC_LOCKED,
  TOPIC_HTLC_REVEALED,
  TOPIC_HTLC_REFUNDED,
  TOPIC_ESCROW_RELEASED,
  logTopics,
} from "../lib/evmWebhook.js";
import { getAllChains, saveCustomChain, removeCustomChain } from "../lib/chainRegistry.js";

/* ─── SERVICE STATE TRACKING ─────────────────────────────────────────────── */
export { serviceState } from "../lib/serviceState.js";
import { serviceState, logIncident } from "../lib/serviceState.js";

export function recordServiceEvent(service: string, level: "info"|"warn"|"error", msg: string) {
  logIncident(level, service, msg);
}

const router = Router();
