import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  id,
  keccak256,
  parseEther,
  parseUnits,
  toUtf8Bytes,
} from "ethers";

const CHAIN_ID = 11155111;
const WETH_ADDRESS = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploymentPath = path.join(__dirname, "..", "deployments", "orderbook-11155111.json");
const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const escrowAbi = [
  "function feeBps() view returns (uint16)",
  "function feeRecipient() view returns (address)",
  "function openOrder(bytes32 orderId,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 quoteAmount,uint256 limitPriceX18,uint64 expiresAt) payable",
  "function settle(bytes32 settlementId,bytes32 buyOrderId,bytes32 sellOrderId,uint256 baseAmount,uint256 grossQuoteAmount)",
  "function cancel(bytes32 orderId)",
  "function orders(bytes32) view returns (address maker,address baseToken,address quoteToken,uint256 originalBaseAmount,uint256 remainingBaseAmount,uint256 remainingEscrowAmount,uint256 limitPriceX18,uint64 expiresAt,uint8 side,bool active)",
  "event OrderOpened(bytes32 indexed orderId,address indexed maker,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 escrowAmount,uint256 limitPriceX18,uint64 expiresAt)",
  "event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)",
];
const wethAbi = [
  "function deposit() payable",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

async function confirmed(txPromise, label, confirmations = 3) {
  const tx = await txPromise;
  console.log(`${label} submitted`);
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} did not confirm successfully`);
  return receipt;
}

async function main() {
  if (process.env.EVM_ORDERBOOK_SEPOLIA_SMOKE_TEST !== "true") {
    throw new Error("Set EVM_ORDERBOOK_SEPOLIA_SMOKE_TEST=true to run the Sepolia-only lifecycle test.");
  }
  if (!fs.existsSync(deploymentPath)) throw new Error("Sepolia orderbook deployment record is missing.");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.chainId !== CHAIN_ID || !/^0x[0-9a-fA-F]{40}$/.test(deployment.address ?? "")) {
    throw new Error("Deployment record is not a valid Sepolia orderbook contract.");
  }

  const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID);
  if (Number((await provider.getNetwork()).chainId) !== CHAIN_ID) {
    throw new Error("Refusing the lifecycle test on any network other than Sepolia.");
  }
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const relayerKey = (process.env.EVM_ORDERBOOK_RELAYER_KEY ?? process.env.EVM_WALLET_SECRET ?? "").trim();
  if (!deployerKey || !/^((0x)?[0-9a-fA-F]{64})$/.test(relayerKey)) {
    throw new Error("The test deployer and order relayer must be configured in Replit Secrets.");
  }
  const sponsor = new Wallet(deployerKey, provider);
  const relayer = new Wallet(relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`, provider);
  // Derive disposable test wallets deterministically so a rerun can find and
  // refund any test orders left open by an interrupted smoke test.
  const seller = new Wallet(keccak256(toUtf8Bytes(`${sponsor.privateKey}:orahdex-sepolia-smoke-seller`)), provider);
  const buyer = new Wallet(keccak256(toUtf8Bytes(`${sponsor.privateKey}:orahdex-sepolia-smoke-buyer`)), provider);
  const escrow = new Contract(deployment.address, escrowAbi, provider);
  const weth = new Contract(WETH_ADDRESS, wethAbi, provider);
  const feeBps = BigInt(await escrow.feeBps());
  if (feeBps > 200n) throw new Error("Escrow fee exceeds the safety limit.");

  const cleanupOrders = async (wallet) => {
    const events = await escrow.queryFilter(escrow.filters.OrderOpened(null, wallet.address), deployment.deploymentBlock);
    for (const event of events) {
      const orderKey = event.args?.orderId;
      if (!orderKey) continue;
      const current = await escrow.orders(orderKey);
      if (current.active && current.maker.toLowerCase() === wallet.address.toLowerCase()) {
        await confirmed(escrow.connect(wallet).cancel(orderKey), "Refund previous temporary test order", 1);
      }
    }
  };
  await cleanupOrders(seller);
  await cleanupOrders(buyer);

  const ensureBalance = async (wallet, minBalance, label) => {
    const balance = await provider.getBalance(wallet.address);
    if (balance < minBalance) {
      const tx = await sponsor.sendTransaction({ to: wallet.address, value: minBalance - balance });
      await confirmed(Promise.resolve(tx), label, 1);
    }
  };
  await ensureBalance(seller, parseEther("0.004"), "Fund temporary test seller");
  await ensureBalance(buyer, parseEther("0.004"), "Fund temporary test buyer");

  const minRelayerBalance = parseEther("0.01");
  const relayerBalance = await provider.getBalance(relayer.address);
  if (relayerBalance < minRelayerBalance && relayer.address.toLowerCase() !== sponsor.address.toLowerCase()) {
    const transfer = await sponsor.sendTransaction({ to: relayer.address, value: minRelayerBalance - relayerBalance });
    await confirmed(Promise.resolve(transfer), "Fund testnet order relayer", 1);
  }
  if (relayerBalance < minRelayerBalance && relayer.address.toLowerCase() === sponsor.address.toLowerCase()) {
    throw new Error("The shared sponsor/relayer wallet needs more Sepolia ETH before the smoke test.");
  }
  if ((await provider.getBalance(relayer.address)) < minRelayerBalance) {
    throw new Error("The order relayer still lacks the Sepolia ETH needed for settlement.");
  }

  await confirmed(weth.connect(seller).deposit({ value: parseEther("0.002") }), "Wrap seller test ETH", 1);

  const amount = parseEther("0.001");
  const buyerQuote = parseEther("0.0011");
  const sellerPrice = parseUnits("0.9", 18);
  const buyerPrice = parseUnits("1.1", 18);
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const runId = randomBytes(16).toString("hex");
  const sellerOrderId = id(`orahdex-sepolia-seller-${runId}`);
  const buyerOrderId = id(`orahdex-sepolia-buyer-${runId}`);
  const settlementId = id(`orahdex-sepolia-fill-${runId}`);

  await confirmed(weth.connect(seller).approve(deployment.address, amount), "Approve seller WETH", 1);
  await escrow.connect(seller).openOrder.staticCall(
    sellerOrderId, 1, WETH_ADDRESS, ZeroAddress, amount, 0, sellerPrice, expiresAt,
  );
  await confirmed(
    escrow.connect(seller).openOrder(sellerOrderId, 1, WETH_ADDRESS, ZeroAddress, amount, 0, sellerPrice, expiresAt),
    "Open seller order",
  );
  await confirmed(
    escrow.connect(buyer).openOrder(
      buyerOrderId, 0, WETH_ADDRESS, ZeroAddress, amount, buyerQuote, buyerPrice, expiresAt,
      { value: buyerQuote },
    ),
    "Open buyer order",
  );

  const buyerWethBefore = await weth.balanceOf(buyer.address);
  const sellerEthBefore = await provider.getBalance(seller.address);
  const grossQuote = parseEther("0.001");
  const expectedFee = grossQuote * feeBps / 10_000n;
  const settlementReceipt = await confirmed(
    escrow.connect(relayer).settle(settlementId, buyerOrderId, sellerOrderId, amount, grossQuote),
    "Settle matched order pair",
  );
  const settledEvent = settlementReceipt.logs
    .map((log) => {
      try { return escrow.interface.parseLog(log); } catch { return null; }
    })
    .find((event) => event?.name === "OrderSettled");
  if (!settledEvent || settledEvent.args.feeAmount !== expectedFee) {
    throw new Error("Settlement event does not report the expected fee.");
  }
  if ((await weth.balanceOf(buyer.address)) - buyerWethBefore !== amount) {
    throw new Error("Buyer did not receive the escrowed WETH.");
  }
  if ((await provider.getBalance(seller.address)) - sellerEthBefore !== grossQuote - expectedFee) {
    throw new Error("Seller proceeds do not match the on-chain fee calculation.");
  }

  const cancelOrderId = id(`orahdex-sepolia-cancel-${runId}`);
  const cancelAmount = parseEther("0.0005");
  const sellerWethBeforeCancel = await weth.balanceOf(seller.address);
  await confirmed(weth.connect(seller).approve(deployment.address, cancelAmount), "Approve cancellation WETH", 1);
  await confirmed(
    escrow.connect(seller).openOrder(
      cancelOrderId, 1, WETH_ADDRESS, ZeroAddress, cancelAmount, 0, sellerPrice, expiresAt,
    ),
    "Open order for cancellation",
  );
  await confirmed(escrow.connect(seller).cancel(cancelOrderId), "Cancel order and refund seller");
  if ((await weth.balanceOf(seller.address)) !== sellerWethBeforeCancel) {
    throw new Error("Seller did not recover the exact WETH collateral after cancellation.");
  }

  console.log("Sepolia orderbook lifecycle passed: open, atomic fill, fee, and cancel/refund.");
  console.log(`Escrow: ${deployment.address}`);
}

main().catch((error) => {
  console.error("Sepolia orderbook lifecycle test failed:", error?.shortMessage ?? error?.message ?? error);
  process.exitCode = 1;
});
