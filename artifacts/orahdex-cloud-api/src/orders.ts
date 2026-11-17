import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseAbi,
  recoverMessageAddress,
  stringToHex,
  toBytes,
  type Address,
  type AbiEvent,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

export interface OrderbookEnv {
  DB: D1Database;
  EVM_ORDERBOOK_ESCROW_ENABLED?: string;
  EVM_ORDERBOOK_MATCHING_ENABLED?: string;
  EVM_ORDERBOOK_MAINNET_SETTLEMENTS_APPROVED?: string;
  EVM_ORDERBOOK_ESCROW_ETH?: string;
  EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK?: string;
  EVM_ORDERBOOK_RELAYER_KEY?: string;
  ETH_RPC_URL?: string;
}

type OrderRow = {
  id: string;
  wallet_address: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  side: "buy" | "sell";
  order_type: "limit";
  price: string;
  quantity: string;
  filled_quantity: string;
  remaining_quantity: string;
  status: "open" | "settling" | "filled" | "cancelled";
  nonce: string;
  auth_expiry: number;
  order_expiry: number;
  signature: string;
  order_key: string;
  escrow_address: string;
  lock_tx_hash: string;
  cancel_tx_hash: string | null;
  created_at: number;
  updated_at: number;
};

type SettlementRow = {
  id: string;
  buy_order_id: string;
  sell_order_id: string;
  base_amount: string;
  gross_quote_amount: string;
  status: "preparing" | "submitted" | "finalizing" | "confirmed" | "failed";
  tx_hash: string | null;
  fee_amount: string | null;
  created_at: number;
  updated_at: number;
};

class SafeOrderError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SafeOrderError";
    this.status = status;
  }
}

const CHAIN_ID = 1;
const SYMBOL = "A8/ETH";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const A8_ADDRESS = "0x3e5a19c91266ad8ce2477b91585d1856b84062df" as Address;
const SCALE = 10n ** 18n;
const CONFIRMATIONS = 3n;
const MIN_ORDER_EXPIRY_SECONDS = 60 * 60;
const MAX_ORDER_EXPIRY_SECONDS = 7 * 24 * 60 * 60 + 60;
const RECOVERY_SCAN_BLOCKS = 65_000n;
const RECOVERY_SCAN_CHUNK = 9_000n;
const MAX_RECOVERY_LOGS = 35;

export const ORDERBOOK_ESCROW_ABI = parseAbi([
  "function feeBps() view returns (uint16)",
  "function orders(bytes32) view returns (address maker,address baseToken,address quoteToken,uint256 originalBaseAmount,uint256 remainingBaseAmount,uint256 remainingEscrowAmount,uint256 limitPriceX18,uint64 expiresAt,uint8 side,bool active)",
  "function settledFills(bytes32) view returns (bool)",
  "function settle(bytes32 settlementId,bytes32 buyOrderId,bytes32 sellOrderId,uint256 baseAmount,uint256 grossQuoteAmount)",
  "event OrderOpened(bytes32 indexed orderId,address indexed maker,uint8 side,address baseToken,address quoteToken,uint256 baseAmount,uint256 escrowAmount,uint256 limitPriceX18,uint64 expiresAt)",
  "event OrderSettled(bytes32 indexed settlementId,bytes32 indexed buyOrderId,bytes32 indexed sellOrderId,address buyer,address seller,uint256 baseAmount,uint256 grossQuoteAmount,uint256 feeAmount)",
  "event OrderCancelled(bytes32 indexed orderId,address indexed maker,uint256 refundAmount)",
]);
const ORDER_OPENED_EVENT = ORDERBOOK_ESCROW_ABI.find(
  (entry) => entry.type === "event" && entry.name === "OrderOpened",
) as AbiEvent;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function rpcUrl(env: OrderbookEnv): string {
  return env.ETH_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com";
}

function publicClient(env: OrderbookEnv) {
  return createPublicClient({ chain: mainnet, transport: http(rpcUrl(env)) });
}

function expandDecimal(raw: unknown): string {
  const input = String(raw ?? "").trim();
  if (!/[eE]/.test(input)) return input;
  const match = input.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) throw new SafeOrderError("Invalid decimal amount");
  const sign = match[1] ?? "";
  const digits = `${match[2] ?? "0"}${match[3] ?? ""}`;
  const point = (match[2] ?? "0").length + Number(match[4]);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

export function toUnits(raw: unknown, decimals = 18, roundUp = false): bigint {
  const input = expandDecimal(raw);
  if (!/^(?:0|[1-9]\d*)(?:\.\d*)?$/.test(input)) throw new SafeOrderError("Invalid decimal amount");
  const [whole = "0", fraction = ""] = input.split(".");
  const extra = fraction.slice(decimals);
  if (!roundUp && /[1-9]/.test(extra)) throw new SafeOrderError("Amount has too many decimal places");
  let value =
    BigInt(whole) * (10n ** BigInt(decimals)) +
    BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
  if (roundUp && /[1-9]/.test(extra)) value += 1n;
  return value;
}

function orderKeyFromNonce(nonce: string): Hex {
  return keccak256(toBytes(nonce));
}

