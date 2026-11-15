import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getTokenInfo, isNativeAsset } from "./tokenRegistry.js";

const CHAIN_ID = 1;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PRICE_SCALE = 10n ** 18n;
const MIN_CONFIRMATIONS = 3n;

export const ORDERBOOK_ESCROW_ABI = parseAbi([
  "function feeBps() view returns (uint16)",
  "function orders(bytes32) view returns (address maker,address baseToken,address quoteToken,uint256 originalBaseAmount,uint256 remainingBaseAmount,uint256 remainingEscrowAmount,uint256 limitPriceX18,uint64 expiresAt,uint8 side,bool active)",
  "function settledFills(bytes32) view returns (bool)",
  "function openOrder(bytes32 orderId,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 quoteAmount,uint256 limitPriceX18,uint64 expiresAt) payable",
  "function settle(bytes32 settlementId,bytes32 buyOrderId,bytes32 sellOrderId,uint256 baseAmount,uint256 grossQuoteAmount)",
  "event OrderOpened(bytes32 indexed orderId,address indexed maker,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 escrowAmount,uint256 limitPriceX18,uint64 expiresAt)",
  "event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)",
]);

export interface OnchainOrderLockParams {
  chainId: number;
  walletAddress: string;
  nonce: string;
  txHash: string;
  side: "buy" | "sell";
  base: string;
  quote: string;
  quantity: string | number;
  price: string | number;
  expiresAt: number;
}

function getEscrowAddress(): Address | null {
  const address = process.env.EVM_ORDERBOOK_ESCROW_ETH?.trim();
  return address && isAddress(address) ? address : null;
}

function publicClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com"),
  });
}

function expandDecimal(value: string | number): string {
  const input = String(value).trim();
  if (!/[eE]/.test(input)) return input;
  const match = input.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) throw new Error("Invalid decimal amount");
  const sign = match[1] ?? "";
  const digits = `${match[2] ?? "0"}${match[3] ?? ""}`;
  const point = (match[2] ?? "0").length + Number(match[4]);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function toUnits(value: string | number, decimals: number, roundUp = false): bigint {
  const text = expandDecimal(value);
  const negative = text.startsWith("-");
  if (negative) throw new Error("Amounts must be positive");
  const [whole = "0", fraction = ""] = text.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw new Error("Invalid decimal amount");
  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  let result = parseUnits(kept ? `${whole}.${kept}` : whole, decimals);
  if (roundUp && /[1-9]/.test(fraction.slice(decimals))) result += 1n;
  return result;
}

function assetDetails(symbol: string): { address: Address; decimals: number } {
  if (isNativeAsset(CHAIN_ID, symbol)) return { address: ZERO_ADDRESS, decimals: 18 };
  const info = getTokenInfo(CHAIN_ID, symbol);
  if (!info) throw new Error(`${symbol} is not registered for Ethereum order settlement`);
  return { address: info.address as Address, decimals: info.decimals };
}

function orderTerms(params: Pick<OnchainOrderLockParams, "side" | "base" | "quote" | "quantity" | "price">) {
  const baseAsset = assetDetails(params.base);
  const quoteAsset = assetDetails(params.quote);
  const baseAmount = toUnits(params.quantity, baseAsset.decimals);
  const priceWad = toUnits(params.price, 18, params.side === "sell");
  let limitPriceX18 = priceWad * (10n ** BigInt(quoteAsset.decimals));
  const baseScale = 10n ** BigInt(baseAsset.decimals);
  if (limitPriceX18 % baseScale !== 0n && params.side === "sell") {
    limitPriceX18 = limitPriceX18 / baseScale + 1n;
  } else {
    limitPriceX18 /= baseScale;
  }
  if (baseAmount <= 0n || limitPriceX18 <= 0n) throw new Error("Order amount and limit price must be positive");
  const quoteAmount = (baseAmount * limitPriceX18 + PRICE_SCALE - 1n) / PRICE_SCALE;
  return {
    baseAsset,
    quoteAsset,
    baseAmount,
    quoteAmount: params.side === "buy" ? quoteAmount : 0n,
    escrowAmount: params.side === "buy" ? quoteAmount : baseAmount,
    limitPriceX18,
  };
}

export async function getEvmOrderbookEscrowConfig() {
  const address = getEscrowAddress();
  if (!address) return { chainId: CHAIN_ID, available: false as const };
  const client = publicClient();
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") return { chainId: CHAIN_ID, available: false as const };
  try {
    const feeBps = await client.readContract({
      address,
      abi: ORDERBOOK_ESCROW_ABI,
      functionName: "feeBps",
    });
    if (feeBps > 200n) return { chainId: CHAIN_ID, available: false as const };
    return { chainId: CHAIN_ID, address, feeBps: Number(feeBps), available: true as const };
  } catch {
    return { chainId: CHAIN_ID, available: false as const };
  }
}

