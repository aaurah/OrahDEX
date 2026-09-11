
#!/usr/bin/env node
/**
 * Postgres migration runner for the OrahDEX worker.
 *
 * Usage (from the worker package, after `pnpm install`):
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs [./migrations]
 *
 * - Applies unapplied *.sql files in lexical order, each in a transaction.
 * - Records applied versions in schema_migrations.
 * - Safe to run concurrently (advisory lock) and repeatedly (idempotent).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const url = process.env.DATABASE_URL || process.env.HYPERDRIVE_CONNECTION_STRING;
if (!url) {
  console.error("DATABASE_URL (or HYPERDRIVE_CONNECTION_STRING) is required");
  process.exit(1);
}

const dir = resolve(process.argv[2] ?? join(process.cwd(), "migrations"));

const client = new Client({ connectionString: url });
await client.connect();

try {
  await client.query("SELECT pg_advisory_lock(727272)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const applied = new Set(
    (await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version)
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) console.log(`No migrations found in ${dir}`);

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`apply ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("Migrations complete.");
} finally {
  await client.query("SELECT pg_advisory_unlock(727272)").catch(() => {});
  await client.end();
}