export function orderMessage(body: Record<string, unknown>): string {
  const wallet = String(body.walletAddress ?? "");
  const nonce = String(body.nonce ?? "");
  const expiry = String(body.expiry ?? "");
  return [
    "Authorize OrahDEX order",
    `Wallet: ${wallet}`,
    `Symbol: ${String(body.symbol ?? "")}`,
    `Side: ${String(body.side ?? "")}`,
    `Quantity: ${String(body.quantity ?? "")}`,
    `Type: ${String(body.type ?? "")}`,
    `Price: ${String(body.price ?? "")}`,
    `Stop price: ${String(body.stopPrice ?? "")}`,
    `Chain ID: ${String(body.chainId ?? "")}`,
    `Time in force: ${String(body.timeInForce ?? "GTC")}`,
    `Nonce: ${nonce}`,
    `Expiry: ${expiry}`,
  ].join("\n");
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 64 * 1024) throw new Error("Request body is too large");
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON object body is required");
  }
  return parsed as Record<string, unknown>;
}

function getRelayer(env: OrderbookEnv) {
  const raw = env.EVM_ORDERBOOK_RELAYER_KEY?.trim() ?? "";
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new SafeOrderError("Relayer is not configured", 503);
  return privateKeyToAccount(key);
}

export interface OrderbookConfig {
  chainId: number;
  available: boolean;
  supportedPairs: string[];
  address?: string;
  feeBps?: number;
}

export async function getOrderbookConfig(env: OrderbookEnv): Promise<OrderbookConfig> {
  const unavailable: OrderbookConfig = { chainId: CHAIN_ID, available: false, supportedPairs: [] };
  if (
    env.EVM_ORDERBOOK_ESCROW_ENABLED !== "true" ||
    env.EVM_ORDERBOOK_MATCHING_ENABLED !== "true" ||
    env.EVM_ORDERBOOK_MAINNET_SETTLEMENTS_APPROVED !== "true"
  ) return unavailable;

  const escrow = env.EVM_ORDERBOOK_ESCROW_ETH?.trim() ?? "";
  const deployBlock = env.EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK?.trim() ?? "";
  if (!isAddress(escrow) || !/^\d{1,12}$/.test(deployBlock)) return unavailable;

  try {
    const client = publicClient(env);
    const [code, feeBps, relayer, gasPrice] = await Promise.all([
      client.getBytecode({ address: escrow as Address }),
      client.readContract({
        address: escrow as Address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "feeBps",
      }),
      Promise.resolve(getRelayer(env)),
      client.getGasPrice(),
    ]);
    if (!code || code === "0x" || feeBps > 200n) return unavailable;
    const balance = await client.getBalance({ address: relayer.address });
    if (balance < gasPrice * 2_000_000n) return unavailable;
    const unresolved = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM evm_settlements WHERE status = 'needs_review'",
    ).first<{ count: number }>();
    if ((unresolved?.count ?? 0) > 0) return unavailable;
    return {
      chainId: CHAIN_ID,
      address: escrow,
      feeBps: Number(feeBps),
      available: true,
      supportedPairs: [SYMBOL],
    };
  } catch {
    return unavailable;
  }
}

function validatePair(body: Record<string, unknown>): void {
  if (String(body.symbol ?? "").toUpperCase() !== SYMBOL) {
    throw new SafeOrderError("Cloudflare wallet trading currently supports A8/ETH only");
  }
  if (String(body.type ?? "").toLowerCase() !== "limit" || String(body.timeInForce ?? "GTC") !== "GTC") {
    throw new SafeOrderError("Only GTC limit orders are supported");
  }
  if (Number(body.chainId) !== CHAIN_ID || String(body.networkType ?? "").toLowerCase() !== "evm") {
    throw new SafeOrderError("A signed Ethereum mainnet order is required");
  }
  if (body.side !== "buy" && body.side !== "sell") throw new SafeOrderError("Invalid order side");
}

function termsForOrder(body: Record<string, unknown>) {
  const quantity = toUnits(body.quantity);
  const price = toUnits(body.price, 18, body.side === "sell");
  if (quantity <= 0n || price <= 0n) throw new SafeOrderError("Order amount and price must be positive");
  const quoteAmount = (quantity * price + SCALE - 1n) / SCALE;
  return {
    quantity,
    price,
    quoteAmount,
    escrowAmount: body.side === "sell" ? quantity : quoteAmount,
  };
}

