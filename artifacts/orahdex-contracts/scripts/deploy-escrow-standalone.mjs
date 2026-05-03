/**
 * Standalone OrahDEXEscrow deployer — chain-agnostic.
 *
 *   node scripts/deploy-escrow-standalone.mjs --chain <key>
 *   node scripts/deploy-escrow-standalone.mjs               # defaults to sepolia
 *
 * Requires env: DEPLOYER_PRIVATE_KEY (must be funded on the target chain).
 *
 * Designed to be safe to run repeatedly on different chains:
 *   • Reads the existing frontend escrowConfig.ts and MERGES the new
 *     address into ESCROW_ADDRESSES instead of overwriting other chains.
 *   • Writes per-chain deployments/<chainId>.json without touching others.
 *
 * Add a new chain by editing the CHAINS map below.
 */

import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Chain registry ────────────────────────────────────────────────────────────
// chainId + display name + ordered list of public RPC fallbacks + explorer.
// Matches evmHtlc.ts EVM_CHAINS so escrow lives wherever HTLC settlement does.
const CHAINS = {
  // ── Mainnets ─────────────────────────────────────────────────────────────
  ethereum:  { chainId: 1,     label: "Ethereum",   explorer: "https://etherscan.io",         rpcs: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth", "https://eth-pokt.nodies.app"] },
  polygon:   { chainId: 137,   label: "Polygon",    explorer: "https://polygonscan.com",      rpcs: ["https://polygon-rpc.com", "https://rpc.ankr.com/polygon", "https://polygon-pokt.nodies.app"] },
  bsc:       { chainId: 56,    label: "BSC",        explorer: "https://bscscan.com",          rpcs: ["https://bsc-dataseed.binance.org", "https://rpc.ankr.com/bsc", "https://bsc-pokt.nodies.app"] },
  base:      { chainId: 8453,  label: "Base",       explorer: "https://basescan.org",         rpcs: ["https://mainnet.base.org", "https://base-pokt.nodies.app", "https://base.llamarpc.com"] },
  arbitrum:  { chainId: 42161, label: "Arbitrum",   explorer: "https://arbiscan.io",          rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.llamarpc.com", "https://rpc.ankr.com/arbitrum"] },
  optimism:  { chainId: 10,    label: "Optimism",   explorer: "https://optimistic.etherscan.io", rpcs: ["https://mainnet.optimism.io", "https://optimism.llamarpc.com", "https://rpc.ankr.com/optimism"] },
  avalanche: { chainId: 43114, label: "Avalanche",  explorer: "https://snowtrace.io",         rpcs: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"] },
  zksync:    { chainId: 324,   label: "zkSync Era", explorer: "https://explorer.zksync.io",   rpcs: ["https://mainnet.era.zksync.io", "https://zksync.drpc.org"] },

  // ── Testnets ─────────────────────────────────────────────────────────────
  sepolia:        { chainId: 11155111, label: "Sepolia",        explorer: "https://sepolia.etherscan.io",      rpcs: ["https://eth-sepolia.public.blastapi.io", "https://sepolia.drpc.org", "https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia"] },
  "base-sepolia": { chainId: 84532,    label: "Base Sepolia",   explorer: "https://sepolia.basescan.org",      rpcs: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"] },
  "arb-sepolia":  { chainId: 421614,   label: "Arb Sepolia",    explorer: "https://sepolia.arbiscan.io",       rpcs: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"] },
  "op-sepolia":   { chainId: 11155420, label: "Op Sepolia",     explorer: "https://sepolia-optimism.etherscan.io", rpcs: ["https://sepolia.optimism.io", "https://optimism-sepolia-rpc.publicnode.com"] },
  "polygon-amoy": { chainId: 80002,    label: "Polygon Amoy",   explorer: "https://amoy.polygonscan.com",      rpcs: ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"] },
  "bsc-testnet":  { chainId: 97,       label: "BSC Testnet",    explorer: "https://testnet.bscscan.com",       rpcs: ["https://data-seed-prebsc-1-s1.binance.org:8545", "https://bsc-testnet-rpc.publicnode.com"] },
  "avax-fuji":    { chainId: 43113,    label: "Avalanche Fuji", explorer: "https://testnet.snowtrace.io",      rpcs: ["https://api.avax-test.network/ext/bc/C/rpc", "https://avalanche-fuji-c-chain-rpc.publicnode.com"] },
};

// ── CLI parsing ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  let chainKey = "sepolia";
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--chain" || args[i] === "-c") && args[i + 1]) {
      chainKey = args[i + 1];
      i++;
    } else if (args[i].startsWith("--chain=")) {
      chainKey = args[i].slice("--chain=".length);
    }
  }
  return { chainKey };
}

const { chainKey } = parseArgs();
const CHAIN = CHAINS[chainKey];
if (!CHAIN) {
  console.error(`Unknown --chain "${chainKey}". Valid keys:\n  ${Object.keys(CHAINS).join(", ")}`);
  process.exit(1);
}

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PRIVATE_KEY) {
  console.error("DEPLOYER_PRIVATE_KEY env var is required (and the wallet must be funded on the target chain).");
  process.exit(1);
}

// ── Load compiled artifact ────────────────────────────────────────────────────
const artifactPath = join(ROOT, "artifacts-hardhat/contracts/OrahDEXEscrow.sol/OrahDEXEscrow.json");
if (!existsSync(artifactPath)) {
  console.error(`Compiled artifact not found at ${artifactPath}\nRun: pnpm --filter @workspace/orahdex-contracts run compile`);
  process.exit(1);
}
const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, "utf8"));

