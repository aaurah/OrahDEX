/**
 * treasurySweep.ts — Sweeps on-platform custody fees to the operator's private EVM wallet.
 * Only sweeps CONFIRMED, unswept, on-platform fee rows (spot/AMM/P2P/LP/copy/withdrawal/buy).
 * Bridge affiliate commissions are venue-owed and are NOT sweepable — collect those
 * from each venue's partner dashboard. v1 sweeps native BNB (gas-cheap); token sweeps later.
 */
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { db, pool } from "@workspace/db";
import { keeperEarningsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { getOrCreateEvmHotWallet } from "./exchangeHotWallet.js";

const PAYOUT   = (process.env.TREASURY_PAYOUT_ADDRESS ?? "").trim();
const MIN_USD  = parseFloat(process.env.SWEEP_MIN_USD ?? "20");
const AUTO     = process.env.TREASURY_AUTO_SWEEP === "1";
const RPC      = process.env.TREASURY_SWEEP_RPC_URL ?? "https://bsc-dataseed.binance.org";
const RESERVE  = 5_000_000_000_000_000n; // keep 0.005 BNB for gas
const SOURCES  = ["orderbook", "swap", "p2p", "lp_spread", "withdrawal", "buy", "copy_trade"];

export async function sweepTreasury(dryRun: boolean) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(PAYOUT)) {
    return { configured: false, hint: "Set TREASURY_PAYOUT_ADDRESS in artifacts/api-server/.env" };
  }
  const rows = await db.select().from(keeperEarningsTable).where(and(
    eq(keeperEarningsTable.walletAddress, "EXCHANGE_TREASURY"),
    inArray(keeperEarningsTable.source, SOURCES),
    eq(keeperEearningsFix(), ""),
  ));
  const dueUsd = rows.reduce((a, r) => a + parseFloat(r.amount), 0);
  const hot = await getOrCreateEvmHotWallet();
  const client = createWalletClient({ account: privateKeyToAccount(hot.privKeyHex), chain: bsc, transport: http(RPC) });
  const bal = await client.getBalance({ address: hot.address });
  const sendable = bal > RESERVE ? bal - RESERVE : 0n;

  const base = { configured: true, payout: PAYOUT, dueUsd: +dueUsd.toFixed(2), unsweptRows: rows.length, hotBalanceBnb: (Number(bal) / 1e18).toFixed(4), sendableBnb: (Number(sendable) / 1e18).toFixed(4), dryRun };
  if (dryRun) return { ...base, action: "dry-run only" };
  if (dueUsd < MIN_USD) return { ...base, action: "skipped", reason: `below $${MIN_USD} threshold` };
  if (sendable <= 0n)   return { ...base, action: "skipped", reason: "no sweepable BNB above gas reserve" };

  const hash = await client.sendTransaction({ to: PAYOUT as `0x${string}`, value: sendable });
  await db.update(keeperEarningsTable).set({ sweptTx: hash }).where(and(
    eq(keeperEarningsTable.walletAddress, "EXCHANGE_TREASURY"),
    inArray(keeperEarningsTable.source, SOURCES),
    eq(keeperEearningsFix(), ""),
  ));
  logger.info({ hash, dueUsd, sendableBnb: base.sendableBnb }, "treasury: swept to payout wallet");
  return { ...base, action: "swept", sweptTx: hash };
}

// drizzle column accessor (sweptTx, empty = unswept)
function keeperEearningsFix(): any { return (keeperEarningsTable as any).sweptTx; }

// Periodic check: log when a sweep is due; auto-sweep only if TREASURY_AUTO_SWEEP=1
setInterval(() => {
  sweepTreasury(!AUTO).then(r => {
    if (r.configured && (r as any).dueUsd >= MIN_USD) logger.info(r, "treasury: sweep due");
  }).catch(() => {});
}, 6 * 60 * 60 * 1000).unref?.();
