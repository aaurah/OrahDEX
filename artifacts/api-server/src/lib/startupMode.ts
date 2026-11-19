/**
 * Safe startup mode serves API requests without automatically running workers.
 * It is enabled by the development watchdog only; production's `start` command
 * keeps its existing worker startup unless explicitly configured otherwise.
 */
export const safeApiStartup = process.env.ORAHDEX_API_SAFE_STARTUP === "1";

const VERIFIED_EVM_ORDERBOOK_CHAIN_IDS = new Set([1, 11155111]);

function parseChainIds(value: string | undefined): number[] {
  if (!value) return [];
  return [...new Set(value.split(",")
    .map((entry) => Number(entry.trim()))
    .filter((chainId) => VERIFIED_EVM_ORDERBOOK_CHAIN_IDS.has(chainId)))];
}

export function configuredEvmOrderbookChainIds(): number[] {
  const configured = parseChainIds(process.env.ORAHDEX_TRADING_EVM_CHAIN_IDS);
  if (configured.length > 0) return configured;
  const legacyChainId = Number(process.env.ORAHDEX_TRADING_EVM_CHAIN_ID ?? "1");
  return VERIFIED_EVM_ORDERBOOK_CHAIN_IDS.has(legacyChainId) ? [legacyChainId] : [];
}

export function isEvmOrderbookChainEnabled(chainId: number): boolean {
  const verified = parseChainIds(process.env.ORAHDEX_TRADING_EVM_VERIFIED_CHAIN_IDS);
  const verifiedChainIds = verified.length > 0
    ? verified
    : process.env.ORAHDEX_TRADING_EVM_VERIFIED === "true"
      ? [Number(process.env.ORAHDEX_TRADING_EVM_CHAIN_ID ?? "1")]
      : [];
  return process.env.ORAHDEX_ORDERBOOK_TRADING_ENABLED === "true" &&
    configuredEvmOrderbookChainIds().includes(chainId) &&
    verifiedChainIds.includes(chainId);
}

/**
 * Only explicitly verified escrow chains may run in safe API startup. The
 * worker remains isolated from market bots and unrelated settlement systems.
 */
export const orderbookTradingEnabled =
  configuredEvmOrderbookChainIds().some(isEvmOrderbookChainEnabled);

/**
 * Order recovery, deposit, and settlement watchers are managed separately
 * from market-data, bot, and diagnostics workers. Safe startup always wins;
 * outside safe startup the default preserves the existing production behavior.
 */
export const tradingWorkersEnabled =
  !safeApiStartup && process.env.ORAHDEX_TRADING_WORKERS_ENABLED !== "false";
