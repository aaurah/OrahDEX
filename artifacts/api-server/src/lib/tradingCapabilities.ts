import { pool } from "@workspace/db";
import {
  isEvmOrderbookChainEnabled,
  orderbookTradingEnabled,
  safeApiStartup,
  tradingWorkersEnabled,
} from "./startupMode.js";
import { getEvmOrderbookEscrowConfig } from "./evmOrderbookEscrow.js";
import { getHealthReport } from "./selfHealing.js";

export type TradingNetwork = "evm" | "bsv" | "sol" | "btc" | "bch" | "other";

export interface NetworkTradingCapability {
  available: boolean;
  reason?: string;
  chainId?: number;
  orderTypes?: string[];
  settlement?: string;
}

export interface TradingCapabilitySnapshot {
  safeStartup: boolean;
  networks: Record<TradingNetwork, NetworkTradingCapability>;
}

export interface OrderCapabilityInput {
  networkType: string;
  chainId?: number;
  orderType: string;
  symbol: string;
  walletAddressIsEvm: boolean;
  hasEscrowLock: boolean;
  ethereumPairSupported: boolean;
}

const DISABLED_NETWORKS: Record<Exclude<TradingNetwork, "evm">, NetworkTradingCapability> = {
  bsv: {
    available: false,
    reason: "BSV order settlement is not verified as atomic; order-book trading is disabled for safety.",
  },
  sol: {
    available: false,
    reason: "A funded Solana order settlement path has not been verified; trading is disabled for safety.",
  },
  btc: {
    available: false,
    reason: "Bitcoin order funding and settlement are not supported by the verified order-book path.",
  },
  bch: {
    available: false,
    reason: "Bitcoin Cash order funding and settlement are not supported by the verified order-book path.",
  },
  other: {
    available: false,
    reason: "This wallet network is not supported by the verified order-book path.",
  },
};

function configuredEvmChainId(requestedChainId?: number): number {
  const chainId = requestedChainId ?? Number(process.env.ORAHDEX_TRADING_EVM_CHAIN_ID ?? "1");
  return chainId === 1 || chainId === 11155111 ? chainId : -1;
}

function readOnlyCapability(reason: string, chainId = configuredEvmChainId()): TradingCapabilitySnapshot {
  return {
    safeStartup: true,
    networks: {
      evm: { available: false, chainId, reason },
      ...DISABLED_NETWORKS,
    },
  };
}

/**
 * Return readiness for the requested wallet chain without starting workers.
 * Each chain must be explicitly configured and independently verified.
 */
export async function getTradingCapabilities(requestedChainId?: number): Promise<TradingCapabilitySnapshot> {
  const chainId = configuredEvmChainId(requestedChainId);
  if (chainId < 0) {
    return readOnlyCapability("The configured EVM trading chain is not supported.", chainId);
  }
  if (!isEvmOrderbookChainEnabled(chainId)) {
    return readOnlyCapability(
      chainId === 1
        ? "Ethereum mainnet needs a funded relayer and a verified escrow order lifecycle before trading can be enabled."
        : safeApiStartup
        ? `Trading has not been verified on EVM chain ${chainId}.`
        : `EVM orderbook trading is not enabled on chain ${chainId}.`,
      chainId,
    );
  }

  if (!tradingWorkersEnabled && !orderbookTradingEnabled) {
    return {
      safeStartup: safeApiStartup,
      networks: {
        evm: {
          available: false,
          chainId,
          reason: "Order, deposit, and settlement workers are disabled.",
        },
        ...DISABLED_NETWORKS,
      },
    };
  }

  let databaseReady = false;
  let orderRecoveryReady = false;
  try {
    await pool.query("SELECT 1");
    databaseReady = true;
    const recovery = getHealthReport().find((service) => service.name === "order-reconciler");
    orderRecoveryReady =
      recovery?.status === "healthy" &&
      recovery.lastSuccessAt !== null;
  } catch {
    // No mutation is attempted; an unavailable DB/recovery worker keeps trading paused.
  }
  if (!databaseReady || !orderRecoveryReady) {
    return {
      safeStartup: safeApiStartup && !isEvmOrderbookChainEnabled(chainId),
      networks: {
        evm: {
          available: false,
          chainId,
          reason: !databaseReady
            ? "The trading database is unavailable."
            : "The order recovery worker has not completed a healthy check yet.",
        },
        ...DISABLED_NETWORKS,
      },
    };
  }

  let escrowReady = false;
  let escrowReason: string | undefined;
  try {
    const escrow = await getEvmOrderbookEscrowConfig(chainId);
    escrowReady = escrow.available === true && escrow.chainId === chainId;
    escrowReason = escrow.reason;
  } catch {
    // Fail closed when RPC, contract, or relayer readiness cannot be confirmed.
  }

  return {
    safeStartup: safeApiStartup && !isEvmOrderbookChainEnabled(chainId),
    networks: {
      evm: escrowReady
        ? {
            available: true,
            chainId,
            orderTypes: ["limit"],
            settlement: chainId === 11155111
              ? "confirmed Sepolia orderbook escrow"
              : "confirmed Ethereum orderbook escrow",
          }
        : {
            available: false,
            chainId,
            reason: escrowReason ?? "EVM escrow contract, RPC, or relayer readiness could not be verified.",
          },
      ...DISABLED_NETWORKS,
    },
  };
}

/**
 * Apply stricter request-specific checks than the summary status endpoint.
 * Only the configured Ethereum-chain limit orders with a supported asset pair and a
 * confirmed escrow-lock transaction can enter matching.
 */
export function getOrderNetworkCapability(
  snapshot: TradingCapabilitySnapshot,
  input: OrderCapabilityInput,
): NetworkTradingCapability {
  const network = input.networkType.toLowerCase() as TradingNetwork;
  const capability = snapshot.networks[network] ?? snapshot.networks.other;
  if (!capability.available) return capability;

  if (network !== "evm") {
    return { available: false, reason: "This network has no verified order settlement path." };
  }
  if (!input.walletAddressIsEvm) {
    return { available: false, reason: "An Ethereum wallet address is required for this order." };
  }
  if (input.chainId !== capability.chainId) {
    return {
      available: false,
      chainId: capability.chainId,
      reason: capability.chainId === 11155111
        ? "Wallet-funded order-book trading is enabled on Sepolia only."
        : "Wallet-funded order-book trading is enabled on Ethereum mainnet only.",
    };
  }
  if (input.orderType !== "limit") {
    return { available: false, chainId: capability.chainId, reason: "Only escrow-backed EVM limit orders are enabled." };
  }
  if (!input.ethereumPairSupported) {
    return { available: false, chainId: capability.chainId, reason: `${input.symbol} is not supported by EVM order escrow.` };
  }
  if (!input.hasEscrowLock) {
    return { available: false, chainId: capability.chainId, reason: "A confirmed EVM escrow lock is required before placing this order." };
  }
  return capability;
}