async function verifyOpenedOrder(
  env: OrderbookEnv,
  body: Record<string, unknown>,
  config: Awaited<ReturnType<typeof getOrderbookConfig>>,
) {
  if (!config.available || !config.address) throw new SafeOrderError("Ethereum orderbook is not enabled", 503);
  const walletAddress = String(body.walletAddress ?? "");
  const nonce = String(body.nonce ?? "");
  const lockTxHash = String(body.orderbookLockTxHash ?? "");
  const orderExpiry = Number(body.orderbookExpiresAt);
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new SafeOrderError("Invalid wallet address");
  if (!/^[0-9a-fA-F]{32}$/.test(nonce)) throw new SafeOrderError("Invalid order nonce");
  if (!/^0x[0-9a-fA-F]{64}$/.test(lockTxHash)) throw new SafeOrderError("Confirmed escrow lock is required");
  if (!Number.isSafeInteger(orderExpiry)) throw new SafeOrderError("Invalid escrow expiry");

  const now = Math.floor(Date.now() / 1000);
  if (
    orderExpiry < now + MIN_ORDER_EXPIRY_SECONDS ||
    orderExpiry > now + MAX_ORDER_EXPIRY_SECONDS
  ) throw new SafeOrderError("Escrow expiry is outside the allowed range");

  const orderKey = orderKeyFromNonce(nonce);
  const terms = termsForOrder(body);
  const client = publicClient(env);
  let receipt;
  let blockNumber: bigint;
  try {
    receipt = await client.getTransactionReceipt({ hash: lockTxHash as Hex });
    blockNumber = await client.getBlockNumber();
  } catch {
    throw new SafeOrderError("Could not verify the Ethereum escrow lock; retry shortly", 503);
  }
  if (receipt.status !== "success") throw new SafeOrderError("Escrow lock transaction reverted");
  if (blockNumber - receipt.blockNumber + 1n < CONFIRMATIONS) {
    throw new SafeOrderError("Escrow lock is awaiting Ethereum confirmations", 409);
  }

  let expectedOpenEvent = false;
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
        args.maker.toLowerCase() === walletAddress.toLowerCase() &&
        Number(args.side) === (body.side === "buy" ? 0 : 1) &&
        args.baseToken.toLowerCase() === A8_ADDRESS.toLowerCase() &&
        args.quoteToken.toLowerCase() === ZERO_ADDRESS.toLowerCase() &&
        args.baseAmount === terms.quantity &&
        args.escrowAmount === terms.escrowAmount &&
        args.limitPriceX18 === terms.price &&
        Number(args.expiresAt) === orderExpiry
      ) {
        expectedOpenEvent = true;
        break;
      }
    } catch {
      // Ignore unrelated contract events in the same receipt.
    }
  }
  if (!expectedOpenEvent) throw new SafeOrderError("Transaction does not contain the expected A8/ETH escrow lock");

  let onchainOrder;
  try {
    onchainOrder = await client.readContract({
      address: config.address as Address,
      abi: ORDERBOOK_ESCROW_ABI,
      functionName: "orders",
      args: [orderKey],
    });
  } catch {
    throw new SafeOrderError("Could not verify the escrow order state; retry shortly", 503);
  }
  if (
    onchainOrder[0].toLowerCase() !== walletAddress.toLowerCase() ||
    onchainOrder[1].toLowerCase() !== A8_ADDRESS.toLowerCase() ||
    onchainOrder[2].toLowerCase() !== ZERO_ADDRESS.toLowerCase() ||
    onchainOrder[3] !== terms.quantity ||
    onchainOrder[4] !== terms.quantity ||
    onchainOrder[5] !== terms.escrowAmount ||
    onchainOrder[6] !== terms.price ||
    Number(onchainOrder[7]) !== orderExpiry ||
    Number(onchainOrder[8]) !== (body.side === "buy" ? 0 : 1) ||
    !onchainOrder[9]
  ) throw new SafeOrderError("On-chain escrow order is inactive or its terms do not match");

  return { orderKey, lockTxHash, orderExpiry, terms };
}

function serializeOrder(row: OrderRow) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    symbol: row.symbol,
    side: row.side,
    type: row.order_type,
    price: Number(row.price),
    quantity: Number(row.quantity),
    filledQuantity: Number(row.filled_quantity),
    remainingQuantity: Number(row.remaining_quantity),
    total: Number(row.price) * Number(row.quantity),
    fee: 0,
    status: row.status === "settling" ? "processing" : row.status,
    nonce: row.nonce,
    chainId: CHAIN_ID,
    evmSignature: undefined,
    fundingRef: `evm-order:${CHAIN_ID}:${row.escrow_address}:${row.order_key}:${row.lock_tx_hash}`,
    orderbookLockTxHash: row.lock_tx_hash,
    orderbookCancelTxHash: row.cancel_tx_hash,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiry: new Date(row.order_expiry * 1000).toISOString(),
    txid: row.cancel_tx_hash ?? null,
  };
}

export async function verifySignature(body: Record<string, unknown>): Promise<void> {
  const walletAddress = String(body.walletAddress ?? "");
  const signature = String(body.evmSignature ?? "");
  const nonce = String(body.nonce ?? "");
  const expiry = Number(body.expiry);
  const now = Math.floor(Date.now() / 1000);
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new SafeOrderError("Invalid wallet address");
  if (!/^[0-9a-fA-F]{32}$/.test(nonce)) throw new SafeOrderError("Invalid order nonce");
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new SafeOrderError("Invalid wallet signature");
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 10 * 60) {
    throw new SafeOrderError("Order authorization has expired");
  }
  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({
      message: orderMessage(body),
      signature: signature as Hex,
    });
  } catch {
    throw new SafeOrderError("Invalid wallet signature");
  }
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new SafeOrderError("Order signature does not match the wallet");
  }
}

async function getOrderById(env: OrderbookEnv, id: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM evm_orders WHERE id = ? LIMIT 1")
    .bind(id).first<OrderRow>();
}

