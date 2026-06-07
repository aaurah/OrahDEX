/**
 * chainRegistry.ts — Dynamic EVM chain registry for OrahDEX
 *
 * Stores custom EVM chains (L2/L3) in the platform_settings table under the
 * key "custom_evm_chains". Custom chains are cached for 60 seconds to avoid
 * hitting the DB on every request.
 *
 * Usage:
 *   - getCustomChains()      — load custom chains from DB (cached 60 s)
 *   - saveCustomChain(chain) — persist a new chain to DB & invalidate cache
 *   - removeCustomChain(id)  — remove a chain by chainId & invalidate cache
 *   - getAllChains()          — merge hardcoded EVM_CHAINS + custom chains
 */

import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { EVM_CHAINS, type ChainConfig } from "./evmHtlc.js";

// ── Settings DB key ────────────────────────────────────────────────────────────

const CUSTOM_CHAINS_KEY = "custom_evm_chains";

// ── Public interface for custom chain entries ──────────────────────────────────

export interface CustomChainConfig {
  chainId:       number;
  name:          string;
  rpcUrl:        string;
  nativeSymbol:  string;
  blockExplorer: string;
  usdtAddress?:  string;
  usdcAddress?:  string;
  escrowAddress?: string;
}

// ── In-memory cache ────────────────────────────────────────────────────────────

let _cache:     CustomChainConfig[] | null = null;
let _cacheTime: number = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

function isCacheValid(): boolean {
  return _cache !== null && Date.now() - _cacheTime < CACHE_TTL_MS;
}

function invalidateCache(): void {
  _cache     = null;
  _cacheTime = 0;
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function readFromDb(): Promise<CustomChainConfig[]> {
  const rows = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, CUSTOM_CHAINS_KEY));
  if (!rows.length) return [];
  try {
    return JSON.parse(rows[0].value) as CustomChainConfig[];
  } catch {
    return [];
  }
}

async function writeToDb(chains: CustomChainConfig[]): Promise<void> {
  const value = JSON.stringify(chains);
  await db
    .insert(platformSettingsTable)
    .values({ key: CUSTOM_CHAINS_KEY, value })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set:    { value, updatedAt: new Date() },
    });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Load custom EVM chains from the database.
 * Result is cached for 60 seconds.
 */
export async function getCustomChains(): Promise<CustomChainConfig[]> {
  if (isCacheValid()) return _cache!;
  _cache     = await readFromDb();
  _cacheTime = Date.now();
  return _cache;
}

/**
 * Persist a new (or updated) custom EVM chain to the database.
 * If a chain with the same chainId already exists it is overwritten.
 * Cache is invalidated immediately.
 */
export async function saveCustomChain(chain: CustomChainConfig): Promise<void> {
  const chains = await readFromDb();
  const idx    = chains.findIndex(c => c.chainId === chain.chainId);
  if (idx >= 0) {
    chains[idx] = chain;
  } else {
    chains.push(chain);
  }
  await writeToDb(chains);
  invalidateCache();
}

/**
 * Remove a custom EVM chain by chainId.
 * Silently succeeds if the chainId does not exist.
 * Cache is invalidated immediately.
 */
export async function removeCustomChain(chainId: number): Promise<void> {
  const chains  = await readFromDb();
  const updated = chains.filter(c => c.chainId !== chainId);
  await writeToDb(updated);
  invalidateCache();
}

/**
 * Return a merged Map of all chains: hardcoded EVM_CHAINS first, then any
 * custom chains from the database. Custom chains with the same chainId as a
 * hardcoded chain will override it (the custom entry wins so admins can patch
 * RPC URLs, escrow addresses, etc.).
 */
export async function getAllChains(): Promise<Map<number, ChainConfig>> {
  const result  = new Map<number, ChainConfig>(
    Object.entries(EVM_CHAINS).map(([k, v]) => [Number(k), v]),
  );

  const customs = await getCustomChains();
  for (const c of customs) {
    result.set(c.chainId, {
      chainId:         c.chainId,
      name:            c.name,
      rpcUrl:          c.rpcUrl,
      nativeSymbol:    c.nativeSymbol,
      blockExplorer:   c.blockExplorer,
      // contractAddress holds the escrowAddress for custom chains
      contractAddress: (c.escrowAddress ?? null) as import("viem").Address | null,
      usdtAddress:     (c.usdtAddress   ?? null) as import("viem").Address | null,
      usdcAddress:     (c.usdcAddress   ?? null) as import("viem").Address | null,
    });
  }

  return result;
}
