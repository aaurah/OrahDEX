/**
 * Standalone OrahDEXHTLC deployer — chain-agnostic.
 *   node scripts/deploy-htlc-standalone.mjs --chain sepolia
 * Requires env: DEPLOYER_PRIVATE_KEY (funded on target chain).
 * Merges "htlc" into deployments/<chainId>.json — never touches escrow/factory/router.
 */
import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CHAINS = {
  ethereum:  { chainId: 1,     label: "Ethereum",   rpcs: ["https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth", "https://eth.llamarpc.com"] },
  polygon:   { chainId: 137,   label: "Polygon",    rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://1rpc.io/matic", "https://polygon-rpc.com"] },
  bsc:       { chainId: 56,    label: "BSC",        rpcs: ["https://bsc-dataseed.binance.org", "https://rpc.ankr.com/bsc"] },
  sepolia:   { chainId: 11155111, label: "Sepolia", rpcs: ["https://eth-sepolia.public.blastapi.io", "https://sepolia.drpc.org", "https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia"] },
  "base-sepolia": { chainId: 84532, label: "Base Sepolia", rpcs: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"] },
};

const args = process.argv.slice(2);
let chainKey = "sepolia";
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--chain" || args[i] === "-c") && args[i + 1]) { chainKey = args[i + 1]; i++; }
  else if (args[i].startsWith("--chain=")) chainKey = args[i].slice(8);
}
const CHAIN = CHAINS[chainKey];
if (!CHAIN) { console.error(`Unknown chain "${chainKey}". Valid: ${Object.keys(CHAINS).join(", ")}`); process.exit(1); }

const PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) { console.error("DEPLOYER_PRIVATE_KEY env var required"); process.exit(1); }

const artifactPath = join(ROOT, "artifacts-hardhat/contracts/OrahDEXHTLC.sol/OrahDEXHTLC.json");
if (!existsSync(artifactPath)) { console.error(`Artifact missing: ${artifactPath}\nRun: pnpm run compile`); process.exit(1); }
const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, "utf8"));

const ctorInputs = abi.find(x => x.type === "constructor")?.inputs ?? [];
if (ctorInputs.length > 0) { console.error("Constructor requires args:", JSON.stringify(ctorInputs)); process.exit(1); }

async function makeProvider() {
  for (const rpc of CHAIN.rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(rpc, CHAIN.chainId, { staticNetwork: true });
      const block = await Promise.race([p.getBlockNumber(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 8000))]);
      console.log(`RPC: ${rpc} (block ${block})`);
      return p;
    } catch { console.warn(`RPC failed: ${rpc}`); }
  }
  throw new Error("All RPCs failed");
}

const provider = await makeProvider();
const wallet = new ethers.Wallet(PK, provider);
const bal = await provider.getBalance(wallet.address);
console.log(`\n=== OrahDEXHTLC deploy — ${CHAIN.label} (${CHAIN.chainId}) ===`);
console.log(`Deployer: ${wallet.address}\nBalance:  ${ethers.formatEther(bal)} ETH`);
if (bal === 0n) throw new Error("Deployer unfunded");

console.log("\nDeploying OrahDEXHTLC...");
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const c = await factory.deploy();
console.log(`  tx: ${c.deploymentTransaction()?.hash}`);
await c.waitForDeployment();
const htlcAddr = await c.getAddress();
console.log(`  deployed at: ${htlcAddr}`);

// Merge into per-chain deployment record (preserve escrow/factory/router)
const deployFile = join(ROOT, "deployments", `${CHAIN.chainId}.json`);
const existing = existsSync(deployFile) ? JSON.parse(readFileSync(deployFile, "utf8")) : {};
const updated = { ...existing, chainId: CHAIN.chainId, network: chainKey, label: CHAIN.label, htlc: htlcAddr, htlcDeployedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
mkdirSync(join(ROOT, "deployments"), { recursive: true });
writeFileSync(deployFile, JSON.stringify(updated, null, 2));
console.log(`\nSaved -> deployments/${CHAIN.chainId}.json`);
console.log(`NEXT: set this address as the HTLC for chain ${CHAIN.chainId} in evmHtlc.ts / env`);
