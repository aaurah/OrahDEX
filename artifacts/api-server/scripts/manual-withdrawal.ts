import { pool } from "@workspace/db";
import { processWithdrawal } from "../src/lib/withdrawalProcessor.js";
import { randomUUID } from "node:crypto";

const WALLET = "0x67C7f23eE49B6417661748F23F743C0B274039e2";
const ASSET = "ETH";
const AMOUNT = "0.0093"; // leave ~0.00006 ETH buffer for gas
const NETWORK = "base";
const RECIPIENT = WALLET;

async function main() {
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balRows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances WHERE wallet_address=$1 AND asset_symbol=$2 FOR UPDATE`,
      [WALLET, ASSET],
    );
    const available = parseFloat(balRows[0]?.available ?? "0");
    if (available < parseFloat(AMOUNT)) {
      throw new Error(`Insufficient balance: ${available} < ${AMOUNT}`);
    }

    await client.query(
      `UPDATE user_balances SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [AMOUNT, WALLET, ASSET],
    );

    await client.query(
      `INSERT INTO withdrawal_requests
         (id, wallet_address, asset, amount, network, network_label, recipient, status, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', 'Manual restoration of un-credited Base ETH deposit', now())`,
      [id, WALLET, ASSET, AMOUNT, NETWORK, "Base", RECIPIENT],
    );
    await client.query("COMMIT");
    console.log(`Created withdrawal_request id=${id}, debited ${AMOUNT} ${ASSET}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(`Submitting on-chain transfer to ${RECIPIENT} on ${NETWORK} for ${AMOUNT} ${ASSET}…`);
  const result = await processWithdrawal({
    asset: ASSET,
    amount: parseFloat(AMOUNT),
    network: NETWORK,
    recipient: RECIPIENT,
  });
  console.log("processWithdrawal result:", JSON.stringify(result, null, 2));

  if (result.status === "completed" && result.txid) {
    await pool.query(
      `UPDATE withdrawal_requests SET status='completed', txid=$1, note=$2, processed_at=now() WHERE id=$3`,
      [result.txid, result.explorer ?? "Manual restoration completed", id],
    );
    console.log(`✅ DONE — txid: ${result.txid}`);
  } else {
    await pool.query(
      `UPDATE withdrawal_requests SET status='pending', note=$1 WHERE id=$2`,
      [result.note ?? "Pending — see processor logs", id],
    );
    console.log(`⚠️  Did not complete; status set back to pending. Note: ${result.note}`);
  }
  await pool.end();
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
