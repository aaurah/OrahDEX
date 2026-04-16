import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * WETH addresses per chain ID.
 * On testnets, use the canonical testnet WETH.
 */
const WETH_ADDRESSES: Record<number, string> = {
  1:        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Ethereum mainnet
  8453:     "0x4200000000000000000000000000000000000006", // Base mainnet
  56:       "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // BNB Chain (WBNB)
  137:      "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // Polygon (WMATIC)
  42161:    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum
  10:       "0x4200000000000000000000000000000000000006", // Optimism
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // Sepolia testnet
  84532:    "0x4200000000000000000000000000000000000006", // Base Sepolia
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;
  const chainIdNum = Number(chainId);

  console.log(`\n=== OrahDEX AMM Deployment ===`);
  console.log(`Network:  ${network.name} (chainId: ${chainIdNum})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const weth = WETH_ADDRESSES[chainIdNum];
  if (!weth) {
    throw new Error(`No WETH address configured for chainId ${chainIdNum}. Add it to WETH_ADDRESSES.`);
  }
  console.log(`WETH: ${weth}`);

  // 1. Deploy OrahFactory
  console.log("\n[1/2] Deploying OrahFactory...");
  const Factory    = await ethers.getContractFactory("OrahFactory");
  const factory    = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`      OrahFactory deployed at: ${factoryAddr}`);

  // 2. Deploy OrahRouter02
  console.log("[2/2] Deploying OrahRouter02...");
  const Router  = await ethers.getContractFactory("OrahRouter02");
  const router  = await Router.deploy(factoryAddr, weth);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log(`      OrahRouter02 deployed at: ${routerAddr}`);

  // 3. Persist addresses for the frontend
  const addresses = {
    chainId:   chainIdNum,
    network:   network.name,
    factory:   factoryAddr,
    router:    routerAddr,
    weth,
    deployedAt: new Date().toISOString(),
  };

  const outDir  = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, `${chainIdNum}.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved → ${outFile}`);

  // 4. Also write to the frontend lib directory
  const frontendDir = path.join(__dirname, "..", "..", "bsv-dex", "src", "lib");
  const frontendDeploymentsDir = path.join(frontendDir, "deployments");
  fs.mkdirSync(frontendDeploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(frontendDeploymentsDir, `${chainIdNum}.json`),
    JSON.stringify(addresses, null, 2)
  );
  console.log(`Addresses synced  → frontend/src/lib/deployments/${chainIdNum}.json`);

  console.log("\n✓ Deployment complete!");
  console.log(`\nFactory:  ${factoryAddr}`);
  console.log(`Router:   ${routerAddr}`);
  console.log(`WETH:     ${weth}`);
  console.log(`\nNext: Update orahAmmAddresses.ts with these values for chainId ${chainIdNum}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
