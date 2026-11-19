import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  formatEther,
  id,
  keccak256,
  parseEther,
  parseUnits,
  toUtf8Bytes,
} from "ethers";

const CHAIN_ID = 1;
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const MAX_TEMPORARY_COLLATERAL = parseEther("0.002");
const MAX_GAS_SPEND = parseEther("0.001");
const CLEANUP_GAS_RESERVE = 260_000n;
const TEST_BUYER_TARGET = parseEther("0.0008");
const BASE_AMOUNT = parseEther("0.0001");
const BUYER_BASE_AMOUNT = parseEther("0.0002");
const BUYER_QUOTE_AMOUNT = parseEther("0.00022");
const SELLER_LIMIT = parseUnits("0.9", 18);
const BUYER_LIMIT = parseUnits("1.1", 18);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploymentPath = path.join(__dirname, "..", "deployments", "orderbook-1.json");
const statePath = path.join(__dirname, "..", "deployments", ".orderbook-1-smoke-state.json");
const rpcUrl = process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";

const escrowAbi = [
  "function feeBps() view returns (uint16)",
  "function feeRecipient() view returns (address)",
  "function openOrder(bytes32 orderId,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 quoteAmount,uint256 limitPriceX18,uint64 expiresAt) payable",
  "function settle(bytes32 settlementId,bytes32 buyOrderId,bytes32 sellOrderId,uint256 baseAmount,uint256 grossQuoteAmount)",
  "function cancel(bytes32 orderId)",
  "function orders(bytes32) view returns (address maker,address baseToken,address quoteToken,uint256 originalBaseAmount,uint256 remainingBaseAmount,uint256 remainingEscrowAmount,uint256 limitPriceX18,uint64 expiresAt,uint8 side,bool active)",
  "function settledFills(bytes32) view returns (bool)",
  "event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)",
  "event OrderCancelled(bytes32 indexed orderId,address indexed maker,uint256 refundAmount)",
];
const wethAbi = [
  "function deposit() payable",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
  "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
];

