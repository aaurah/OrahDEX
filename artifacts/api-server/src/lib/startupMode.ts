/**
 * Safe startup mode serves API requests without automatically running workers.
 * It is enabled by the development watchdog only; production's `start` command
 * keeps its existing worker startup unless explicitly configured otherwise.
 */
export const safeApiStartup = process.env.ORAHDEX_API_SAFE_STARTUP === "1";

/**
 * Order recovery, deposit, and settlement watchers are managed separately
 * from market-data, bot, and diagnostics workers. Safe startup always wins;
 * outside safe startup the default preserves the existing production behavior.
 */
export const tradingWorkersEnabled =
  !safeApiStartup && process.env.ORAHDEX_TRADING_WORKERS_ENABLED !== "false";