// ── Provider failover ─────────────────────────────────────────────────────────
async function makeProvider() {
  for (const rpcUrl of CHAIN.rpcs) {
    try {
      console.log(`Trying RPC: ${rpcUrl} ...`);
      const provider = new ethers.JsonRpcProvider(rpcUrl, CHAIN.chainId, { staticNetwork: true });
      const block = await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      console.log(`  ✓ Connected — block ${block}`);
      return provider;
    } catch (err) {
      console.warn(`  ✗ Failed: ${err.message}`);
    }
  }
  throw new Error(`All RPCs failed for ${CHAIN.label}`);
}

// ── Frontend config merger ────────────────────────────────────────────────────
const ESCROW_ABI_LINES = [
  "function lockETH(bytes32 orderId) external payable",
  "function lockERC20(bytes32 orderId, address token, uint256 amount) external",
  "function release(bytes32 orderId, address recipient) external",
  "function cancel(bytes32 orderId) external",
  "function getDeposit(bytes32 orderId) external view returns (tuple(address depositor, address token, uint256 amount, uint64 lockedAt, bool released))",
  "function getDepositorOrders(address depositor) external view returns (bytes32[])",
  "event OrderLocked(bytes32 indexed orderId, address indexed depositor, address indexed token, uint256 amount)",
  "event OrderReleased(bytes32 indexed orderId, address indexed recipient, address token, uint256 amount)",
  "event OrderCancelled(bytes32 indexed orderId, address indexed depositor, address token, uint256 amount)",
];

/**
 * Merge a freshly-deployed (chainId → address) into the existing addresses
 * map already present in the on-disk escrowConfig.ts. Preserves every other
 * chain's address so re-running the deploy on chain N doesn't wipe chain M.
 */
function loadExistingAddresses(tsPath) {
  if (!existsSync(tsPath)) return {};
  const src = readFileSync(tsPath, "utf8");
  // Extract the ESCROW_ADDRESSES literal — tolerate spacing / comments.
  const m = src.match(/ESCROW_ADDRESSES[^=]*=\s*\{([\s\S]*?)\}/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const lm = line.match(/(\d+)\s*:\s*"(0x[0-9a-fA-F]+)"/);
    if (lm) out[Number(lm[1])] = lm[2];
  }
  return out;
}

