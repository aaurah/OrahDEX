import { processWithdrawal } from "./dist/lib/withdrawalProcessor.mjs";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(`
  SELECT id, asset, amount, network, recipient 
  FROM withdrawal_requests 
  WHERE status = 'pending' AND wallet_address = '0x67C7f23eE49B6417661748F23F743C0B274039e2'
  ORDER BY created_at ASC
`);

console.log(`Found ${rows.length} pending withdrawals`);

for (const row of rows) {
  console.log(`\nProcessing ${row.id}: ${row.amount} ${row.asset} on ${row.network} to ${row.recipient}`);
  try {
    await pool.query(`UPDATE withdrawal_requests SET status = 'processing' WHERE id = $1`, [row.id]);
    const result = await processWithdrawal({
      asset:     row.asset,
      amount:    parseFloat(row.amount),
      network:   row.network,
      recipient: row.recipient,
    });
    console.log(`Result:`, JSON.stringify(result));
    if (result.status === "completed") {
      await pool.query(`UPDATE withdrawal_requests SET status='completed', txid=$1, note=$2, processed_at=now() WHERE id=$3`,
        [result.txid, result.explorer ?? "Retry succeeded", row.id]);
      console.log(`✓ Completed: ${result.txid}`);
    } else {
      await pool.query(`UPDATE withdrawal_requests SET status='pending', note=$1 WHERE id=$2`,
        [result.note, row.id]);
      console.log(`⚠ Still pending: ${result.note}`);
    }
  } catch (err) {
    await pool.query(`UPDATE withdrawal_requests SET status='pending', note=$1 WHERE id=$2`,
      [(err?.message ?? "Retry error").slice(0, 800), row.id]);
    console.error(`✗ Error: ${err?.message}`);
  }
}

await pool.end();
console.log("\nDone.");
