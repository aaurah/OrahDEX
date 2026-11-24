import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, isAddress, ZeroAddress } from "ethers";

const CHAIN_ID = 11155111;
const FEE_BPS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.join(
  "/tmp/orahdex-hardhat-artifacts",
  "contracts",
  "OrahDEXOrderbookEscrow.sol",
  "OrahDEXOrderbookEscrow.json",
);
const outputPath = path.join(__dirname, "..", "deployments", "orderbook-11155111.json");
const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

async function main() {
  const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ${network.chainId}; Sepolia (11155111) is required.`);
  }
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required.");
  if (fs.existsSync(outputPath)) {
    throw new Error(`Deployment record already exists at ${outputPath}; refusing a second Sepolia deployment.`);
  }
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Contract artifact is missing; compile the contracts package first.");
  }

  const wallet = new Wallet(privateKey, provider);
  const feeRecipient = process.env.EVM_ORDERBOOK_FEE_RECIPIENT?.trim() || wallet.address;
  if (!isAddress(feeRecipient) || feeRecipient.toLowerCase() === ZeroAddress) {
    throw new Error("EVM_ORDERBOOK_FEE_RECIPIENT must be a non-zero EVM address.");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployRequest = await factory.getDeployTransaction(feeRecipient, FEE_BPS);
  const [balance, feeData, estimatedGas] = await Promise.all([
    provider.getBalance(wallet.address),
    provider.getFeeData(),
    provider.estimateGas({ ...deployRequest, from: wallet.address }),
  ]);
  const minPriority = 1_000_000_000n;
  const priorityFee = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minPriority
    ? feeData.maxPriorityFeePerGas
    : minPriority;
  const suggestedMaxFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const maxFeePerGas = suggestedMaxFee > priorityFee * 2n ? suggestedMaxFee : priorityFee * 2n;
  const gasLimit = estimatedGas * 125n / 100n;
  const maxExpectedCost = gasLimit * maxFeePerGas;
  const minRequiredBalance = maxExpectedCost * 110n / 100n;
  console.log("Network: Sepolia (chain 11155111)");
  console.log(`Fee: ${FEE_BPS} bps (0.1%)`);
  console.log(`Estimated maximum gas: ${formatEther(maxExpectedCost)} test ETH`);
  if (balance < minRequiredBalance) {
    throw new Error("The deployer wallet does not have enough Sepolia ETH plus reserve.");
  }
  if (process.env.EVM_ORDERBOOK_SEPOLIA_DEPLOY !== "true") {
    console.log("Dry run only. Set EVM_ORDERBOOK_SEPOLIA_DEPLOY=true to submit this testnet deployment.");
    return;
  }

  const contract = await factory.deploy(feeRecipient, FEE_BPS, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas: priorityFee,
  });
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("No Sepolia deployment transaction was created.");
  console.log(`Deployment transaction: ${tx.hash}`);
  const receipt = await tx.wait(3);
  if (!receipt || receipt.status !== 1) throw new Error("Sepolia orderbook escrow deployment failed.");
  const address = await contract.getAddress();
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error("Deployment receipt exists, but the address has no contract code.");

  const deployedFeeBps = Number(await contract.feeBps());
  const deployedFeeRecipient = await contract.feeRecipient();
  if (deployedFeeBps !== FEE_BPS || deployedFeeRecipient.toLowerCase() !== feeRecipient.toLowerCase()) {
    throw new Error("Deployed Sepolia orderbook escrow configuration does not match.");
  }
  const record = {
    chainId: CHAIN_ID,
    network: "sepolia",
    address,
    feeRecipient,
    feeBps: FEE_BPS,
    deploymentTxHash: tx.hash,
    deploymentBlock: receipt.blockNumber,
    confirmations: 3,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Verified Sepolia escrow address: ${address}`);
  console.log(`Deployment record: ${outputPath}`);
}

main().catch((error) => {
  console.error("Sepolia orderbook escrow deployment failed:", error?.shortMessage ?? error?.message ?? error);
  process.exitCode = 1;
});
