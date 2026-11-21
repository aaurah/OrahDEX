import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContractFactory,
  Interface,
  Wallet,
  formatEther,
  isAddress,
  ZeroAddress,
} from "ethers";

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
const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
let rpcId = 0;

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`Sepolia RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`Sepolia RPC ${method}: ${body.error.message ?? "request failed"}`);
  return body.result;
}

async function waitForConfirmations(txHash, confirmations = 3) {
  let receipt = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  if (!receipt) throw new Error(`Deployment receipt was not found; transaction hash: ${txHash}`);
  if (receipt.status !== "0x1") throw new Error(`Deployment reverted; transaction hash: ${txHash}`);
  const minedBlock = BigInt(receipt.blockNumber);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const latest = BigInt(await rpc("eth_blockNumber"));
    if (latest - minedBlock + 1n >= BigInt(confirmations)) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Deployment is not yet ${confirmations}-confirmed; transaction hash: ${txHash}`);
}

async function main() {
  const chainId = Number(BigInt(await rpc("eth_chainId")));
  if (chainId !== CHAIN_ID) {
    throw new Error(`Refusing to run on chain ${chainId}; Sepolia (11155111) is required.`);
  }
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Contract artifact is missing; compile with hardhat.offline.config.cjs first.");
  }
  if (fs.existsSync(outputPath)) {
    throw new Error(`Deployment record already exists at ${outputPath}; refusing a second Sepolia deployment.`);
  }

  const feeRecipient = process.env.EVM_ORDERBOOK_SEPOLIA_FEE_RECIPIENT?.trim();
  if (!feeRecipient || !isAddress(feeRecipient) || feeRecipient.toLowerCase() === ZeroAddress.toLowerCase()) {
    throw new Error("EVM_ORDERBOOK_SEPOLIA_FEE_RECIPIENT must be a non-zero EVM address.");
  }
  const privateKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error("SEPOLIA_DEPLOYER_PRIVATE_KEY is required for an explicitly approved deployment.");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const wallet = new Wallet(privateKey);
  const iface = new Interface(artifact.abi);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployRequest = await factory.getDeployTransaction(feeRecipient, FEE_BPS);
  const [nonceHex, balanceHex, gasPriceHex, estimatedGasHex] = await Promise.all([
    rpc("eth_getTransactionCount", [wallet.address, "pending"]),
    rpc("eth_getBalance", [wallet.address, "pending"]),
    rpc("eth_gasPrice"),
    rpc("eth_estimateGas", [{ from: wallet.address, data: String(deployRequest.data), value: "0x0" }]),
  ]);
  const nonce = BigInt(nonceHex);
  const balance = BigInt(balanceHex);
  const gasPrice = BigInt(gasPriceHex);
  const gasLimit = BigInt(estimatedGasHex) * 125n / 100n;
  const estimatedCost = gasLimit * gasPrice;
  const reserveRequired = estimatedCost * 110n / 100n;

  console.log("Network: Ethereum Sepolia (chain 11155111)");
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log(`Fee: ${FEE_BPS} bps (0.1%)`);
  console.log(`Estimated gas limit: ${gasLimit}`);
  console.log(`Estimated maximum gas cost: ${formatEther(estimatedCost)} Sepolia ETH`);
  if (balance < reserveRequired) throw new Error("Deployer wallet does not have enough Sepolia ETH for the estimate plus reserve.");
  if (process.env.EVM_ORDERBOOK_DEPLOY_DRY_RUN === "true") {
    console.log("Dry run complete; no transaction was sent.");
    return;
  }
  if (process.env.ALLOW_SEPOLIA_ORDERBOOK_DEPLOY !== "true") {
    throw new Error("No deployment sent. Set ALLOW_SEPOLIA_ORDERBOOK_DEPLOY=true only after explicit approval.");
  }

  const signedTransaction = await wallet.signTransaction({
    chainId: CHAIN_ID,
    nonce,
    gasLimit,
    gasPrice,
    value: 0n,
    data: String(deployRequest.data),
  });
  const txHash = await rpc("eth_sendRawTransaction", [signedTransaction]);
  const receipt = await waitForConfirmations(txHash, 3);
  if (!receipt.contractAddress) throw new Error(`Missing deployed address; transaction hash: ${txHash}`);

  const address = receipt.contractAddress;
  const deployedCode = await rpc("eth_getCode", [address, "latest"]);
  if (!deployedCode || deployedCode === "0x") throw new Error("Deployment has no contract code.");
  const [feeBpsResult, feeRecipientResult] = await Promise.all([
    rpc("eth_call", [{ to: address, data: iface.encodeFunctionData("feeBps") }, "latest"]),
    rpc("eth_call", [{ to: address, data: iface.encodeFunctionData("feeRecipient") }, "latest"]),
  ]);
  const deployedFeeBps = Number(iface.decodeFunctionResult("feeBps", feeBpsResult)[0]);
  const deployedFeeRecipient = iface.decodeFunctionResult("feeRecipient", feeRecipientResult)[0];
  if (deployedFeeBps !== FEE_BPS || deployedFeeRecipient.toLowerCase() !== feeRecipient.toLowerCase()) {
    throw new Error("Deployed contract configuration did not match the requested Sepolia settings.");
  }

  const record = {
    chainId: CHAIN_ID,
    network: "sepolia",
    address,
    feeRecipient,
    feeBps: FEE_BPS,
    deploymentTxHash: txHash,
    deploymentBlock: Number(BigInt(receipt.blockNumber)),
    confirmations: 3,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Verified Sepolia orderbook escrow: ${address}`);
  console.log(`Deployment block: ${record.deploymentBlock}`);
}

main().catch((error) => {
  console.error("Sepolia orderbook escrow deployment failed:", error?.shortMessage ?? error?.message ?? error);
  process.exitCode = 1;
});
