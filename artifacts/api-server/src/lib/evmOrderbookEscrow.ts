import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  stringToHex,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getTokenInfo, isNativeAsset } from "./tokenRegistry.js";

const ETHEREUM_MAINNET = 1;
const ETHEREUM_SEPOLIA = 11155111;
const ORDERBOOK_CHAIN_IDS = new Set([ETHEREUM_MAINNET, ETHEREUM_SEPOLIA]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PRICE_SCALE = 10n ** 18n;
const MIN_CONFIRMATIONS = 3n;
const SEPOLIA_SUPPORTED_PAIRS = [
  "ETH/DAI", "DAI/ETH",
];

export const ORDERBOOK_ESCROW_ABI = parseAbi([
  "function feeBps() view returns (uint16)",
  "function orders(bytes32) view returns (address maker,address baseToken,address quoteToken,uint256 originalBaseAmount,uint256 remainingBaseAmount,uint256 remainingEscrowAmount,uint256 limitPriceX18,uint64 expiresAt,uint8 side,bool active)",
  "function settledFills(bytes32) view returns (bool)",
  "function openOrder(bytes32 orderId,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 quoteAmount,uint256 limitPriceX18,uint64 expiresAt) payable",
  "function settle(bytes32 settlementId,bytes32 buyOrderId,bytes32 sellOrderId,uint256 baseAmount,uint256 grossQuoteAmount)",
  "event OrderOpened(bytes32 indexed orderId,address indexed maker,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 escrowAmount,uint256 limitPriceX18,uint64 expiresAt)",
  "event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)",
  "event OrderCancelled(bytes32 indexed orderId,address indexed maker,uint256 refundAmount)",
]);
const ORDER_SETTLED_EVENT = ORDERBOOK_ESCROW_ABI.find(
  (entry) => entry.type === "event" && entry.name === "OrderSettled",
) as any;
const ORDER_OPENED_TOPIC = keccak256(stringToHex(
  "OrderOpened(bytes32,address,uint8,address,address,uint256,uint256,uint256,uint64)",
));
const ORDER_CANCELLED_TOPIC = keccak256(stringToHex("OrderCancelled(bytes32,address,uint256)"));
const cancellationLookupCache = new Map<string, {
  checkedAt: number;
  result: { txHash: Hex; refundAmount: bigint } | null;
}>();
const CANCELLATION_LOOKUP_TTL_MS = 3_000;

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

function getEscrowAddress(chainId = ETHEREUM_MAINNET): Address | null {
  const envName = chainId === ETHEREUM_SEPOLIA
    ? "EVM_ORDERBOOK_ESCROW_SEPOLIA"
    : "EVM_ORDERBOOK_ESCROW_ETH";
  const address = process.env[envName]?.trim();
  return address && isAddress(address) ? address : null;
}

function getDeploymentBlock(chainId = ETHEREUM_MAINNET): bigint | null {
  const envName = chainId === ETHEREUM_SEPOLIA
    ? "EVM_ORDERBOOK_ESCROW_SEPOLIA_DEPLOY_BLOCK"
    : "EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK";
  const value = process.env[envName]?.trim();
  return value && /^\d{1,12}$/.test(value) ? BigInt(value) : null;
}

function chainForId(chainId: number) {
  if (chainId === ETHEREUM_MAINNET) return mainnet;
  if (chainId === ETHEREUM_SEPOLIA) return sepolia;
  return null;
}

function getRpcUrl(chainId = ETHEREUM_MAINNET): string {
  if (chainId === ETHEREUM_SEPOLIA) {
    return process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  }
  return getEthRpcUrl();
}

function publicClient(chainId = ETHEREUM_MAINNET) {
  const chain = chainForId(chainId);
  if (!chain) throw new Error(`Unsupported EVM orderbook chain: ${chainId}`);
  return createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId)),
  });
}

