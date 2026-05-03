/**
 * evmDepositWatcher.ts — OrahDEX
 *
 * Polls each configured EVM chain for native-token deposits to per-user custodial
 * deposit addresses (rows in `evm_deposit_addresses`).
 *
 * Strategy: instead of scanning blocks (expensive and bursty), we read the
 * current native balance of each deposit address via `eth_getBalance` and
 * credit the delta vs. what was previously credited. The existing
 * `sweepAndCreditDeposit` helper already implements the dedup-and-delta-credit
 * pattern atomically against `evm_deposits_verified` (the dedup row uses a
 * synthetic key `sweep:{chainId}:{address}` so it never collides with real txid
 * dedup rows).
 *
 * Sweep-to-hot-wallet is intentionally NOT performed here — funds remain at the
 * per-user deposit address until an operator chooses to sweep. The user's
 * internal exchange balance is credited regardless, so trades and withdrawals
 * can be queued; the operator funds the hot wallet separately for payouts.
 *
 * ERC-20 token deposits are NOT covered by this watcher — only native gas
 * tokens (ETH on Base/Eth/Arb/Op, BNB, MATIC, …). ERC-20 deposits still need
 * the manual `POST /deposit/verify` flow.
 */

import { createPublicClient, http, type Address } from "viem";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 90_000;
const MAX_ADDRESSES_PER_CHAIN_PER_TICK = 25;
/** Required block confirmations before crediting an EVM deposit. */
const CONFIRMATIONS = 6;
const WEI_DECIMALS = 18;

/** Format a wei bigint as a fixed-point decimal string with 18 places (lossless). */
function weiToDecimalString(wei: bigint): string {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const s = abs.toString().padStart(WEI_DECIMALS + 1, "0");
  const intPart = s.slice(0, s.length - WEI_DECIMALS);
  const fracPart = s.slice(s.length - WEI_DECIMALS);
  return (neg ? "-" : "") + intPart + "." + fracPart;
}

/**
 * Atomic, bigint-precise delta credit for an EVM deposit address.
 * Uses an insert-then-lock pattern to prevent the first-credit race.
 * The dedup row in evm_deposits_verified uses synthetic key
 * `sweep:{chainId}:{address}` so it never collides with real txid dedup rows.
 * Returns the credited delta in wei (0n = no-op).
 */
