/**
 * Returns true for transient pg / Drizzle connection errors (pool timeout,
 * ECONNREFUSED, unexpected termination, query read timeout).
 *
 * Use this to downgrade expected cold-start / DB-restart noise from ERROR
 * to WARN in background engine poll loops.
 */
export function isDbConnError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("connection terminated due to connection timeout") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    msg.includes("query read timeout") ||
    // Neon/Postgres kills the socket outright (compute suspend/resume, admin
    // maintenance, deploy-time teardown). The raw server error text is passed
    // through verbatim and never matches the wrapper phrases above.
    msg.includes("administrator command") ||
    // Drizzle wraps pg errors as "_DrizzleQueryError: Failed query: ...: <pg message>"
    // The substring below catches all such wrappers that contain a conn error.
    (msg.includes("failed query") && msg.includes("connection"))
  );
}