function getEthRpcUrl() {
  if (process.env.ETH_RPC_URL) return process.env.ETH_RPC_URL;
  if (process.env.ALCHEMY_API_KEY) {
    return `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  }
  return "https://ethereum-rpc.publicnode.com";
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

function assetDetails(chainId: number, symbol: string): { address: Address; decimals: number } {
  if (isNativeAsset(chainId, symbol)) return { address: ZERO_ADDRESS, decimals: 18 };
  const info = getTokenInfo(chainId, symbol);
  if (!info) throw new Error(`${symbol} is not registered for EVM order settlement on chain ${chainId}`);
  return { address: info.address as Address, decimals: info.decimals };
}

export function supportsEthereumOrderbookPair(base: string, quote: string): boolean {
  return supportsEvmOrderbookPair(ETHEREUM_MAINNET, base, quote);
}

export function supportsEvmOrderbookPair(chainId: number, base: string, quote: string): boolean {
  if (!ORDERBOOK_CHAIN_IDS.has(chainId)) return false;
  try {
    const baseAsset = assetDetails(chainId, base);
    const quoteAsset = assetDetails(chainId, quote);
    return baseAsset.decimals === 18 && quoteAsset.decimals === 18 &&
      (chainId !== ETHEREUM_SEPOLIA ||
        SEPOLIA_SUPPORTED_PAIRS.includes(`${base.toUpperCase()}/${quote.toUpperCase()}`)) &&
      baseAsset.address.toLowerCase() !== quoteAsset.address.toLowerCase();
  } catch {
    return false;
  }
}

function orderTerms(
  chainId: number,
  params: Pick<OnchainOrderLockParams, "side" | "base" | "quote" | "quantity" | "price">,
) {
  const baseAsset = assetDetails(chainId, params.base);
  const quoteAsset = assetDetails(chainId, params.quote);
  if (baseAsset.decimals !== 18 || quoteAsset.decimals !== 18) {
    throw new Error("EVM wallet order settlement currently supports 18-decimal tokens only");
  }
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

function isEscrowEnabled(chainId: number): boolean {
  return chainId === ETHEREUM_MAINNET
    ? process.env.EVM_ORDERBOOK_ESCROW_ENABLED === "true"
    : process.env.EVM_ORDERBOOK_ESCROW_SEPOLIA_ENABLED === "true";
}

function isMatchingEnabled(chainId: number): boolean {
  return chainId === ETHEREUM_MAINNET
    ? process.env.EVM_ORDERBOOK_MATCHING_ENABLED === "true"
    : process.env.EVM_ORDERBOOK_MATCHING_SEPOLIA_ENABLED === "true";
}

function unsupportedConfig(chainId: number) {
  return {
    chainId,
    available: false as const,
    ...(chainId === ETHEREUM_SEPOLIA ? { supportedPairs: SEPOLIA_SUPPORTED_PAIRS } : {}),
  };
}

async function getDeployedOrderbookEscrowConfig(
  chainId = ETHEREUM_MAINNET,
  requireEnabled = true,
) {
  if (!ORDERBOOK_CHAIN_IDS.has(chainId) || (requireEnabled && !isEscrowEnabled(chainId))) {
    return unsupportedConfig(chainId);
  }
  const address = getEscrowAddress(chainId);
  if (!address || getDeploymentBlock(chainId) == null) return unsupportedConfig(chainId);
  const client = publicClient(chainId);
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") return unsupportedConfig(chainId);
  try {
    const [feeBps, orderState, settled] = await Promise.all([
      client.readContract({
        address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "feeBps",
      }),
      client.readContract({
        address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "orders",
        args: [`0x${"0".repeat(64)}`],
      }),
      client.readContract({
        address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "settledFills",
        args: [`0x${"0".repeat(64)}`],
      }),
    ]);
    if (
      feeBps > 200n ||
      orderState[0] !== ZERO_ADDRESS ||
      settled !== false
    ) {
      return unsupportedConfig(chainId);
    }
    return {
      chainId,
      address,
      feeBps: Number(feeBps),
      available: true as const,
      ...(chainId === ETHEREUM_SEPOLIA ? { supportedPairs: SEPOLIA_SUPPORTED_PAIRS } : {}),
    };
  } catch {
    return unsupportedConfig(chainId);
  }
}

export async function getEvmOrderbookEscrowConfig(chainId = ETHEREUM_MAINNET) {
  if (!ORDERBOOK_CHAIN_IDS.has(chainId) || !isMatchingEnabled(chainId)) {
    return unsupportedConfig(chainId);
  }
  if (chainId === ETHEREUM_SEPOLIA && process.env.EVM_ORDERBOOK_ESCROW_SEPOLIA_ENABLED !== "true") {
    return unsupportedConfig(chainId);
  }
  const deployed = await getDeployedOrderbookEscrowConfig(chainId);
  if (!deployed.available) return deployed;
  try {
    const account = getRelayerAccount(chainId);
    const client = publicClient(chainId);
    const [balance, gasPrice] = await Promise.all([
      client.getBalance({ address: account.address }),
      client.getGasPrice(),
    ]);
    const relayerGasReserve = chainId === ETHEREUM_SEPOLIA ? 700_000n : 2_000_000n;
    if (balance < gasPrice * relayerGasReserve) return unsupportedConfig(chainId);
    return deployed;
  } catch {
    return unsupportedConfig(chainId);
  }
}

export async function verifyEvmOrderLock(params: OnchainOrderLockParams): Promise<{
  orderKey: Hex;
  fundingRef: string;
  escrowAddress: Address;
}> {
  if (!ORDERBOOK_CHAIN_IDS.has(params.chainId)) {
    throw new Error("Wallet-funded order settlement is supported only on Ethereum mainnet or Sepolia.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress)) throw new Error("Invalid EVM wallet address");
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.txHash)) throw new Error("A confirmed escrow lock transaction is required");
  if (!Number.isSafeInteger(params.expiresAt) || params.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("The signed order has expired");
  }

  const config = await getEvmOrderbookEscrowConfig(params.chainId);
  if (!config.available) throw new Error(`EVM order escrow is not enabled on chain ${params.chainId}`);
  const orderKey = keccak256(toBytes(params.nonce));
  const terms = orderTerms(params.chainId, params);
  const client = publicClient(params.chainId);
  const receipt = await client.getTransactionReceipt({ hash: params.txHash as Hex });
  if (receipt.status !== "success") throw new Error("The escrow lock transaction reverted");
  const latestBlock = await client.getBlockNumber();
  if (latestBlock - receipt.blockNumber + 1n < MIN_CONFIRMATIONS) {
    throw new Error("Escrow lock is awaiting EVM confirmations");
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
      // Ignore unrelated logs in the transaction.
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
    fundingRef: `evm-order:${params.chainId}:${config.address}:${orderKey}:${params.txHash}`,
    escrowAddress: config.address,
  };
}

export async function verifyEvmOrderbookCancelTx(params: {
  chainId: number;
  escrowAddress: string;
  orderKey: `0x${string}`;
  walletAddress: string;
  txHash: string;
}): Promise<void> {
  if (!isAddress(params.escrowAddress) || !/^0x[0-9a-fA-F]{64}$/.test(params.orderKey) ||
      !/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress) ||
      !/^0x[0-9a-fA-F]{64}$/.test(params.txHash)) {
    throw new Error("Invalid Ethereum order cancellation proof");
  }
  if (!ORDERBOOK_CHAIN_IDS.has(params.chainId)) {
    throw new Error("Unsupported EVM order cancellation chain");
  }
  const configuredEscrow = getEscrowAddress(params.chainId);
  if (!configuredEscrow || configuredEscrow.toLowerCase() !== params.escrowAddress.toLowerCase()) {
    throw new Error("Cancellation contract does not match the configured EVM order escrow");
  }
  const client = publicClient(params.chainId);
  const receipt = await client.getTransactionReceipt({ hash: params.txHash as Hex });
  if (receipt.status !== "success") throw new Error("Order cancellation transaction reverted");
  const latestBlock = await client.getBlockNumber();
  if (latestBlock - receipt.blockNumber + 1n < MIN_CONFIRMATIONS) {
    throw new Error("Order cancellation is awaiting EVM confirmations");
  }
  const cancelled = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== params.escrowAddress.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({
        abi: ORDERBOOK_ESCROW_ABI,
        eventName: "OrderCancelled",
        data: log.data,
        topics: log.topics,
      });
      return decoded.args.orderId.toLowerCase() === params.orderKey.toLowerCase() &&
        decoded.args.maker.toLowerCase() === params.walletAddress.toLowerCase();
    } catch {
      return false;
    }
  });
  if (!cancelled) throw new Error("Transaction does not prove cancellation of this wallet's escrow order");
}

/**
 * Find a confirmed cancellation already recorded on Ethereum for an order.
 * This lets the API recover when the wallet completed the chain transaction
 * but the page closed before it could update the server-side order row.
 */
export async function findConfirmedEvmOrderbookCancellation(params: {
  chainId: number;
  escrowAddress: string;
  orderKey: Hex;
  walletAddress: string;
  lockTxHash: string;
}): Promise<{ txHash: Hex; refundAmount: bigint } | null> {
  if (
    !isAddress(params.escrowAddress) ||
    !/^0x[0-9a-fA-F]{64}$/.test(params.orderKey) ||
    !/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress) ||
    !/^0x[0-9a-fA-F]{64}$/.test(params.lockTxHash)
  ) {
    throw new Error("Invalid Ethereum order cancellation lookup");
  }
  if (!ORDERBOOK_CHAIN_IDS.has(params.chainId)) {
    throw new Error("Unsupported EVM order cancellation chain");
  }

  const cacheKey = `${params.chainId}:${params.escrowAddress.toLowerCase()}:${params.orderKey.toLowerCase()}:${params.walletAddress.toLowerCase()}:${params.lockTxHash.toLowerCase()}`;
  const cached = cancellationLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < CANCELLATION_LOOKUP_TTL_MS) return cached.result;

  const client = publicClient(params.chainId);
  const lockReceipt = await client.getTransactionReceipt({ hash: params.lockTxHash as Hex });
  if (lockReceipt.status !== "success") throw new Error("Original Ethereum order lock is not confirmed");
  const currentOrder = await client.readContract({
    address: params.escrowAddress as Address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "orders",
    args: [params.orderKey],
  });
  if (currentOrder[0].toLowerCase() !== params.walletAddress.toLowerCase()) {
    throw new Error("Ethereum escrow order maker does not match the wallet");
  }
  if (currentOrder[9]) {
    cancellationLookupCache.set(cacheKey, { checkedAt: Date.now(), result: null });
    return null;
  }

  const latestBlock = await client.getBlockNumber();
  const makerTopic = encodeAbiParameters(parseAbiParameters("address"), [params.walletAddress as Address]);
  const logs: Array<{ blockNumber: string; transactionHash: Hex }> = [];
  // Some RPC providers cap eth_getLogs to a 10-block range on free plans.
  // Keep scans portable by querying small consecutive chunks.
  for (let fromBlock = lockReceipt.blockNumber; fromBlock <= latestBlock;) {
    const toBlock = fromBlock + 9n < latestBlock ? fromBlock + 9n : latestBlock;
    const chunk = await client.request({
      method: "eth_getLogs",
      params: [{
        address: params.escrowAddress,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [ORDER_CANCELLED_TOPIC, params.orderKey, makerTopic],
      }],
    } as any) as Array<{ blockNumber: string; transactionHash: Hex }>;
    logs.push(...chunk);
    fromBlock = toBlock + 1n;
  }

  for (const log of logs) {
    const blockNumber = BigInt(log.blockNumber);
    if (latestBlock - blockNumber + 1n < MIN_CONFIRMATIONS) continue;
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    if (receipt.status !== "success") continue;
    for (const entry of receipt.logs) {
      if (entry.address.toLowerCase() !== params.escrowAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: ORDERBOOK_ESCROW_ABI,
          eventName: "OrderCancelled",
          data: entry.data,
          topics: entry.topics,
        });
        if (
          decoded.args.orderId.toLowerCase() === params.orderKey.toLowerCase() &&
          decoded.args.maker.toLowerCase() === params.walletAddress.toLowerCase()
        ) {
          const result = { txHash: log.transactionHash, refundAmount: decoded.args.refundAmount };
          cancellationLookupCache.set(cacheKey, { checkedAt: Date.now(), result });
          return result;
        }
      } catch {
        // Ignore unrelated events in the transaction receipt.
      }
    }
  }

  cancellationLookupCache.set(cacheKey, { checkedAt: Date.now(), result: null });
  return null;
}

/**
 * Recover active, confirmed orderbook escrows that were opened on Ethereum
 * but never saved in the API database.
 */
export async function findActiveEvmOrderbookOrders(
  walletAddress: string,
  knownLockTxHashes: string[] = [],
  chainId = ETHEREUM_MAINNET,
): Promise<Array<{
  orderKey: Hex;
  lockTxHash: Hex;
  escrowAddress: Address;
  side: "buy" | "sell";
  baseToken: Address;
  quoteToken: Address;
  originalBaseAmountRaw: string;
  remainingBaseAmountRaw: string;
  limitPriceX18: string;
  expiresAt: number;
}>> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error("A valid Ethereum wallet address is required");
  }
  if (!ORDERBOOK_CHAIN_IDS.has(chainId)) return [];
  const config = await getDeployedOrderbookEscrowConfig(chainId, false);
  const deploymentBlock = getDeploymentBlock(chainId);
  if (!config.available || deploymentBlock == null) return [];

  const client = publicClient(chainId);
  const latestBlock = await client.getBlockNumber();
  const recentScanFloor = latestBlock > 999n ? latestBlock - 999n : 0n;
  let scanFromBlock = deploymentBlock > recentScanFloor ? deploymentBlock : recentScanFloor;
  const logs: Array<{ blockNumber: string; transactionHash: Hex }> = [];
  for (const txHash of knownLockTxHashes) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) continue;
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
      if (receipt.status !== "success") continue;
      if (receipt.blockNumber > scanFromBlock) scanFromBlock = receipt.blockNumber;
      if (latestBlock - receipt.blockNumber + 1n >= MIN_CONFIRMATIONS) {
        logs.push({
          blockNumber: `0x${receipt.blockNumber.toString(16)}`,
          transactionHash: txHash as Hex,
        });
      }
    } catch {
      // A stale stored reference must not prevent recovery of other orders.
    }
  }
  const makerTopic = encodeAbiParameters(parseAbiParameters("address"), [walletAddress as Address]);

  // Respect RPC plans that cap eth_getLogs at ten blocks per request.
  for (let fromBlock = scanFromBlock; fromBlock <= latestBlock;) {
    const toBlock = fromBlock + 9n < latestBlock ? fromBlock + 9n : latestBlock;
    const chunk = await client.request({
      method: "eth_getLogs",
      params: [{
        address: config.address,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [ORDER_OPENED_TOPIC, null, makerTopic],
      }],
    } as any) as Array<{ blockNumber: string; transactionHash: Hex }>;
    logs.push(...chunk);
    fromBlock = toBlock + 1n;
    if (fromBlock <= latestBlock) await new Promise((resolve) => setTimeout(resolve, 75));
  }

  const recovered = new Map<string, {
    orderKey: Hex;
    lockTxHash: Hex;
    escrowAddress: Address;
    side: "buy" | "sell";
    baseToken: Address;
    quoteToken: Address;
    originalBaseAmountRaw: string;
    remainingBaseAmountRaw: string;
    limitPriceX18: string;
    expiresAt: number;
  }>();
  const uniqueLogs = new Map(
    logs.map((log) => [`${log.transactionHash.toLowerCase()}:${log.blockNumber}`, log] as const),
  );
  for (const log of uniqueLogs.values()) {
    const blockNumber = BigInt(log.blockNumber);
    if (latestBlock - blockNumber + 1n < MIN_CONFIRMATIONS) continue;
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    if (receipt.status !== "success") continue;

    for (const entry of receipt.logs) {
      if (entry.address.toLowerCase() !== config.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: ORDERBOOK_ESCROW_ABI,
          eventName: "OrderOpened",
          data: entry.data,
          topics: entry.topics,
        });
        const args = decoded.args;
        if (args.maker.toLowerCase() !== walletAddress.toLowerCase()) continue;
        const order = await client.readContract({
          address: config.address,
          abi: ORDERBOOK_ESCROW_ABI,
          functionName: "orders",
          args: [args.orderId],
        });
        if (
          !order[9] ||
          order[0].toLowerCase() !== walletAddress.toLowerCase() ||
          order[1].toLowerCase() !== args.baseToken.toLowerCase() ||
          order[2].toLowerCase() !== args.quoteToken.toLowerCase() ||
          order[3] !== args.baseAmount ||
          order[6] !== args.limitPriceX18 ||
          order[7] !== args.expiresAt ||
          order[8] !== args.side
        ) continue;

        recovered.set(args.orderId.toLowerCase(), {
          orderKey: args.orderId,
          lockTxHash: log.transactionHash,
          escrowAddress: config.address,
          side: args.side === 0 ? "buy" : "sell",
          baseToken: args.baseToken,
          quoteToken: args.quoteToken,
          originalBaseAmountRaw: args.baseAmount.toString(),
          remainingBaseAmountRaw: order[4].toString(),
          limitPriceX18: args.limitPriceX18.toString(),
          expiresAt: Number(args.expiresAt),
        });
      } catch {
        // Ignore unrelated or malformed escrow logs.
      }
    }
  }
  return [...recovered.values()];
}

function getRelayerAccount(chainId = ETHEREUM_MAINNET) {
  const raw = chainId === ETHEREUM_SEPOLIA
    ? process.env.EVM_ORDERBOOK_RELAYER_SEPOLIA_KEY ?? ""
    : process.env.EVM_ORDERBOOK_RELAYER_KEY ?? process.env.EVM_WALLET_SECRET ?? "";
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`EVM order settlement relayer is not configured for chain ${chainId}`);
  }
  return privateKeyToAccount(key);
}

export async function settleEvmOrderFill(params: {
  chainId?: number;
  settlementId: Hex;
  buyOrderKey: Hex;
  sellOrderKey: Hex;
  base: string;
  quote: string;
  baseAmount: string | number;
  grossQuoteAmount: string | number;
}, onSubmitted?: (txHash: Hex) => Promise<void>): Promise<{ txHash: Hex; alreadySettled: boolean; feeAmount: string }> {
  const chainId = params.chainId ?? ETHEREUM_MAINNET;
  const config = await getEvmOrderbookEscrowConfig(chainId);
  if (!config.available) throw new Error(`EVM order escrow is not available on chain ${chainId}`);
  const client = publicClient(chainId);
  const wasSettled = await client.readContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "settledFills",
    args: [params.settlementId],
  });

  if (wasSettled) {
    const existing = await getConfirmedEvmOrderSettlement(params.settlementId, chainId);
    if (!existing) throw new Error("Settlement is awaiting EVM confirmations");
    await onSubmitted?.(existing.txHash);
    return { txHash: existing.txHash, alreadySettled: true, feeAmount: existing.feeAmount };
  }

  const baseAsset = assetDetails(chainId, params.base);
  const quoteAsset = assetDetails(chainId, params.quote);
  if (baseAsset.decimals > 18 || quoteAsset.decimals > 18) {
    throw new Error("EVM wallet order settlement supports tokens with up to 18 decimals");
  }
  const baseAmount = toUnits(params.baseAmount, baseAsset.decimals);
  const grossQuoteAmount = toUnits(params.grossQuoteAmount, quoteAsset.decimals, true);
  const account = getRelayerAccount(chainId);
  const chain = chainForId(chainId);
  if (!chain) throw new Error(`Unsupported EVM orderbook chain: ${chainId}`);
  const wallet = createWalletClient({ account, chain, transport: http(getRpcUrl(chainId)) });
  const txHash = await wallet.writeContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "settle",
    args: [params.settlementId, params.buyOrderKey, params.sellOrderKey, baseAmount, grossQuoteAmount],
  });
  await onSubmitted?.(txHash);
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    confirmations: Number(MIN_CONFIRMATIONS),
    timeout: 180_000,
  });
  if (receipt.status !== "success") throw new Error("Atomic order settlement transaction reverted");
  const finalized = await getConfirmedEvmOrderSettlement(params.settlementId, chainId);
  if (!finalized) throw new Error("EVM settlement receipt is confirmed; indexed settlement event is pending");
  return {
    txHash: finalized.txHash,
    alreadySettled: finalized.txHash.toLowerCase() !== txHash.toLowerCase(),
    feeAmount: finalized.feeAmount,
  };
}

export async function getConfirmedEvmOrderSettlement(
  settlementId: Hex,
  chainId = ETHEREUM_MAINNET,
): Promise<{
  txHash: Hex;
  buyOrderKey: Hex;
  sellOrderKey: Hex;
  baseAmount: string;
  grossQuoteAmount: string;
  feeAmount: string;
} | null> {
  const config = await getDeployedOrderbookEscrowConfig(chainId, false);
  if (!config.available) return null;
  const client = publicClient(chainId);
  const settled = await client.readContract({
    address: config.address,
    abi: ORDERBOOK_ESCROW_ABI,
    functionName: "settledFills",
    args: [settlementId],
  });
  if (!settled) return null;
  const logs = await client.getLogs({
    address: config.address,
    event: ORDER_SETTLED_EVENT,
    args: { settlementId },
    fromBlock: getDeploymentBlock(chainId)!,
  });
  const log = logs[0];
  if (!log?.transactionHash) return null;
  const [receipt, latestBlock] = await Promise.all([
    client.getTransactionReceipt({ hash: log.transactionHash }),
    client.getBlockNumber(),
  ]);
  if (receipt.status !== "success" || latestBlock - receipt.blockNumber + 1n < MIN_CONFIRMATIONS) {
    return null;
  }
  const decoded = decodeEventLog({
    abi: ORDERBOOK_ESCROW_ABI,
    eventName: "OrderSettled",
    data: log.data,
    topics: log.topics,
  });
  return {
    txHash: log.transactionHash,
    buyOrderKey: decoded.args.buyOrderId,
    sellOrderKey: decoded.args.sellOrderId,
    baseAmount: formatUnits(decoded.args.baseAmount, 18),
    grossQuoteAmount: formatUnits(decoded.args.grossQuoteAmount, 18),
    feeAmount: formatUnits(decoded.args.feeAmount, 18),
  };
}

export async function getEvmSettlementTxStatus(
  txHash: Hex,
  chainId = ETHEREUM_MAINNET,
): Promise<"pending" | "confirmed" | "reverted"> {
  if (!ORDERBOOK_CHAIN_IDS.has(chainId)) return "reverted";
  const client = publicClient(chainId);
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return "pending";
  }
  const latestBlock = await client.getBlockNumber();
  if (latestBlock - receipt.blockNumber + 1n < MIN_CONFIRMATIONS) return "pending";
  return receipt.status === "success" ? "confirmed" : "reverted";
}

export function orderKeyFromNonce(nonce: string): Hex {
  return keccak256(toBytes(nonce));
}

