/**
 * Emergency recovery: cancel all unreleased deposits for a depositor and
 * refund them. Called by the relayer (which has cancel authority per the
 * OrahDEXEscrow contract).
 *
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/recover-locked-funds.mjs \
 *     --chain ethereum --depositor 0x67C7...
 */

import { ethers } from "ethers";

const CHAINS = {
  ethereum: {
    chainId: 1,
    escrow:  "0xeE234cEb85697b64800E696699b7841e00413B4f",
    rpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://1rpc.io/eth",
      "https://cloudflare-eth.com",
    ],
  },
  sepolia: {
    chainId: 11155111,
    escrow:  "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2",
    rpcs: [
      "https://eth-sepolia.public.blastapi.io",
      "https://sepolia.drpc.org",
    ],
  },
};

const ABI = [
  "function cancel(bytes32 orderId) external",
  "function getDeposit(bytes32 orderId) external view returns (address depositor, address token, uint256 amount, uint64 lockedAt, bool released)",
  "function getDepositorOrders(address depositor) external view returns (bytes32[])",
  "function relayer() external view returns (address)",
];

function parseArgs() {
  const args = process.argv.slice(2);
  let chain = "ethereum", depositor = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--chain") chain = args[++i];
    else if (args[i] === "--depositor") depositor = args[++i];
  }
  if (!depositor) throw new Error("--depositor 0x... required");
  return { chain, depositor };
}

async function getProvider(rpcs, chainId) {
  for (const url of rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url, chainId);
      const net = await p.getNetwork();
      if (Number(net.chainId) === chainId) {
        console.log(`✓ RPC ${url}`);
        return p;
      }
    } catch (e) { /* next */ }
  }
  throw new Error("No RPC reachable");
}

async function main() {
  const { chain, depositor } = parseArgs();
  const cfg = CHAINS[chain];
  if (!cfg) throw new Error(`Unknown chain ${chain}`);

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = await getProvider(cfg.rpcs, cfg.chainId);
  const relayerWallet = new ethers.Wallet(
    pk.startsWith("0x") ? pk : "0x" + pk,
    provider,
  );
  const escrow = new ethers.Contract(cfg.escrow, ABI, relayerWallet);

  const onChainRelayer = await escrow.relayer();
  console.log(`Contract relayer: ${onChainRelayer}`);
  console.log(`Our wallet:       ${relayerWallet.address}`);
  if (onChainRelayer.toLowerCase() !== relayerWallet.address.toLowerCase()) {
    throw new Error("Wallet is not the contract relayer — cannot cancel.");
  }

  console.log(`\nLooking up locked orders for ${depositor} on ${chain}...`);
  const orderIds = await escrow.getDepositorOrders(depositor);
  console.log(`Found ${orderIds.length} order(s) ever locked by this depositor.`);

  let recoveredCount = 0;
  let totalEthRecovered = 0n;

  for (const oid of orderIds) {
    const dep = await escrow.getDeposit(oid);
    const released = dep.released ?? dep[4];
    const amount   = dep.amount   ?? dep[2];
    const token    = dep.token    ?? dep[1];

    if (released) {
      console.log(`  · ${oid} — already released/cancelled, skip`);
      continue;
    }
    const isEth = token === ethers.ZeroAddress;
    console.log(`  → ${oid}  amount=${amount.toString()}  token=${isEth ? "ETH" : token}`);

    try {
      const tx = await escrow.cancel(oid);
      console.log(`    tx: ${tx.hash}`);
      const rcpt = await tx.wait();
      console.log(`    ✓ confirmed in block ${rcpt.blockNumber}`);
      recoveredCount++;
      if (isEth) totalEthRecovered += amount;
    } catch (e) {
      console.log(`    ✗ failed: ${e.shortMessage ?? e.message}`);
    }
  }

  console.log(`\nDone. Recovered ${recoveredCount} order(s).`);
  if (totalEthRecovered > 0n) {
    console.log(`Total ETH refunded: ${ethers.formatEther(totalEthRecovered)} ETH`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
