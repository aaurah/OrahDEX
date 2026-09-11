-- OrahDEX exchange worker core schema
-- Applied by scripts/migrate.mjs (tracked in schema_migrations)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version      TEXT PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id               BIGSERIAL PRIMARY KEY,
  source           TEXT NOT NULL,                 -- 'evm' | 'stripe'
  event_id         TEXT NOT NULL,
  signature_valid  BOOLEAN NOT NULL,
  payload          JSONB NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events (received_at DESC);

CREATE TABLE IF NOT EXISTS worker_cron_runs (
  id          BIGSERIAL PRIMARY KEY,
  task        TEXT NOT NULL,
  status      TEXT NOT NULL,                      -- 'ok' | 'error'
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_cron_runs_task_time
  ON worker_cron_runs (task, ran_at DESC);

CREATE TABLE IF NOT EXISTS worker_heartbeat (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  environment TEXT NOT NULL,
  last_beat   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO worker_heartbeat (id, environment)
VALUES (1, 'init')
ON CONFLICT (id) DO NOTHING;