async function applyEvmDeltaCredit(params: {
  chainId:    number;
  userWallet: string;
  address:    string;
  asset:      string;
  balanceWei: bigint;
}): Promise<bigint> {
  const sweepKey  = `sweep:${params.chainId}:${params.address.toLowerCase()}`;
  const newTotal  = weiToDecimalString(params.balanceWei);
  const client    = await pool.connect();
  try {
    await client.query("BEGIN");
    // Claim the dedup row first so the FOR UPDATE below has something to lock.
    await client.query(
      `INSERT INTO evm_deposits_verified (tx_hash, chain_id, user_wallet, asset, amount)
       VALUES ($1, $2, $3, $4, '0')
       ON CONFLICT (tx_hash, chain_id) DO NOTHING`,
      [sweepKey, params.chainId, params.userWallet, params.asset],
    );
    const { rows } = await client.query<{ amount: string }>(
      `SELECT amount::text FROM evm_deposits_verified
       WHERE tx_hash = $1 AND chain_id = $2 FOR UPDATE`,
      [sweepKey, params.chainId],
    );
    // Parse the previously credited fixed-decimal amount back to wei (bigint, lossless).
    const prevStr = rows[0]?.amount ?? "0";
    const [intStr, fracStrRaw = ""] = prevStr.split(".");
    const fracStr = (fracStrRaw + "0".repeat(WEI_DECIMALS)).slice(0, WEI_DECIMALS);
    const previouslyCredited = BigInt(intStr) * (10n ** BigInt(WEI_DECIMALS)) + BigInt(fracStr || "0");
    const deltaWei = params.balanceWei - previouslyCredited;

    if (deltaWei <= 0n) {
      await client.query("ROLLBACK");
      return 0n;
    }

    await client.query(
      `UPDATE evm_deposits_verified
         SET amount = $3, verified_at = now()
       WHERE tx_hash = $1 AND chain_id = $2`,
      [sweepKey, params.chainId, newTotal],
    );
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [params.userWallet, params.asset, weiToDecimalString(deltaWei)],
    );
    await client.query("COMMIT");
    return deltaWei;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

interface WatchChain {
  id:     number;
  key:    string;
  rpcUrl: string;
  asset:  string;
}

const WATCH_CHAINS: WatchChain[] = [
  { id: 8453,  key: "BASE",   rpcUrl: process.env.BASE_RPC_URL    ?? "https://base.publicnode.com",            asset: "ETH"   },
  { id: 1,     key: "ETH",    rpcUrl: process.env.ETH_RPC_URL     ?? "https://ethereum.publicnode.com",        asset: "ETH"   },
  { id: 42161, key: "ARB",    rpcUrl: process.env.ARB_RPC_URL     ?? "https://arbitrum-one.publicnode.com",    asset: "ETH"   },
  { id: 10,    key: "OP",     rpcUrl: process.env.OP_RPC_URL      ?? "https://optimism.publicnode.com",        asset: "ETH"   },
  { id: 56,    key: "BNB",    rpcUrl: process.env.BSC_RPC_URL     ?? "https://bsc.publicnode.com",             asset: "BNB"   },
  { id: 137,   key: "MATIC",  rpcUrl: process.env.POLYGON_RPC_URL ?? "https://polygon.publicnode.com",         asset: "MATIC" },
];

const _clients = new Map<number, ReturnType<typeof createPublicClient>>();
function clientFor(chain: WatchChain) {
  let c = _clients.get(chain.id);
  if (!c) {
    c = createPublicClient({ transport: http(chain.rpcUrl) });
    _clients.set(chain.id, c);
  }
  return c;
}

const _cursors = new Map<number, number>();
let _busy = false;

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS exists`,
    [name],
  );
  return rows[0]?.exists === true;
}

async function scanChain(chain: WatchChain): Promise<{ scanned: number; credited: number; creditedWei: bigint }> {
  const cursor = _cursors.get(chain.id) ?? 0;

  const { rows: targets } = await pool.query<{ user_wallet: string; deposit_address: string }>(
    `SELECT user_wallet, deposit_address
     FROM evm_deposit_addresses
     ORDER BY created_at NULLS LAST
     LIMIT $1 OFFSET $2`,
    [MAX_ADDRESSES_PER_CHAIN_PER_TICK, cursor],
  );

  if (targets.length === 0) {
    _cursors.set(chain.id, 0);
    return { scanned: 0, credited: 0, creditedWei: 0n };
  }
  _cursors.set(chain.id, cursor + targets.length);

  const client = clientFor(chain);

  // Read current head once so we can ask for balance at (head - CONFIRMATIONS).
  // This requires the deposit funds to be at least N blocks deep before being
  // credited, giving simple finality protection vs. shallow reorgs.
  let confirmedBlock: bigint | undefined;
  try {
    const head = await client.getBlockNumber();
    confirmedBlock = head > BigInt(CONFIRMATIONS) ? head - BigInt(CONFIRMATIONS) : 0n;
  } catch (err) {
    logger.debug({ err, chain: chain.key }, "EVM watcher: getBlockNumber failed; skipping chain this tick");
    return { scanned: 0, credited: 0, creditedWei: 0n };
  }

  let scanned = 0, credited = 0, creditedWei = 0n;

  for (const t of targets) {
    let weiBig: bigint;
    try {
      weiBig = await client.getBalance({ address: t.deposit_address as Address, blockNumber: confirmedBlock });
    } catch (err) {
      logger.debug({ err, chain: chain.key, addr: t.deposit_address }, "EVM watcher: getBalance failed");
      continue;
    }
    scanned++;
    if (weiBig === 0n) continue;

    try {
      const delta = await applyEvmDeltaCredit({
        chainId:    chain.id,
        userWallet: t.user_wallet,
        address:    t.deposit_address,
        asset:      chain.asset,
        balanceWei: weiBig,
      });
      if (delta > 0n) {
        credited++;
        creditedWei += delta;
        logger.info(
          {
            user: t.user_wallet, chain: chain.key, addr: t.deposit_address,
            deltaWei: delta.toString(), totalWei: weiBig.toString(), asset: chain.asset,
            confirmations: CONFIRMATIONS,
          },
          "EVM deposit credited",
        );
      }
    } catch (err) {
      logger.warn({ err, chain: chain.key, addr: t.deposit_address }, "EVM deposit credit failed");
    }
  }

  return { scanned, credited, creditedWei };
}

async function scanTick(): Promise<void> {
  if (!(await tableExists("evm_deposit_addresses"))) {
    // Table is created lazily on first /deposit/address call; nothing to scan yet.
    return;
  }

  const summaries = await Promise.all(
    WATCH_CHAINS.map(c =>
      scanChain(c).catch(err => {
        logger.warn({ err, chain: c.key }, "EVM watcher: chain scan failed");
        return { scanned: 0, credited: 0, creditedWei: 0n };
      }),
    ),
  );

  const total = summaries.reduce(
    (acc, s) => ({ scanned: acc.scanned + s.scanned, credited: acc.credited + s.credited, creditedWei: acc.creditedWei + s.creditedWei }),
    { scanned: 0, credited: 0, creditedWei: 0n },
  );

  logger.info({ ...total, creditedWei: total.creditedWei.toString() }, "EVM deposit watcher: tick complete");
}

export function startEvmDepositWatcher(): void {
  logger.info(
    {
      intervalMs: POLL_INTERVAL_MS,
      chains: WATCH_CHAINS.map(c => c.key),
      batchPerChain: MAX_ADDRESSES_PER_CHAIN_PER_TICK,
      confirmations: CONFIRMATIONS,
    },
    "EVM deposit watcher starting",
  );
  const guardedTick = async () => {
    if (_busy) { logger.warn("EVM deposit watcher: previous tick still running, skipping"); return; }
    _busy = true;
    try { await scanTick(); }
    catch (err) { logger.warn({ err }, "EVM deposit watcher tick error"); }
    finally { _busy = false; }
  };
  setTimeout(guardedTick, 8_000);
  setInterval(guardedTick, POLL_INTERVAL_MS);
}
