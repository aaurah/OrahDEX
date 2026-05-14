/**
 * serviceState.ts — shared in-memory state for background service health tracking.
 *
 * Imported by both routes/admin.ts (reads) and lib/* services (writes).
 * Keeping it in a standalone module avoids circular import cycles.
 */

export const serviceState = {
  priceEngineLastRunAt: Date.now(),
  priceEngineRuns:      0,
  priceEngineErrors:    0,

  botLastCycleAt: Date.now(),
  botCycles:      0,

  bsvMonitorLastAt:  Date.now(),
  bsvMonitorErrors:  0,

  restartCount:   0,
  lastRestartAt:  Date.now(),

  incidentLog: [] as Array<{ ts: number; level: string; service: string; msg: string }>,
};

export function logIncident(level: string, service: string, msg: string) {
  serviceState.incidentLog.unshift({ ts: Date.now(), level, service, msg });
  if (serviceState.incidentLog.length > 100) serviceState.incidentLog.pop();
}