async function finalizeSettlement(env: OrderbookEnv, settlementId: string): Promise<void> {
  const settlement = await env.DB.prepare(
    "SELECT * FROM evm_settlements WHERE id = ? AND status = 'submitted' LIMIT 1",
  ).bind(settlementId).first<SettlementRow>();
  if (!settlement?.tx_hash) return;

  const config = await getOrderbookConfig(env);
  if (!config.available || !config.address) return;
  const client = publicClient(env);
  let receipt;
  let latest: bigint;
  try {
    receipt = await client.getTransactionReceipt({ hash: settlement.tx_hash as Hex });
    latest = await client.getBlockNumber();
  } catch {
    return;
  }
  if (latest - receipt.blockNumber + 1n < CONFIRMATIONS) return;

  if (receipt.status !== "success") {
    await env.DB.batch([
      env.DB.prepare("UPDATE evm_settlements SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'submitted'")
        .bind(Date.now(), settlementId),
      env.DB.prepare("UPDATE evm_order_claims SET status = 'failed' WHERE settlement_id = ? AND status = 'submitted'")
        .bind(settlementId),
      env.DB.prepare("UPDATE evm_orders SET status = 'open', updated_at = ? WHERE id IN (?, ?) AND status = 'settling'")
        .bind(Date.now(), settlement.buy_order_id, settlement.sell_order_id),
    ]);
    return;
  }

  let settledEvent: any = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.address.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ORDERBOOK_ESCROW_ABI,
        eventName: "OrderSettled",
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.args.settlementId.toLowerCase() === settlementId.toLowerCase() &&
        decoded.args.baseAmount === toUnits(settlement.base_amount) &&
        decoded.args.grossQuoteAmount === toUnits(settlement.gross_quote_amount)
      ) {
        settledEvent = decoded.args;
        break;
      }
    } catch {
      // Ignore unrelated settlement events.
    }
  }
  if (!settledEvent) {
    await env.DB.batch([
      // A successful transaction without the expected event is ambiguous.
      // Keep orders locked for manual review rather than risking a duplicate fill.
      env.DB.prepare("UPDATE evm_settlements SET status = 'needs_review', updated_at = ? WHERE id = ? AND status = 'submitted'")
        .bind(Date.now(), settlementId),
    ]);
    return;
  }

  const [buy, sell] = await Promise.all([
    getOrderById(env, settlement.buy_order_id),
    getOrderById(env, settlement.sell_order_id),
  ]);
  if (!buy || !sell) return;
  if (
    settledEvent.buyOrderId.toLowerCase() !== buy.order_key.toLowerCase() ||
    settledEvent.sellOrderId.toLowerCase() !== sell.order_key.toLowerCase() ||
    settledEvent.buyer.toLowerCase() !== buy.wallet_address.toLowerCase() ||
    settledEvent.seller.toLowerCase() !== sell.wallet_address.toLowerCase()
  ) {
    await env.DB.prepare(
      "UPDATE evm_settlements SET status = 'needs_review', updated_at = ? WHERE id = ? AND status = 'submitted'",
    ).bind(Date.now(), settlementId).run();
    return;
  }
  const baseRaw = settledEvent.baseAmount as bigint;
  const quoteRaw = settledEvent.grossQuoteAmount as bigint;
  const feeRaw = settledEvent.feeAmount as bigint;
  const fillQuantity = formatUnits(baseRaw, 18);
  const quoteAmount = formatUnits(quoteRaw, 18);
  const price = formatUnits((quoteRaw * SCALE) / baseRaw, 18);
  const now = Date.now();
  const fillBuy = toUnits(buy.filled_quantity) + baseRaw;
  const fillSell = toUnits(sell.filled_quantity) + baseRaw;
  const remainingBuy = toUnits(buy.quantity) - fillBuy;
  const remainingSell = toUnits(sell.quantity) - fillSell;
  if (remainingBuy < 0n || remainingSell < 0n) {
    await env.DB.prepare(
      "UPDATE evm_settlements SET status = 'needs_review', updated_at = ? WHERE id = ? AND status = 'submitted'",
    ).bind(now, settlementId).run();
    return;
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE evm_settlements SET status = 'finalizing', fee_amount = ?, updated_at = ? WHERE id = ? AND status = 'submitted'")
      .bind(formatUnits(feeRaw, 18), now, settlementId),
    env.DB.prepare(`
      INSERT INTO evm_fills (
        settlement_id, symbol, buy_order_id, sell_order_id, buyer_address,
        seller_address, price, quantity, quote_amount, fee_amount, tx_hash, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM evm_settlements WHERE id = ? AND status = 'finalizing')
      ON CONFLICT(settlement_id) DO NOTHING
    `).bind(
      settlementId, SYMBOL, buy.id, sell.id, buy.wallet_address, sell.wallet_address,
      price, fillQuantity, quoteAmount, formatUnits(feeRaw, 18), settlement.tx_hash, now,
      settlementId,
    ),
    env.DB.prepare(`
      UPDATE evm_orders
      SET filled_quantity = ?, remaining_quantity = ?, status = ?, updated_at = ?
      WHERE id = ? AND status = 'settling'
        AND EXISTS (SELECT 1 FROM evm_settlements WHERE id = ? AND status = 'finalizing')
    `).bind(formatUnits(fillBuy, 18), formatUnits(remainingBuy, 18), remainingBuy === 0n ? "filled" : "open", now, buy.id, settlementId),
    env.DB.prepare(`
      UPDATE evm_orders
      SET filled_quantity = ?, remaining_quantity = ?, status = ?, updated_at = ?
      WHERE id = ? AND status = 'settling'
        AND EXISTS (SELECT 1 FROM evm_settlements WHERE id = ? AND status = 'finalizing')
    `).bind(formatUnits(fillSell, 18), formatUnits(remainingSell, 18), remainingSell === 0n ? "filled" : "open", now, sell.id, settlementId),
    env.DB.prepare("UPDATE evm_order_claims SET status = 'confirmed' WHERE settlement_id = ? AND status = 'submitted'")
      .bind(settlementId),
    env.DB.prepare("UPDATE evm_settlements SET status = 'confirmed', updated_at = ? WHERE id = ? AND status = 'finalizing'")
      .bind(now, settlementId),
  ]);
}

