import type { Env } from "./env";
import { withDb } from "./db";

type TaskFn = (env: Env) => Promise<Record<string, unknown>>;

/** Guard wrapper mirroring guardedInterval(): catches, logs, never throws. */
async function guarded(
  env: Env,
  task: string,
  fn: TaskFn
): Promise<{ status: "ok" | "error"; details: Record<string, unknown>; durationMs: number }> {
  const started = Date.now();
  try {
    const details = await fn(env);
    return { status: "ok", details, durationMs: Date.now() - started };
  } catch (err) {
    return {
      status: "error",
      details: { message: err instanceof Error ? err.message : String(err) },
      durationMs: Date.now() - started,
    };
  }
}

async function recordRun(
  env: Env,
  task: string,
  result: { status: "ok" | "error"; details: Record<string, unknown>; durationMs: number }
): Promise<void> {
  await withDb(env, async (db) => {
    await db.query(
      `INSERT INTO worker_cron_runs (task, status, details, duration_ms)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [task, result.status, JSON.stringify(result.details), result.durationMs]
    );
    // Retain 30 days of run history; hard-delete the rest.
    await db.query(`DELETE FROM worker_cron_runs WHERE ran_at < now() - interval '30 days'`);
  });
}

/**
 * Every-minute tasks.
 * `webhook-log-cleanup` is fully implemented. Port the remaining per-minute
 * checks from artifacts/api-server/src/lib/selfHealingReconcilers.ts here as
 * additional tasks — they are pure SQL + guards and port directly.
 */
const MINUTE_TASKS: Record<string, TaskFn> = {
  "webhook-log-cleanup": async (env) => {
    const { rows } = await withDb(env, async (db) => {
      const r = await db.query(
        `DELETE FROM webhook_events WHERE received_at < now() - interval '30 days'`
      );
      await db.query(
        `UPDATE worker_heartbeat SET last_beat = now(), metadata = $1::jsonb WHERE id = 1`,
        [JSON.stringify({ environment: env.ENVIRONMENT })]
      );
      return r;
    });
    return { prunedWebhookEvents: rows ? (rows as unknown as { rowCount?: number }).rowCount ?? 0 : 0 };
  },
};

/** Five-minute reconciler sweep. Add ported reconcilers from selfHealingReconcilers.ts here. */
const SWEEP_TASKS: Record<string, TaskFn> = {
  "reconciler-sweep": async (env) => {
    await withDb(env, async (db) => {
      await db.query(`SELECT 1`); // connectivity probe; replaces the DB watchdog task
    });
    return { sweep: "connectivity-ok" };
  },
};

// Exact-match dispatch. MUST stay in sync with [triggers].crons in wrangler.toml.
const CRON_SCHEDULES: Record<string, Record<string, TaskFn>> = {
  "* * * * *": MINUTE_TASKS,
  "*/5 * * * *": SWEEP_TASKS,
};

export async function runCron(env: Env, cron: string): Promise<void> {
  const tasks = CRON_SCHEDULES[cron];
  if (!tasks) {
    console.warn(`unrecognized cron schedule: ${cron}`);
    return;
  }
  for (const [name, fn] of Object.entries(tasks)) {
    const result = await guarded(env, name, fn);
    await recordRun(env, name, result).catch(() => {});
  }
}
