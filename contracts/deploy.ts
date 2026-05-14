/**
 * OrahDEXHTLC Deployment Script
 *
 * Deploys the OrahDEX HTLC contract to an EVM chain using viem.
 *
 * Usage:
 *   pnpm tsx contracts/deploy.ts
 *
 * Required environment variables:
 *   DEPLOYER_PRIVATE_KEY  — 0x-prefixed private key of the deploying wallet
 *   RPC_URL               — EVM node RPC endpoint (e.g. https://eth.llamarpc.com)
 *   CHAIN_ID              — Chain ID as integer (1=Ethereum, 137=Polygon, 56=BSC)
 *
 * After deployment, copy the contract address into your .env:
 *   EVM_HTLC_CONTRACT_ETH=0x...      (if deployed on Ethereum)
 *   EVM_HTLC_CONTRACT_POLYGON=0x...  (if deployed on Polygon)
 *   EVM_HTLC_CONTRACT_BSC=0x...      (if deployed on BSC)
 *
 * Verify on Etherscan/Polygonscan/BscScan with:
 *   npx hardhat verify --network mainnet <address>
 *   (contract is simple; flatten OrahDEXHTLC.sol and paste into explorer)
 */

import { createWalletClient, http, publicActions, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

// ── Configuration ──────────────────────────────────────────────────────────────

const PRIVATE_KEY  = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL      = process.env.RPC_URL      ?? "https://eth.llamarpc.com";
const CHAIN_ID     = parseInt(process.env.CHAIN_ID ?? "1", 10);

if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
  console.error("❌  DEPLOYER_PRIVATE_KEY must be set (0x-prefixed hex private key)");
  process.exit(1);
}

// ── Chain definition ───────────────────────────────────────────────────────────

const chain = defineChain({
  id:   CHAIN_ID,
  name: CHAIN_ID === 1   ? "Ethereum Mainnet"
      : CHAIN_ID === 137 ? "Polygon Mainnet"
      : CHAIN_ID === 56  ? "BNB Smart Chain"
      : `Chain ${CHAIN_ID}`,
  nativeCurrency: CHAIN_ID === 56 ? { name: "BNB",   symbol: "BNB",  decimals: 18 }
                                  : { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// ── Contract bytecode ──────────────────────────────────────────────────────────
// Compile with: solc --optimize --optimize-runs=200 --abi --bin contracts/OrahDEXHTLC.sol

async function getCompiled(): Promise<{ abi: object[]; bytecode: `0x${string}` }> {
  const abiPath = path.join(__dirname, "OrahDEXHTLC.abi.json");
  const binPath = path.join(__dirname, "OrahDEXHTLC.bin");

  // Read the compiled artifacts directly with try/catch instead of checking
  // for file existence first (fs.access → fs.readFile is a TOCTOU race:
  // a file could be removed between the check and the read).
  try {
    const [abi, bin] = await Promise.all([
      fs.readFile(abiPath, "utf8").then(JSON.parse),
      fs.readFile(binPath, "utf8"),
    ]);
    return { abi, bytecode: ("0x" + bin.trim()) as `0x${string}` };
  } catch {
    // Compiled artifacts not found — fall through to solc compilation.
  }

  console.log("📦 Compiled artifacts not found — attempting to compile with solc…");
  try {
    execSync(
      `solc --optimize --optimize-runs=200 --abi --bin ` +
      `--output-dir ${path.join(__dirname)} ` +
      `${path.join(__dirname, "OrahDEXHTLC.sol")}`,
      { stdio: "inherit" }
    );
  } catch {
    console.error(
      "❌  solc not found.  Install it:\n" +
      "    brew install solidity           (macOS)\n" +
      "    npm i -g solc                   (any platform)\n" +
      "    pip install py-solc-x           (Python users)\n\n" +
      "    Alternatively, compile at https://remix.ethereum.org and paste\n" +
      "    the ABI into contracts/OrahDEXHTLC.abi.json and\n" +
      "    the bytecode into contracts/OrahDEXHTLC.bin"
    );
    process.exit(1);
  }

  const [abi, bin] = await Promise.all([
    fs.readFile(path.join(__dirname, "OrahDEXHTLC.abi"), "utf8").then(JSON.parse),
    fs.readFile(path.join(__dirname, "OrahDEXHTLC.bin"), "utf8"),
  ]);
  return { abi, bytecode: ("0x" + bin.trim()) as `0x${string}` };
}

// ── Deploy ─────────────────────────────────────────────────────────────────────

async function deploy() {
  console.log(`\n🔗 OrahDEX HTLC Deployer`);
  console.log(`   Chain:   ${chain.name} (${CHAIN_ID})`);
  console.log(`   RPC:     ${RPC_URL}`);

  const account = privateKeyToAccount(PRIVATE_KEY);

  const client = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const balance = await client.getBalance({ address: account.address });
  const balanceEth = Number(balance) / 1e18;
  console.log(`   Balance: ${balanceEth.toFixed(6)} ${chain.nativeCurrency.symbol}`);
  if (balance === 0n) {
    console.error("❌  Deployer wallet has no balance — fund it before deploying");
    process.exit(1);
  }

  const { abi, bytecode } = await getCompiled();
  console.log(`📦 Contract compiled.  Bytecode: ${bytecode.length / 2 - 1} bytes`);

  console.log(`🚀 Deploying OrahDEXHTLC…`);
  const hash = await client.deployContract({
    abi,
    bytecode,
    args: [],
  });

  console.log(`   Deploy tx: ${hash}`);
  console.log(`   Waiting for confirmation…`);

  const receipt = await client.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    console.error("❌  Deployment failed — no contract address in receipt");
    process.exit(1);
  }

  const address = receipt.contractAddress;
  console.log(`\n✅  OrahDEXHTLC deployed!`);
  console.log(`   Contract: ${address}`);
  console.log(`   Block:    ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed}`);

  const envKey =
    CHAIN_ID === 1   ? "EVM_HTLC_CONTRACT_ETH"     :
    CHAIN_ID === 137 ? "EVM_HTLC_CONTRACT_POLYGON"  :
    CHAIN_ID === 56  ? "EVM_HTLC_CONTRACT_BSC"      :
    `EVM_HTLC_CONTRACT_${CHAIN_ID}`;

  console.log(`\n📋 Add to your .env:`);
  console.log(`   ${envKey}=${address}`);
  console.log(`\n🔍 Verify on explorer:`);
  const explorerBase =
    CHAIN_ID === 1   ? "https://etherscan.io/address/"    :
    CHAIN_ID === 137 ? "https://polygonscan.com/address/" :
    CHAIN_ID === 56  ? "https://bscscan.com/address/"     :
    `https://blockscan.com/address/`;
  console.log(`   ${explorerBase}${address}\n`);
}

deploy().catch(err => {
  console.error("❌  Deploy failed:", err.message ?? err);
  process.exit(1);
});