async function matchOrder(
  env: OrderbookEnv,
  newOrderId: string,
  ctx?: ExecutionContext,
): Promise<void> {
  const config = await getOrderbookConfig(env);
  if (!config.available || !config.address) return;
  const incoming = await getOrderById(env, newOrderId);
  if (!incoming || incoming.status !== "open" || incoming.order_expiry <= Date.now() / 1000) return;
  const opposite = incoming.side === "buy" ? "sell" : "buy";
  const candidates = await env.DB.prepare(`
    SELECT * FROM evm_orders
    WHERE symbol = ? AND side = ? AND status = 'open'
      AND order_expiry > ? AND wallet_address != ?
    LIMIT 100
  `).bind(SYMBOL, opposite, Math.floor(Date.now() / 1000), incoming.wallet_address.toLowerCase())
    .all<OrderRow>();

  const incomingPrice = toUnits(incoming.price);
  const book = candidates.results
    .filter((row) => incoming.side === "buy"
      ? toUnits(row.price) <= incomingPrice
      : toUnits(row.price) >= incomingPrice)
    .sort((a, b) => {
      const pa = toUnits(a.price);
      const pb = toUnits(b.price);
      return incoming.side === "buy" ? (pa < pb ? -1 : pa > pb ? 1 : 0) : (pa > pb ? -1 : pa < pb ? 1 : 0);
    });

  for (const resting of book) {
    const current = await getOrderById(env, incoming.id);
    if (!current || current.status !== "open") break;
    const incomingRemaining = toUnits(current.remaining_quantity);
    const restingRemaining = toUnits(resting.remaining_quantity);
    const baseAmount = incomingRemaining < restingRemaining ? incomingRemaining : restingRemaining;
    if (baseAmount <= 0n) continue;
    // Execute at the resting order's price, preserving both limit constraints.
    const grossQuoteAmount = (baseAmount * toUnits(resting.price) + SCALE - 1n) / SCALE;
    const buy = incoming.side === "buy" ? current : resting;
    const sell = incoming.side === "sell" ? current : resting;
    const settlementId = keccak256(stringToHex([
      "orahdex-cloud-orderbook-v1",
      buy.order_key.toLowerCase(),
      sell.order_key.toLowerCase(),
      toUnits(buy.filled_quantity).toString(),
      toUnits(sell.filled_quantity).toString(),
      baseAmount.toString(),
      grossQuoteAmount.toString(),
    ].join(":")));
    const now = Date.now();

    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO evm_settlements (
            id, buy_order_id, sell_order_id, base_amount, gross_quote_amount,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'preparing', ?, ?)
        `).bind(settlementId, buy.id, sell.id, formatUnits(baseAmount, 18), formatUnits(grossQuoteAmount, 18), now, now),
        env.DB.prepare("INSERT INTO evm_order_claims (settlement_id, order_id, status) VALUES (?, ?, 'pending')")
          .bind(settlementId, buy.id),
        env.DB.prepare("INSERT INTO evm_order_claims (settlement_id, order_id, status) VALUES (?, ?, 'pending')")
          .bind(settlementId, sell.id),
        env.DB.prepare(`
          UPDATE evm_orders SET status = 'settling', updated_at = ?
          WHERE id IN (?, ?) AND status = 'open'
        `).bind(now, buy.id, sell.id),
      ]);
    } catch {
      // Another request already claimed one of these orders.
      continue;
    }

    let txHash: Hex;
    try {
      const account = getRelayer(env);
      const wallet = createWalletClient({
        account,
        chain: mainnet,
        transport: http(rpcUrl(env)),
      });
      txHash = await wallet.writeContract({
        address: config.address as Address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "settle",
        args: [
          settlementId,
          buy.order_key as Hex,
          sell.order_key as Hex,
          baseAmount,
          grossQuoteAmount,
        ],
      });
    } catch {
      // A failed RPC call can be ambiguous about whether a transaction was
      // broadcast. Keep the orders claimed instead of reopening funds for a
      // second match; recovery can inspect the chain later.
      await env.DB.batch([
        env.DB.prepare("UPDATE evm_settlements SET status = 'needs_review', updated_at = ? WHERE id = ? AND status = 'preparing'")
          .bind(Date.now(), settlementId),
        env.DB.prepare("UPDATE evm_order_claims SET status = 'submitted' WHERE settlement_id = ? AND status = 'pending'")
          .bind(settlementId),
      ]);
      console.error("Cloud order settlement submission needs review");
      break;
    }

    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE evm_settlements SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'preparing'")
          .bind(txHash, Date.now(), settlementId),
        env.DB.prepare("UPDATE evm_order_claims SET status = 'submitted' WHERE settlement_id = ? AND status = 'pending'")
          .bind(settlementId),
      ]);
      if (ctx) ctx.waitUntil(finalizeSettlement(env, settlementId).catch(() => {}));
    } catch {
      // The chain transaction is already broadcast. Retry persisting its hash;
      // never reopen these orders because that could create a duplicate fill.
      try {
        await env.DB.batch([
          env.DB.prepare("UPDATE evm_settlements SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'preparing'")
            .bind(txHash, Date.now(), settlementId),
          env.DB.prepare("UPDATE evm_order_claims SET status = 'submitted' WHERE settlement_id = ? AND status = 'pending'")
            .bind(settlementId),
        ]);
        if (ctx) ctx.waitUntil(finalizeSettlement(env, settlementId).catch(() => {}));
      } catch {
        await env.DB.prepare("UPDATE evm_settlements SET status = 'needs_review', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'preparing'")
          .bind(txHash, Date.now(), settlementId).run().catch(() => {});
        await env.DB.prepare("UPDATE evm_order_claims SET status = 'submitted' WHERE settlement_id = ? AND status = 'pending'")
          .bind(settlementId).run().catch(() => {});
      }
      console.error("Cloud order settlement status update needs review");
      break;
    }
  }
}

async function recoverSettlements(env: OrderbookEnv, walletAddress?: string, ctx?: ExecutionContext) {
  const result = await env.DB.prepare(`
    SELECT DISTINCT s.id
    FROM evm_settlements s
    JOIN evm_order_claims c ON c.settlement_id = s.id
    JOIN evm_orders o ON o.id = c.order_id
    WHERE s.status = 'submitted' ${walletAddress ? "AND LOWER(o.wallet_address) = LOWER(?)" : ""}
    LIMIT 10
  `).bind(...(walletAddress ? [walletAddress] : [])).all<{ id: string }>();
  for (const row of result.results) {
    const job = finalizeSettlement(env, row.id).catch(() => {});
    if (ctx) ctx.waitUntil(job);
  }
}

async function createOrder(request: Request, env: OrderbookEnv, ctx?: ExecutionContext): Promise<Response> {
  const config = await getOrderbookConfig(env);
  if (!config.available) return json({ error: "Cloudflare Ethereum trading is not enabled" }, 503);
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: "Invalid or oversized JSON body" }, 400);
  }

  try {
    validatePair(body);
    await verifySignature(body);
    const { orderKey, lockTxHash, orderExpiry, terms } = await verifyOpenedOrder(env, body, config);
    const walletAddress = String(body.walletAddress);
    const nonce = String(body.nonce);
    const existing = await env.DB.prepare(`
      SELECT * FROM evm_orders
      WHERE (LOWER(wallet_address) = LOWER(?) AND nonce = ?)
         OR LOWER(order_key) = LOWER(?)
      LIMIT 1
    `).bind(walletAddress, nonce, orderKey).first<OrderRow>();
    if (existing) {
      if (existing.wallet_address.toLowerCase() !== walletAddress.toLowerCase() ||
          existing.order_key.toLowerCase() !== orderKey.toLowerCase() ||
          existing.lock_tx_hash.toLowerCase() !== lockTxHash.toLowerCase()) {
        return json({ error: "Order nonce was already used", code: "ORDER_NONCE_REPLAY" }, 409);
      }
      return json(serializeOrder(existing), 200);
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    const quantity = formatUnits(terms.quantity, 18);
    const price = formatUnits(terms.price, 18);
    const insert = await env.DB.prepare(`
      INSERT INTO evm_orders (
        id, wallet_address, symbol, base_asset, quote_asset, side, order_type,
        price, quantity, filled_quantity, remaining_quantity, status, nonce,
        auth_expiry, order_expiry, signature, order_key, escrow_address,
        lock_tx_hash, created_at, updated_at
      ) VALUES (?, ?, ?, 'A8', 'ETH', ?, 'limit', ?, ?, '0', ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, walletAddress.toLowerCase(), SYMBOL, body.side, price, quantity, quantity,
      nonce, Number(body.expiry), orderExpiry, String(body.evmSignature), orderKey,
      config.address, lockTxHash, now, now,
    ).run();
    if (insert.meta.changes !== 1) return json({ error: "Order was not stored" }, 503);

    await matchOrder(env, id, ctx);
    const saved = await getOrderById(env, id);
    return json(saved ? serializeOrder(saved) : { id, status: "open" }, 201);
  } catch (error) {
    if (error instanceof SafeOrderError) {
      return json({ error: error.message, code: "INVALID_EVM_ORDER" }, error.status);
    }
    return json({ error: "Ethereum order verification is temporarily unavailable", code: "ETHEREUM_RPC_UNAVAILABLE" }, 503);
  }
}

