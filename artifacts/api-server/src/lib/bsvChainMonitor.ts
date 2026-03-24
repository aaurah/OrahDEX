/**
 * BSV Chain Monitor — OrahDEX
 *
 * Polls the WhatsOnChain public API every 60 s to retrieve the live
 * BSV mainnet block height, hash, and difficulty.  Persists the data
 * in platformSettingsTable so any route can read it without re-fetching.
 *
 * WhatsOnChain public endpoints used (no API key required):
 *   GET https://api.whatsonchain.com/v1/bsv/main/chain/info
 */

import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const WOC_CHAIN_INFO = "https://api.whatsonchain.com/v1/bsv/main/chain/info";
const TIMEOUT_MS = 10_000;

export interface BsvChainStatus {
  online: boolean;
  blockHeight: number;
  bestBlockHash: string;
  difficulty: number;
  medianTime: number;
  lastChecked: string;
  explorerUrl: string;
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function fetchChainInfo(): Promise<void> {
  let online = false;
  let blockHeight = 0;
  let bestBlockHash = "";
  let difficulty = 0;
  let medianTime = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(WOC_CHAIN_INFO, {
      signal: controller.signal,
      headers: { "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      blockHeight   = (data["blocks"]      as number) || 0;
      bestBlockHash = (data["bestblockhash"] as string) || "";
      difficulty    = (data["difficulty"]  as number) || 0;
      medianTime    = (data["mediantime"]  as number) || 0;
      online = blockHeight > 0;

      logger.info({ blockHeight, difficulty }, "BSV chain monitor: chain info updated");
    } else {
      logger.warn({ status: res.status }, "BSV chain monitor: WoC returned non-200");
    }
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : String(err);
    if (name === "AbortError") {
      logger.warn("BSV chain monitor: request timed out");
    } else {
      logger.warn({ err }, "BSV chain monitor: fetch error");
    }
  }

  const now = new Date().toISOString();
  await setSetting("bsv_chain_online",      String(online));
  await setSetting("bsv_block_height",      String(blockHeight));
  await setSetting("bsv_best_block_hash",   bestBlockHash);
  await setSetting("bsv_difficulty",        String(difficulty));
  await setSetting("bsv_median_time",       String(medianTime));
  await setSetting("bsv_last_checked",      now);
}

export async function getBsvChainStatus(): Promise<BsvChainStatus> {
  const online      = (await getSetting("bsv_chain_online"))    === "true";
  const blockHeight = parseInt((await getSetting("bsv_block_height"))  ?? "0") || 0;
  const bestBlockHash = (await getSetting("bsv_best_block_hash")) ?? "";
  const difficulty  = parseFloat((await getSetting("bsv_difficulty"))  ?? "0") || 0;
  const medianTime  = parseInt((await getSetting("bsv_median_time"))   ?? "0") || 0;
  const lastChecked = (await getSetting("bsv_last_checked")) ?? new Date().toISOString();

  return {
    online,
    blockHeight,
    bestBlockHash,
    difficulty,
    medianTime,
    lastChecked,
    explorerUrl: bestBlockHash
      ? `https://whatsonchain.com/block/${bestBlockHash}`
      : "https://whatsonchain.com",
  };
}

export function startBsvChainMonitor(): void {
  logger.info("BSV chain monitor starting — polling WhatsonChain every 60 s");
  fetchChainInfo();
  setInterval(fetchChainInfo, 60_000);
}