async function main() {
  if (process.env.EVM_ORDERBOOK_ETH_SMOKE_TEST !== "true") {
    throw new Error("Set EVM_ORDERBOOK_ETH_SMOKE_TEST=true to authorize this capped Ethereum mainnet smoke test.");
  }
  if (fs.existsSync(statePath)) {
    throw new Error("An earlier mainnet smoke test left recovery state; do not start another test.");
  }
  if (!fs.existsSync(deploymentPath)) throw new Error("The Ethereum orderbook deployment record is missing.");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.chainId !== CHAIN_ID || !/^0x[0-9a-fA-F]{40}$/.test(deployment.address ?? "")) {
    throw new Error("Refusing: the deployment record is not an Ethereum mainnet orderbook contract.");
  }
  if (process.env.EVM_ORDERBOOK_ESCROW_ETH &&
      process.env.EVM_ORDERBOOK_ESCROW_ETH.toLowerCase() !== deployment.address.toLowerCase()) {
    throw new Error("The configured Ethereum escrow differs from the mainnet deployment record.");
  }

  const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID);
  if (Number((await provider.getNetwork()).chainId) !== CHAIN_ID) {
    throw new Error("Refusing to send transactions on any network other than Ethereum mainnet.");
  }
  const rawRelayerKey = (process.env.EVM_ORDERBOOK_RELAYER_KEY ?? process.env.EVM_WALLET_SECRET ?? "").trim();
  if (!/^((0x)?[0-9a-fA-F]{64})$/.test(rawRelayerKey)) {
    throw new Error("The Ethereum orderbook relayer is not configured in Replit Secrets.");
  }
  const relayer = new Wallet(rawRelayerKey.startsWith("0x") ? rawRelayerKey : `0x${rawRelayerKey}`, provider);
  const buyerKey = keccak256(toUtf8Bytes(`${relayer.privateKey}:orahdex-mainnet-orderbook-smoke-buyer-v1`));
  const buyer = new Wallet(buyerKey, provider);
  if (buyer.address.toLowerCase() === relayer.address.toLowerCase()) {
    throw new Error("The temporary buyer must be separate from the order relayer.");
  }

  const escrow = new Contract(deployment.address, escrowAbi, provider);
  const weth = new Contract(WETH_ADDRESS, wethAbi, provider);
  const [code, feeBps, feeRecipient, initialRelayerBalance, initialRelayerWeth, initialBuyerWeth, initialBuyerEth, gasPrice] =
    await Promise.all([
      provider.getCode(deployment.address),
      escrow.feeBps(),
      escrow.feeRecipient(),
      provider.getBalance(relayer.address),
      weth.balanceOf(relayer.address),
      weth.balanceOf(buyer.address),
      provider.getBalance(buyer.address),
      provider.getFeeData().then((feeData) => feeData.gasPrice ?? feeData.maxFeePerGas),
    ]);
  if (code === "0x") throw new Error("The configured mainnet orderbook address has no contract code.");
  if (Number(feeBps) !== Number(deployment.feeBps) ||
      feeRecipient.toLowerCase() !== deployment.feeRecipient.toLowerCase()) {
    throw new Error("The deployed fee settings do not match the mainnet deployment record.");
  }
  if (feeRecipient.toLowerCase() !== relayer.address.toLowerCase()) {
    throw new Error(
      `The configured relayer key derives ${relayer.address}, but the deployed escrow fee recipient is ${feeRecipient}; no test transactions were sent.`,
    );
  }
  if (gasPrice === null) throw new Error("Ethereum RPC did not provide a usable gas price.");
  if (gasPrice > parseUnits("2", "gwei")) {
    throw new Error("Current mainnet gas price exceeds the smoke-test cap; no transactions were sent.");
  }

  const reserve = gasPrice * 2_000_000n;
  const buyerTopUp = initialBuyerEth < TEST_BUYER_TARGET ? TEST_BUYER_TARGET - initialBuyerEth : 0n;
  if (buyerTopUp > MAX_TEMPORARY_COLLATERAL) {
    throw new Error("Temporary buyer funding would exceed the approved 0.002 ETH collateral cap.");
  }
  if (initialRelayerBalance < reserve + buyerTopUp + gasPrice * 700_000n) {
    throw new Error("The relayer cannot fund this test and retain the configured gas reserve; no transactions were sent.");
  }
  if (initialBuyerWeth !== 0n) {
    throw new Error("The dedicated temporary buyer already holds WETH; refusing to use or move prior test assets.");
  }

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const sellerOrderId = id(`orahdex-mainnet-smoke-seller-${runId}`);
  const buyerOrderId = id(`orahdex-mainnet-smoke-buyer-${runId}`);
  const settlementId = id(`orahdex-mainnet-smoke-fill-${runId}`);
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const state = {
    chainId: CHAIN_ID,
    contract: deployment.address,
    relayer: relayer.address,
    buyer: buyer.address,
    sellerOrderId,
    buyerOrderId,
    settlementId,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });

  let gasBudgetReserved = 0n;
  let gasActuallySpent = 0n;
  const cleanupReserve = gasPrice * CLEANUP_GAS_RESERVE;
  const txHashes = [];
  let testPassed = false;

  async function submit(wallet, request, label, { confirmations = 3, cleanup = false } = {}) {
    const estimate = await provider.estimateGas({ ...request, from: wallet.address });
    const gasLimit = (estimate * 115n + 99n) / 100n;
    const maxCost = gasLimit * gasPrice;
    if (gasBudgetReserved + maxCost + (cleanup ? 0n : cleanupReserve) > MAX_GAS_SPEND) {
      throw new Error(`${label} would exceed the approved 0.001 ETH gas cap; stopping before submission.`);
    }
    if (wallet.address.toLowerCase() === relayer.address.toLowerCase()) {
      const balance = await provider.getBalance(relayer.address);
      const value = BigInt(request.value ?? 0n);
      if (balance < reserve + value + maxCost) {
        throw new Error(`${label} would reduce the relayer below its required reserve; stopping before submission.`);
      }
    }
    gasBudgetReserved += maxCost;
    const tx = await wallet.sendTransaction({ ...request, gasLimit, gasPrice });
    txHashes.push(tx.hash);
    const receipt = await tx.wait(confirmations);
    if (!receipt) throw new Error(`${label} did not produce a transaction receipt.`);
    gasActuallySpent += receipt.gasUsed * (receipt.gasPrice ?? gasPrice);
    if (receipt.status !== 1) throw new Error(`${label} did not confirm successfully.`);
    console.log(`${label}: confirmed (${tx.hash})`);
    return receipt;
  }

  async function submitMethod(wallet, contract, method, args, overrides = {}, options = {}) {
    const connected = contract.connect(wallet);
    const request = await connected[method].populateTransaction(...args, overrides);
    return submit(wallet, request, options.label ?? method, options);
  }

  async function recoverAndRefund() {
    for (const [orderId, maker] of [
      [sellerOrderId, relayer],
      [buyerOrderId, buyer],
    ]) {
      const order = await escrow.orders(orderId);
      if (order[9]) {
        await submitMethod(maker, escrow, "cancel", [orderId], {}, {
          label: "Cancel remaining smoke-test escrow",
          cleanup: true,
        });
      }
    }

    const buyerWeth = await weth.balanceOf(buyer.address);
    if (buyerWeth > 0n) {
      await submitMethod(buyer, weth, "transfer", [relayer.address, buyerWeth], {}, {
        label: "Return temporary WETH",
        cleanup: true,
        confirmations: 1,
      });
    }

    const buyerBalance = await provider.getBalance(buyer.address);
    const buyerSweepGas = 21_000n;
    const buyerSweepFee = buyerSweepGas * gasPrice;
    if (buyerBalance > buyerSweepFee) {
      await submit(buyer, {
        to: relayer.address,
        value: buyerBalance - buyerSweepFee,
      }, "Return temporary ETH", { cleanup: true, confirmations: 1 });
    }

    const relayerWeth = await weth.balanceOf(relayer.address);
    if (relayerWeth > initialRelayerWeth) {
      await submitMethod(relayer, weth, "withdraw", [relayerWeth - initialRelayerWeth], {}, {
        label: "Unwrap returned WETH",
        cleanup: true,
        confirmations: 1,
      });
    }
  }

  try {
    if (buyerTopUp > 0n) {
      await submit(relayer, {
        to: buyer.address,
        value: buyerTopUp,
      }, "Fund temporary buyer", { confirmations: 1 });
    }

    await submitMethod(relayer, weth, "deposit", [], { value: BASE_AMOUNT }, {
      label: "Wrap temporary seller collateral",
      confirmations: 1,
    });
    await submitMethod(relayer, weth, "approve", [deployment.address, BASE_AMOUNT], {}, {
      label: "Approve temporary seller collateral",
      confirmations: 1,
    });

    await submitMethod(relayer, escrow, "openOrder", [
      sellerOrderId, 1, WETH_ADDRESS, ZeroAddress, BASE_AMOUNT, 0n, SELLER_LIMIT, expiresAt,
    ], {}, { label: "Open temporary sell order" });

    await submitMethod(buyer, escrow, "openOrder", [
      buyerOrderId, 0, WETH_ADDRESS, ZeroAddress, BUYER_BASE_AMOUNT, BUYER_QUOTE_AMOUNT, BUYER_LIMIT, expiresAt,
    ], { value: BUYER_QUOTE_AMOUNT }, { label: "Open temporary buy order" });

    const buyerWethBeforeFill = await weth.balanceOf(buyer.address);
    const grossQuote = BASE_AMOUNT;
    const expectedFee = grossQuote * BigInt(feeBps) / 10_000n;
    const settleRequest = await escrow.connect(relayer).settle.populateTransaction(
      settlementId, buyerOrderId, sellerOrderId, BASE_AMOUNT, grossQuote,
    );
    const settlementReceipt = await submit(relayer, settleRequest, "Settle partial order fill");
    const settledEvent = settlementReceipt.logs
      .map((log) => {
        try { return escrow.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "OrderSettled");
    if (
      !settledEvent ||
      settledEvent.args.feeAmount !== expectedFee ||
      !(await escrow.settledFills(settlementId)) ||
      (await weth.balanceOf(buyer.address)) - buyerWethBeforeFill !== BASE_AMOUNT
    ) {
      throw new Error("Mainnet settlement did not produce the expected confirmed fill and token delivery.");
    }

    const partialBuyerOrder = await escrow.orders(buyerOrderId);
    if (!partialBuyerOrder[9] || partialBuyerOrder[4] !== BASE_AMOUNT) {
      throw new Error("The buyer order did not remain active with the expected partial remainder.");
    }
    const refundBeforeCancel = partialBuyerOrder[5];
    const cancelReceipt = await submitMethod(buyer, escrow, "cancel", [buyerOrderId], {}, {
      label: "Cancel remaining buy-order escrow",
    });
    const cancelledEvent = cancelReceipt.logs
      .map((log) => {
        try { return escrow.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "OrderCancelled" && event.args.orderId === buyerOrderId);
    const cancelledOrder = await escrow.orders(buyerOrderId);
    if (
      !cancelledEvent ||
      cancelledEvent.args.refundAmount !== refundBeforeCancel ||
      cancelledOrder[9] ||
      cancelledOrder[5] !== 0n
    ) {
      throw new Error("Mainnet cancellation did not confirm the exact remaining escrow refund.");
    }

    testPassed = true;
  } finally {
    try {
      await recoverAndRefund();
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
    } catch (cleanupError) {
      console.error("Smoke-test recovery is incomplete; preserve the recovery file and do not rerun:", cleanupError?.shortMessage ?? cleanupError?.message ?? cleanupError);
      throw cleanupError;
    }
  }

  if (!testPassed) throw new Error("Mainnet orderbook smoke test did not pass.");
  console.log(`Ethereum mainnet orderbook lifecycle passed: lock, partial atomic fill, exact fee, cancel/refund, and recovery.`);
  console.log(`Contract: ${deployment.address}`);
  console.log(`Relayer: ${relayer.address}`);
  console.log(`Gas actually spent across test wallets: ${formatEther(gasActuallySpent)} ETH (approved maximum ${formatEther(MAX_GAS_SPEND)} ETH).`);
  console.log(`Confirmed transaction hashes: ${txHashes.join(", ")}`);
}

main().catch((error) => {
  console.error("Ethereum mainnet orderbook smoke test failed:", error?.shortMessage ?? error?.message ?? error);
  process.exitCode = 1;
});