async function cancelOrder(
  request: Request,
  env: OrderbookEnv,
  order: OrderRow,
): Promise<Response> {
  if (order.status === "cancelled") return json(serializeOrder(order));
  if (order.status === "filled") return json({ error: "Filled orders cannot be cancelled" }, 409);
  if (order.status !== "open" && order.status !== "settling") {
    return json({ error: "Order state does not allow cancellation" }, 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: "Invalid or oversized JSON body" }, 400);
  }
  const walletAddress = String(body.walletAddress ?? "");
  const cancelTxHash = String(body.orderbookCancelTxHash ?? "");
  if (walletAddress.toLowerCase() !== order.wallet_address.toLowerCase()) {
    return json({ error: "Order does not belong to this wallet" }, 403);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(cancelTxHash)) {
    return json({ error: "Confirmed escrow cancellation transaction is required" }, 400);
  }
  const client = publicClient(env);
  let receipt;
  let latest: bigint;
  try {
    receipt = await client.getTransactionReceipt({ hash: cancelTxHash as Hex });
    latest = await client.getBlockNumber();
  } catch {
    return json({ error: "Could not verify the Ethereum cancellation; retry shortly" }, 503);
  }
  if (receipt.status !== "success") return json({ error: "Cancellation transaction reverted" }, 400);
  if (latest - receipt.blockNumber + 1n < CONFIRMATIONS) {
    return json({ error: "Cancellation is awaiting Ethereum confirmations", code: "ORDERBOOK_CANCEL_INVALID" }, 400);
  }
  const proof = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== order.escrow_address.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({
        abi: ORDERBOOK_ESCROW_ABI,
        eventName: "OrderCancelled",
        data: log.data,
        topics: log.topics,
      });
      return decoded.args.orderId.toLowerCase() === order.order_key.toLowerCase() &&
        decoded.args.maker.toLowerCase() === walletAddress.toLowerCase();
    } catch {
      return false;
    }
  });
  if (!proof) return json({ error: "Transaction does not prove cancellation of this order" }, 400);
  const result = await env.DB.prepare(`
    UPDATE evm_orders SET status = 'cancelled', cancel_tx_hash = ?, updated_at = ?
    WHERE id = ? AND LOWER(wallet_address) = LOWER(?) AND status IN ('open', 'settling')
  `).bind(cancelTxHash, Date.now(), order.id, walletAddress).run();
  if (result.meta.changes !== 1) return json({ error: "Order state changed during cancellation" }, 409);
  const updated = await getOrderById(env, order.id);
  return json(updated ? serializeOrder(updated) : { id: order.id, status: "cancelled" });
}

