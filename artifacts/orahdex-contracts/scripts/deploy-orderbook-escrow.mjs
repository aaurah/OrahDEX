import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, Interface, Wallet, formatEther, isAddress, ZeroAddress } from "ethers";

const CHAIN_ID = 1;
const FEE_BPS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.join("/tmp/orahdex-hardhat-artifacts", "contracts", "OrahDEXOrderbookEscrow.sol", "OrahDEXOrderbookEscrow.json");
const outputPath = path.join(__dirname, "..", "deployments", "orderbook-1.json");
const rpcUrl = process.env.ETH_RPC_URL ||
  (process.env.ALCHEMY_API_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : "https://ethereum-rpc.publicnode.com");
let rpcId = 0;

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`Ethereum RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`Ethereum RPC ${method}: ${body.error.message ?? "request failed"}`);
  return body.result;
}

async function waitForConfirmations(txHash, confirmations = 3) {
  let receipt = null;
  for (let attempt = 0; attempt < 180; attempt++) {
    receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!receipt) throw new Error(`Deployment receipt was not found; transaction hash: ${txHash}`);
  if (receipt.status !== "0x1") throw new Error(`Deployment transaction reverted; transaction hash: ${txHash}`);
  const minedBlock = BigInt(receipt.blockNumber);
  for (let attempt = 0; attempt < 180; attempt++) {
    const latest = BigInt(await rpc("eth_blockNumber"));
    if (latest - minedBlock + 1n >= BigInt(confirmations)) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Deployment is not yet ${confirmations}-confirmed; transaction hash: ${txHash}`);
}

async function main() {
  const chainId = Number(BigInt(await rpc("eth_chainId")));
  if (chainId !== CHAIN_ID) throw new Error(`Refusing deployment on chain ${chainId}; Ethereum mainnet (1) is required.`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required.");
  const feeRecipient = process.env.EVM_ORDERBOOK_FEE_RECIPIENT?.trim();
  if (!feeRecipient || !isAddress(feeRecipient) || feeRecipient.toLowerCase() === ZeroAddress) {
    throw new Error("EVM_ORDERBOOK_FEE_RECIPIENT must be a non-zero Ethereum address.");
  }
  if (fs.existsSync(outputPath)) {
    throw new Error(`Deployment record already exists at ${outputPath}; refusing a second mainnet deployment.`);
  }
  if (!fs.existsSync(artifactPath)) throw new Error("Contract artifact is missing; run the package deployment command to compile first.");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const wallet = new Wallet(privateKey);
  const iface = new Interface(artifact.abi);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployRequest = await factory.getDeployTransaction(feeRecipient, FEE_BPS);
  const deployData = String(deployRequest.data);
  const [nonceHex, balanceHex, gasPriceHex, estimatedGasHex] = await Promise.all([
    rpc("eth_getTransactionCount", [wallet.address, "pending"]),
    rpc("eth_getBalance", [wallet.address, "pending"]),
    rpc("eth_gasPrice"),
    rpc("eth_estimateGas", [{
      from: wallet.address,
      data: deployData,
      value: "0x0",
    }]),
  ]);
  const nonce = BigInt(nonceHex);
  const balance = BigInt(balanceHex);
  const gasPrice = BigInt(gasPriceHex);
  const gasLimit = BigInt(estimatedGasHex) * 125n / 100n;
  const maxExpectedCost = gasLimit * gasPrice;
  const minRequiredBalance = maxExpectedCost * 110n / 100n;

  console.log("Network: Ethereum mainnet (chain 1)");
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log(`Fee: ${FEE_BPS} bps (0.1%)`);
  console.log(`Estimated gas limit: ${gasLimit.toString()}`);
  console.log(`Estimated max gas cost: ${formatEther(maxExpectedCost)} ETH`);
  if (balance < minRequiredBalance) {
    console.log(`Deployer address to fund: ${wallet.address}`);
    throw new Error("Deployer wallet does not have enough ETH to cover the estimated gas plus reserve.");
  }
  if (process.env.EVM_ORDERBOOK_DEPLOY_DRY_RUN === "true") {
    console.log("Dry run: gas estimate completed; no transaction was sent.");
    return;
  }

  const signedTransaction = await wallet.signTransaction({
    chainId: CHAIN_ID,
    nonce,
    gasLimit,
    gasPrice,
    value: 0n,
    data: deployData,
  });
  const txHash = await rpc("eth_sendRawTransaction", [signedTransaction]);
  console.log(`Deployment transaction: ${txHash}`);
  const receipt = await waitForConfirmations(txHash, 3);
  if (!receipt.contractAddress) throw new Error(`Missing deployed address; transaction hash: ${txHash}`);

  const address = receipt.contractAddress;
  const deployedCode = await rpc("eth_getCode", [address, "latest"]);
  if (!deployedCode || deployedCode === "0x") throw new Error("Deployment receipt exists, but the address has no contract code.");
  const [feeBpsResult, feeRecipientResult] = await Promise.all([
    rpc("eth_call", [{ to: address, data: iface.encodeFunctionData("feeBps") }, "latest"]),
    rpc("eth_call", [{ to: address, data: iface.encodeFunctionData("feeRecipient") }, "latest"]),
  ]);
  const deployedFeeBps = Number(iface.decodeFunctionResult("feeBps", feeBpsResult)[0]);
  const deployedFeeRecipient = iface.decodeFunctionResult("feeRecipient", feeRecipientResult)[0];
  if (deployedFeeBps !== FEE_BPS || deployedFeeRecipient.toLowerCase() !== feeRecipient.toLowerCase()) {
    throw new Error(`Deployed contract configuration mismatch; address: ${address}`);
  }

  const record = {
    chainId: CHAIN_ID,
    network: "ethereum",
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
  console.log(`Verified escrow address: ${address}`);
  console.log(`Deployment block: ${receipt.blockNumber}`);
  console.log(`Deployment record: ${outputPath}`);
}

main().catch((error) => {
  console.error("Ethereum orderbook escrow deployment failed:", error?.shortMessage ?? error?.message ?? error);
  process.exitCode = 1;
});