function writeFrontendConfig(tsPath, addresses, deployerAddress) {
  const sorted = Object.keys(addresses).map(Number).sort((a, b) => a - b);
  const addrLines = sorted
    .map(cid => {
      const meta = Object.values(CHAINS).find(c => c.chainId === cid);
      const label = meta ? meta.label : `chainId ${cid}`;
      return `  ${cid}: "${addresses[cid]}",  // ${label}`;
    })
    .join("\n");

  const ts = `// AUTO-GENERATED by deploy-escrow-standalone.mjs — do not edit manually
// Last update: ${new Date().toISOString()}

export const ESCROW_ABI = ${JSON.stringify(ESCROW_ABI_LINES, null, 2)} as const;

/** Escrow contract address per EVM chainId. Populated as each chain is deployed. */
export const ESCROW_ADDRESSES: Record<number, string> = {
${addrLines}
};

/** The OrahDEX relayer address that can release / cancel escrow deposits. */
export const RELAYER_ADDRESS = "${deployerAddress}";

/** Default chainId used by legacy callers — first deployed chain. */
export const ESCROW_CHAIN_ID = ${sorted[0] ?? 11155111};

/** Returns true when an escrow contract is deployed on the given chainId. */
export function isEscrowSupported(chainId: number): boolean {
  return chainId in ESCROW_ADDRESSES;
}
`;
  writeFileSync(tsPath, ts);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== OrahDEXEscrow Deployment — ${CHAIN.label} (chainId ${CHAIN.chainId}) ===`);

  const provider = await makeProvider();
  const wallet   = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`\nDeployer: ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} (native)`);
  if (balance === 0n) throw new Error(`Deployer has no funds on ${CHAIN.label} — fund it first.`);

  const relayerAddress = wallet.address; // deployer = relayer (matches existing pattern)

  console.log("\nDeploying OrahDEXEscrow...");
  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(relayerAddress);
  console.log(`  tx: ${contract.deploymentTransaction()?.hash}`);
  const deployed   = await contract.waitForDeployment();
  const escrowAddr = await deployed.getAddress();
  console.log(`  ✓ Deployed at: ${escrowAddr}`);

  // ── Persist per-chain deployment record ──────────────────────────────────
  const deploymentsDir = join(ROOT, "deployments");
  const deployFile     = join(deploymentsDir, `${CHAIN.chainId}.json`);
  let existing = {};
  if (existsSync(deployFile)) existing = JSON.parse(readFileSync(deployFile, "utf8"));
  const updated = {
    ...existing,
    chainId:   CHAIN.chainId,
    network:   chainKey,
    label:     CHAIN.label,
    escrow:    escrowAddr,
    relayer:   relayerAddress,
    deployer:  wallet.address,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(deploymentsDir, { recursive: true });
  writeFileSync(deployFile, JSON.stringify(updated, null, 2));
  console.log(`\nSaved → deployments/${CHAIN.chainId}.json`);

  // Mirror to frontend deployments folder
  const frontendDir = join(ROOT, "..", "bsv-dex", "src", "lib", "deployments");
  mkdirSync(frontendDir, { recursive: true });
  writeFileSync(join(frontendDir, `${CHAIN.chainId}.json`), JSON.stringify(updated, null, 2));
  console.log(`Mirror → bsv-dex/src/lib/deployments/${CHAIN.chainId}.json`);

  // ── Merge into frontend escrowConfig.ts (preserves other chains) ─────────
  const tsPath = join(ROOT, "..", "bsv-dex", "src", "lib", "escrowConfig.ts");
  const merged = { ...loadExistingAddresses(tsPath), [CHAIN.chainId]: escrowAddr };
  writeFrontendConfig(tsPath, merged, relayerAddress);
  console.log(`Merged → bsv-dex/src/lib/escrowConfig.ts (now has ${Object.keys(merged).length} chain${Object.keys(merged).length === 1 ? "" : "s"})`);

  console.log(`\n✓ Done — ${CHAIN.label}`);
  console.log(`Explorer: ${CHAIN.explorer}/address/${escrowAddr}`);
  console.log(`\nNext: set EVM_HTLC_CONTRACT_${chainKey.toUpperCase().replace(/-/g, "_")}=${escrowAddr} in your API server env if you also want HTLC settlement on this chain.`);
}

main().catch(err => { console.error(err); process.exit(1); });
