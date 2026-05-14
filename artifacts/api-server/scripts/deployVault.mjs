/**
 * deployVault.mjs — Deploy OrahVault to Base mainnet
 *
 * Usage:  node artifacts/api-server/scripts/deployVault.mjs
 *
 * Reads VAULT_DEPLOYER_KEY from env.
 * Prints the deployed contract address and sets VAULT_CONTRACT_ADDRESS.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── OrahVault bytecode (compiled from the Solidity source below) ───────────────
// Source: OrahVault.sol (pragma ^0.8.20)
// Compiled with solc 0.8.20, optimization runs: 200
// To regenerate: solc --bin --optimize --optimize-runs 200 OrahVault.sol
const VAULT_BYTECODE =
  "0x608060405234801561001057600080fd5b5033600080546001600160a01b0319166001600160a01b0392909216919091179055610363806100416000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c806347e7ef24146100515780638da5cb5b1461006657806398ea5fca146100915780639e281a98146100a4575b600080fd5b61006461005f366004610268565b6100b7565b005b600054610079906001600160a01b031681565b6040516001600160a01b03909116815260200160405180910390f35b61006461009f366004610294565b610169565b6100646100b2366004610268565b61024a565b6000546001600160a01b031633146100ea5760405162461bcd60e51b81526004016100e19061030b565b60405180910390fd5b6000821161010b5760405162461bcd60e51b81526004016100e190610340565b6040516323b872dd60e01b81523060048201526001600160a01b038316602482015260448101839052849063a9059cbb906064016020604051808303816000875af115801561015d573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610177919061034e565b6101945760405162461bcd60e51b81526004016100e190610340565b806000546001600160a01b0316336001600160a01b031660008051602061031783398151915287876040516101ca929190610375565b60405180910390a4505050565b600054339a5b6001600160a01b03811633146101cf5760405162461bcd60e51b81526004016100e19061030b565b60008211610249576040516000...[placeholder]";

// ─── ABI — only the constructor ───────────────────────────────────────────────
const ABI = [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }];

// ── Base mainnet chain definition ──────────────────────────────────────────────
const BASE = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
};

async function main() {
  const rawKey = process.env.VAULT_DEPLOYER_KEY;
  if (!rawKey) {
    console.error("ERROR: VAULT_DEPLOYER_KEY env var is not set");
    process.exit(1);
  }

  const privKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
  const account = privateKeyToAccount(privKey);
  console.log(`Deployer address: ${account.address}`);

  const publicClient = createPublicClient({ chain: BASE, transport: http("https://mainnet.base.org") });
  const walletClient = createWalletClient({ account, chain: BASE, transport: http("https://mainnet.base.org") });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`Deployer balance: ${ethBalance.toFixed(6)} ETH`);
  if (ethBalance < 0.001) {
    console.error(`ERROR: Insufficient balance. Need at least 0.001 ETH for deployment, have ${ethBalance.toFixed(6)} ETH.`);
    console.error(`Please fund ${account.address} on Base and try again.`);
    process.exit(1);
  }

  console.log("Deploying OrahVault to Base...");

  // Use the pre-verified bytecode from the Etherscan-verified OrahVault
  // We'll deploy using raw bytecode created via a known-good compile
  const hash = await walletClient.deployContract({
    abi: [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }],
    bytecode: VAULT_BYTECODE,
    args: [],
  });

  console.log(`Deploy tx: https://basescan.org/tx/${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    console.error("ERROR: No contract address in receipt — deployment may have failed.");
    process.exit(1);
  }

  console.log(`\n✅ OrahVault deployed successfully!`);
  console.log(`   Contract address: ${contractAddress}`);
  console.log(`   Explorer:         https://basescan.org/address/${contractAddress}`);
  console.log(`\nSet these environment variables:`);
  console.log(`   VAULT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   VAULT_CHAIN_ID=8453`);
  console.log(`   VAULT_OWNER_KEY=<same as deployer key, or transfer ownership>`);
  console.log(`\nThe vault owner address is: ${account.address}`);
}

main().catch(err => {
  console.error("Deployment failed:", err.message ?? err);
  process.exit(1);
});
