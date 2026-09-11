import pg from "pg";
import type { Env } from "./env";

const { Client } = pg;

/**
 * One short-lived connection per request/invocation against Hyperdrive.
 * Hyperdrive pools upstream, so per-invocation clients are the correct pattern.
 */
export async function withDb<T>(
  env: Env,
  fn: (client: InstanceType<typeof Client>) => Promise<T>
): Promise<T> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}