export async function verifyEvmOrderLock(params: OnchainOrderLockParams): Promise<{
  orderKey: Hex;
  fundingRef: string;
  escrowAddress: Address;
}> {
  if (params.chainId !== CHAIN_ID) throw new Error("Wallet-funded order settlement is currently supported on Ethereum mainnet only.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress)) throw new Error("Invalid EVM wallet address");
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.txHash)) throw new Error("A confirmed escrow lock transaction is required");
  if (!Number.isSafeInteger(params.expiresAt) || params.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("The signed order has expired");
  }

  const config = await getEvmOrderbookEscrowConfig();
  if (!config.available) throw new Error("Ethereum order escrow is not deployed and verified in app configuration");
  const orderKey = keccak256(toBytes(params.nonce));
  const terms = orderTerms(params);
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash: params.txHash as Hex });
  if (receipt.status !== "success") throw new Error("The escrow lock transaction reverted");
  const latestBlock = await client.getBlockNumber();
  if (latestBlock - receipt.blockNumber + 1n < MIN_CONFIRMATIONS) {
    throw new Error("Escrow lock is awaiting Ethereum confirmations");
  }

  let openedEvent = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.address.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ORDERBOOK_ESCROW_ABI,
        eventName: "OrderOpened",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args;
      if (
        args.orderId.toLowerCase() === orderKey.toLowerCase() &&
        args.maker.toLowerCase() === params.walletAddress.toLowerCase() &&
        Number(args.side) === (params.side === "buy" ? 0 : 1) &&
        args.baseToken.toLowerCase() === terms.baseAsset.address.toLowerCase() &&
        args.quoteToken.toLowerCase() === terms.quoteAsset.address.toLowerCase() &&
        args.baseAmount === terms.baseAmount &&
        args.escrowAmount === terms.escrowAmount &&
        args.limitPriceX18 === terms.limitPriceX18 &&
        Number(args.expiresAt) === params.expiresAt
      ) {
        openedEvent = true;
        break;
      }
    } catch {
      // Ignore unrelated logs in the same transaction.
    }
  }
  if (!openedEvent) throw new Error("The transaction does not contain the expected order escrow lock");

  const order = await client.readContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "orders",
    args: [orderKey],
  });
  const [maker, , , , remainingBaseAmount, remainingEscrowAmount, , , , active] = order;
  if (
    maker.toLowerCase() !== params.walletAddress.toLowerCase() ||
    !active ||
    remainingBaseAmount !== terms.baseAmount ||
    remainingEscrowAmount !== terms.escrowAmount
  ) {
    throw new Error("The on-chain order is not active or its locked amount does not match");
  }

  return {
    orderKey,
    fundingRef: `evm-order:${CHAIN_ID}:${orderKey}`,
    escrowAddress: config.address,
  };
}

function getRelayerAccount() {
  const raw = process.env.EVM_ORDERBOOK_RELAYER_KEY ??
    process.env.EVM_WALLET_SECRET ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    "";
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("EVM order settlement relayer is not configured");
  }
  return privateKeyToAccount(key);
}

export async function settleEvmOrderFill(params: {
  settlementId: Hex;
  buyOrderKey: Hex;
  sellOrderKey: Hex;
  base: string;
  quote: string;
  baseAmount: string | number;
  grossQuoteAmount: string | number;
}): Promise<{ txHash: Hex; alreadySettled: boolean }> {
  const config = await getEvmOrderbookEscrowConfig();
  if (!config.available) throw new Error("Ethereum order escrow is not available");
  const client = publicClient();
  const wasSettled = await client.readContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "settledFills",
    args: [params.settlementId],
  });

  if (wasSettled) {
    const logs = await client.getLogs({
      address: config.address,
      event: parseAbi(["event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)"])[0] as any,
      args: { settlementId: params.settlementId },
      fromBlock: BigInt(process.env.EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK ?? "0"),
    });
    const txHash = logs[0]?.transactionHash;
    if (!txHash) throw new Error("Settlement is confirmed on-chain; transaction lookup is pending");
    return { txHash, alreadySettled: true };
  }

  const baseAsset = assetDetails(params.base);
  const quoteAsset = assetDetails(params.quote);
  const baseAmount = toUnits(params.baseAmount, baseAsset.decimals);
  const grossQuoteAmount = toUnits(params.grossQuoteAmount, quoteAsset.decimals, true);
  const account = getRelayerAccount();
  const wallet = createWalletClient({ account, chain: mainnet, transport: http(process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com") });
  const txHash = await wallet.writeContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "settle",
    args: [params.settlementId, params.buyOrderKey, params.sellOrderKey, baseAmount, grossQuoteAmount],
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    confirmations: Number(MIN_CONFIRMATIONS),
    timeout: 180_000,
  });
  if (receipt.status !== "success") throw new Error("Atomic order settlement transaction reverted");
  return { txHash, alreadySettled: false };
}

export function orderKeyFromNonce(nonce: string): Hex {
  return keccak256(toBytes(nonce));
}

