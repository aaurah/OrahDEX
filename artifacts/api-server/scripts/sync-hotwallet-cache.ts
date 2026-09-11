import { pool } from "@workspace/db";
import { getOrCreateEvmHotWallet } from "../src/lib/exchangeHotWallet.js";
const wallet = await getOrCreateEvmHotWallet();
console.log("Active hot wallet address:", wallet.address);
console.log("Source:                   ", wallet.source);
await pool.query(
  `INSERT INTO platform_settings (key, value, updated_at)
   VALUES ($1::varchar, $2::text, now())
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  ["exchange_hot_wallet_address", wallet.address],
);
console.log("✓ DB cache synced to active address");
await pool.end();
