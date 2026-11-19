/**
 * Safe startup mode serves API requests without automatically running workers.
 * It is enabled by the development watchdog only; production's `start` command
 * keeps its existing worker startup unless explicitly configured otherwise.
 */
export const safeApiStartup = process.env.ORAHDEX_API_SAFE_STARTUP === "1";
