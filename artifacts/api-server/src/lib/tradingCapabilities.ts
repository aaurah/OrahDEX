import { pool } from "@workspace/db";
import { safeApiStartup, tradingWorkersEnabled } from "./startupMode.js";
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

function readOnlyCapability(reason: string): TradingCapabilitySnapshot {
  return {
    safeStartup: true,
    networks: {
      evm: { available: false, chainId: 1, reason },
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
  if (safeApiStartup) {
    return readOnlyCapability("This preview is read-only while trading services are paused.");
  }

  if (!tradingWorkersEnabled) {
    return {
      safeStartup: false,
      networks: {
        evm: {
          available: false,
          chainId: 1,
          reason: "Order, deposit, and settlement workers are disabled.",
        },
        ...DISABLED_NETWORKS,
      },
    };
  }

  if (process.env.ORAHDEX_TRADING_EVM_VERIFIED !== "true") {
    return {
      safeStartup: false,
      networks: {
        evm: {
          available: false,
          chainId: 1,
          reason: "Ethereum order trading is disabled until its testnet order, settlement, cancellation, and recovery checks are verified.",
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
      safeStartup: false,
      networks: {
        evm: {
          available: false,
          chainId: 1,
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
    const escrow = await getEvmOrderbookEscrowConfig();
    escrowReady = escrow.available === true && escrow.chainId === 1;
  } catch {
    // Fail closed when RPC, contract, or relayer readiness cannot be confirmed.
  }

  return {
    safeStartup: false,
    networks: {
      evm: escrowReady
        ? {
            available: true,
            chainId: 1,
            orderTypes: ["limit"],
            settlement: "confirmed Ethereum orderbook escrow",
          }
        : {
            available: false,
            chainId: 1,
            reason: "Ethereum escrow contract, RPC, or relayer readiness could not be verified.",
          },
      ...DISABLED_NETWORKS,
    },
  };
}

/**
 * Apply stricter request-specific checks than the summary status endpoint.
 * Only Ethereum mainnet limit orders with a supported asset pair and a
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
  if (input.chainId !== 1) {
    return { available: false, chainId: 1, reason: "Wallet-funded order-book trading is enabled on Ethereum mainnet only." };
  }
  if (input.orderType !== "limit") {
    return { available: false, chainId: 1, reason: "Only escrow-backed Ethereum limit orders are enabled." };
  }
  if (!input.ethereumPairSupported) {
    return { available: false, chainId: 1, reason: `${input.symbol} is not supported by Ethereum order escrow.` };
  }
  if (!input.hasEscrowLock) {
    return { available: false, chainId: 1, reason: "A confirmed Ethereum escrow lock is required before placing this order." };
  }
  return capability;
}