async function getOrders(env: OrderbookEnv, walletAddress: string, ctx?: ExecutionContext): Promise<Response> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) return json({ error: "Valid walletAddress is required" }, 400);
  await recoverSettlements(env, walletAddress, ctx);
  const result = await env.DB.prepare(`
    SELECT * FROM evm_orders
    WHERE LOWER(wallet_address) = LOWER(?)
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(walletAddress).all<OrderRow>();
  return json(result.results.map(serializeOrder));
}

async function recoverEvmOrders(request: Request, env: OrderbookEnv): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: "Invalid or oversized JSON body" }, 400);
  }
  const walletAddress = String(body.walletAddress ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return json({ error: "A valid Ethereum wallet address is required" }, 400);
  }

  const escrow = env.EVM_ORDERBOOK_ESCROW_ETH?.trim() ?? "";
  const deploymentBlockRaw = env.EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK?.trim() ?? "";
  if (!isAddress(escrow) || !/^\d{1,12}$/.test(deploymentBlockRaw)) {
    return json({ error: "Ethereum order recovery is not configured" }, 503);
  }

  const now = Date.now();
  try {
    const rateLimit = await env.DB.prepare(`
      INSERT INTO evm_recovery_rate_limits (wallet_address, last_run)
      VALUES (LOWER(?), ?)
      ON CONFLICT(wallet_address) DO UPDATE SET last_run = excluded.last_run
      WHERE evm_recovery_rate_limits.last_run < ?
    `).bind(walletAddress, now, now - 60_000).run();
    if (rateLimit.meta.changes !== 1) {
      return json({ error: "Please wait before scanning this wallet again" }, 429);
    }
  } catch {
    return json({ error: "Order recovery storage is unavailable" }, 503);
  }

  const client = publicClient(env);
  let latestBlock: bigint;
  let logs: Awaited<ReturnType<typeof client.getLogs>> = [];
  try {
    latestBlock = await client.getBlockNumber();
    const deploymentBlock = BigInt(deploymentBlockRaw);
    const scanFrom = deploymentBlock > latestBlock - RECOVERY_SCAN_BLOCKS
      ? deploymentBlock
      : (latestBlock > RECOVERY_SCAN_BLOCKS ? latestBlock - RECOVERY_SCAN_BLOCKS : 0n);
    for (let fromBlock = scanFrom; fromBlock <= latestBlock;) {
      const toBlock = fromBlock + RECOVERY_SCAN_CHUNK - 1n < latestBlock
        ? fromBlock + RECOVERY_SCAN_CHUNK - 1n
        : latestBlock;
      const chunk = await client.getLogs({
        address: escrow as Address,
        event: ORDER_OPENED_EVENT,
        args: { maker: walletAddress as Address },
        fromBlock,
        toBlock,
      });
      logs = logs.concat(chunk);
      if (logs.length > MAX_RECOVERY_LOGS) {
        return json({ error: "Too many recent escrow orders to recover in one scan" }, 413);
      }
      fromBlock = toBlock + 1n;
    }
  } catch {
    return json({ error: "Could not scan Ethereum escrow events; retry shortly" }, 503);
  }

  const existingResult = await env.DB.prepare(
    "SELECT order_key FROM evm_orders WHERE LOWER(wallet_address) = LOWER(?)",
  ).bind(walletAddress).all<{ order_key: string }>();
  const existingKeys = new Set(existingResult.results.map((row) => row.order_key.toLowerCase()));
  const nowSeconds = Math.floor(now / 1000);
  let recoveredCount = 0;

  for (const log of logs) {
    if (!log.blockNumber || !log.transactionHash) continue;
    if (latestBlock - log.blockNumber + 1n < CONFIRMATIONS) continue;

    let args;
    try {
      const decoded = decodeEventLog({
        abi: ORDERBOOK_ESCROW_ABI,
        eventName: "OrderOpened",
        data: log.data,
        topics: log.topics,
      });
      args = decoded.args;
    } catch {
      continue;
    }
    if (existingKeys.has(args.orderId.toLowerCase())) continue;
    if (
      args.maker.toLowerCase() !== walletAddress.toLowerCase() ||
      args.baseToken.toLowerCase() !== A8_ADDRESS.toLowerCase() ||
      args.quoteToken.toLowerCase() !== ZERO_ADDRESS.toLowerCase() ||
      Number(args.side) > 1 ||
      Number(args.expiresAt) <= nowSeconds ||
      args.baseAmount <= 0n ||
      args.limitPriceX18 <= 0n
    ) continue;

    let onchainOrder;
    try {
      onchainOrder = await client.readContract({
        address: escrow as Address,
        abi: ORDERBOOK_ESCROW_ABI,
        functionName: "orders",
        args: [args.orderId],
      });
    } catch {
      return json({ error: "Could not verify recovered escrow state; retry shortly" }, 503);
    }
    if (
      !onchainOrder[9] ||
      onchainOrder[0].toLowerCase() !== walletAddress.toLowerCase() ||
      onchainOrder[1].toLowerCase() !== A8_ADDRESS.toLowerCase() ||
      onchainOrder[2].toLowerCase() !== ZERO_ADDRESS.toLowerCase() ||
      onchainOrder[3] !== args.baseAmount ||
      onchainOrder[6] !== args.limitPriceX18 ||
      onchainOrder[7] !== args.expiresAt ||
      Number(onchainOrder[8]) !== Number(args.side) ||
      onchainOrder[4] <= 0n
    ) continue;

    const remaining = onchainOrder[4];
    const filled = args.baseAmount - remaining;
    if (filled < 0n) continue;
    const side = Number(args.side) === 0 ? "buy" : "sell";
    const quantity = formatUnits(args.baseAmount, 18);
    const remainingQuantity = formatUnits(remaining, 18);
    const price = formatUnits(args.limitPriceX18, 18);
    const orderKey = args.orderId.toLowerCase();
    const insert = await env.DB.prepare(`
      INSERT OR IGNORE INTO evm_orders (
        id, wallet_address, symbol, base_asset, quote_asset, side, order_type,
        price, quantity, filled_quantity, remaining_quantity, status, nonce,
        auth_expiry, order_expiry, signature, order_key, escrow_address,
        lock_tx_hash, created_at, updated_at
      ) VALUES (?, ?, ?, 'A8', 'ETH', ?, 'limit', ?, ?, ?, ?, 'open', ?, 0, ?, '', ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), walletAddress.toLowerCase(), SYMBOL, side, price, quantity,
      formatUnits(filled, 18), remainingQuantity, orderKey, Number(args.expiresAt),
      orderKey, escrow, log.transactionHash, now, now,
    ).run();
    if (insert.meta.changes === 1) {
      existingKeys.add(orderKey);
      recoveredCount += 1;
    }
  }

  return json({ count: recoveredCount });
}

