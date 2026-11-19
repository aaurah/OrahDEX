import { pool } from "@workspace/db";
import { orderbookTradingEnabled, safeApiStartup, tradingWorkersEnabled } from "./startupMode.js";
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

function configuredEvmChainId(): number {
  const chainId = Number(process.env.ORAHDEX_TRADING_EVM_CHAIN_ID ?? "1");
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
 * Return the network-specific trading readiness without starting any workers.
 * Ethereum stays disabled until the operator explicitly marks the full testnet
 * lifecycle (place, match, settle, cancel, recovery) as verified.
 */
export async function getTradingCapabilities(): Promise<TradingCapabilitySnapshot> {
  const chainId = configuredEvmChainId();
  if (chainId < 0) {
    return readOnlyCapability("The configured EVM trading chain is not supported.", chainId);
  }
  if (safeApiStartup && !orderbookTradingEnabled) {
    return readOnlyCapability("This preview is read-only while trading services are paused.", chainId);
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

  if (process.env.ORAHDEX_TRADING_EVM_VERIFIED !== "true") {
    return {
      safeStartup: safeApiStartup && !orderbookTradingEnabled,
      networks: {
        evm: {
          available: false,
          chainId,
          reason: "EVM order trading is disabled until the testnet order, settlement, cancellation, and recovery checks are verified.",
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
      safeStartup: safeApiStartup && !orderbookTradingEnabled,
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
  try {
    const escrow = await getEvmOrderbookEscrowConfig(chainId);
    escrowReady = escrow.available === true && escrow.chainId === chainId;
  } catch {
    // Fail closed when RPC, contract, or relayer readiness cannot be confirmed.
  }

  return {
    safeStartup: safeApiStartup && !orderbookTradingEnabled,
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
            reason: "EVM escrow contract, RPC, or relayer readiness could not be verified.",
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
