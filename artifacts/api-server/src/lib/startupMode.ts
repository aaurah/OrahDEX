/**
 * Safe startup mode serves API requests without automatically running workers.
 * It is enabled by the development watchdog only; production's `start` command
 * keeps its existing worker startup unless explicitly configured otherwise.
 */
export const safeApiStartup = process.env.ORAHDEX_API_SAFE_STARTUP === "1";

/**
 * The only trading mode allowed to run alongside safe API startup is the
 * explicitly verified Sepolia orderbook path. It starts the order recovery
 * worker only; it does not enable production bots or other settlement systems.
 */
export const orderbookTradingEnabled =
  process.env.ORAHDEX_ORDERBOOK_TRADING_ENABLED === "true" &&
  Number(process.env.ORAHDEX_TRADING_EVM_CHAIN_ID) === 11155111 &&
  process.env.ORAHDEX_TRADING_EVM_VERIFIED === "true";

/**
 * Order recovery, deposit, and settlement watchers are managed separately
 * from market-data, bot, and diagnostics workers. Safe startup always wins;
 * outside safe startup the default preserves the existing production behavior.
 */
export const tradingWorkersEnabled =
  !safeApiStartup && process.env.ORAHDEX_TRADING_WORKERS_ENABLED !== "false";