async function orderBook(env: OrderbookEnv): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(`
    SELECT side, price, remaining_quantity
    FROM evm_orders
    WHERE symbol = ? AND status = 'open' AND order_expiry > ?
  `).bind(SYMBOL, now).all<{ side: string; price: string; remaining_quantity: string }>();
  const levels = new Map<string, { side: string; quantity: bigint }>();
  for (const row of rows.results) {
    const key = `${row.side}:${row.price}`;
    const level = levels.get(key) ?? { side: row.side, quantity: 0n };
    level.quantity += toUnits(row.remaining_quantity);
    levels.set(key, level);
  }
  const bidLevels = [...levels.entries()]
    .filter(([, level]) => level.side === "buy")
    .map(([key, level]) => ({ price: key.slice(4), quantity: level.quantity }))
    .sort((a, b) => (toUnits(a.price) > toUnits(b.price) ? -1 : toUnits(a.price) < toUnits(b.price) ? 1 : 0));
  const askLevels = [...levels.entries()]
    .filter(([, level]) => level.side === "sell")
    .map(([key, level]) => ({ price: key.slice(5), quantity: level.quantity }))
    .sort((a, b) => (toUnits(a.price) < toUnits(b.price) ? -1 : toUnits(a.price) > toUnits(b.price) ? 1 : 0));
  const bids = bidLevels.map((row) => [Number(row.price), Number(formatUnits(row.quantity, 18))]);
  const asks = askLevels.map((row) => [Number(row.price), Number(formatUnits(row.quantity, 18))]);
  return json({ symbol: SYMBOL, bids, asks, timestamp: Date.now() });
}

async function recentTrades(env: OrderbookEnv): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT price, quantity, quote_amount, buyer_address, seller_address, tx_hash, created_at
    FROM evm_fills WHERE symbol = ? ORDER BY created_at DESC LIMIT 100
  `).bind(SYMBOL).all<Record<string, unknown>>();
  return json(result.results.map((row) => ({
    symbol: SYMBOL,
    price: Number(row.price),
    quantity: Number(row.quantity),
    quoteAmount: Number(row.quote_amount),
    buyerAddress: row.buyer_address,
    sellerAddress: row.seller_address,
    txHash: row.tx_hash,
    timestamp: row.created_at,
  })));
}

export async function handleOrderRequest(
  request: Request,
  env: OrderbookEnv,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === "/api/orders/evm-settlement/config") {
    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    return json(await getOrderbookConfig(env));
  }

  if (url.pathname === "/api/orders") {
    if (method === "GET") {
      const walletAddress = url.searchParams.get("walletAddress") ?? "";
      return getOrders(env, walletAddress, ctx);
    }
    if (method === "POST") return createOrder(request, env, ctx);
    return json({ error: "Method not allowed" }, 405);
  }

  if (url.pathname === "/api/orders/recover-evm") {
    if (method !== "POST") return json({ error: "Method not allowed" }, 405);
    return recoverEvmOrders(request, env);
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch) {
    if (method !== "GET" && method !== "DELETE") return json({ error: "Method not allowed" }, 405);
    const id = decodeURIComponent(orderMatch[1]!);
    const order = await getOrderById(env, id);
    if (!order) return json({ error: "Order not found" }, 404);
    if (method === "DELETE") return cancelOrder(request, env, order);
    const walletAddress = url.searchParams.get("walletAddress");
    if (walletAddress && walletAddress.toLowerCase() !== order.wallet_address.toLowerCase()) {
      return json({ error: "Order does not belong to this wallet" }, 403);
    }
    await recoverSettlements(env, order.wallet_address, ctx);
    return json(serializeOrder(order));
  }

  const marketMatch = url.pathname.match(/^\/api\/markets\/(.+)\/(orderbook|trades)$/);
  if (marketMatch) {
    let symbol: string;
    try {
      symbol = decodeURIComponent(marketMatch[1]!).toUpperCase();
    } catch {
      return json({ error: "Invalid market symbol" }, 400);
    }
    if (symbol !== SYMBOL) return null;
    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    return marketMatch[2] === "orderbook" ? orderBook(env) : recentTrades(env);
  }

  return null;
}
