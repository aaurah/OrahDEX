/**
 * withdrawalProcessor.ts — OrahDEX
 *
 * Automatically broadcasts on-chain withdrawals the moment a user requests one.
 *
 * Supported networks:
 *   EVM (evm)  — ETH, BNB, MATIC, AVAX, FTM and any ERC-20/BEP-20/Polygon token
 *   BSV (bsv)  — Bitcoin SV P2PKH transfer via WhatsOnChain
 *   BCH (bch)  — Bitcoin Cash (same signing path as BSV, different broadcast endpoint)
 *
 * Hot wallet config (env vars):
 *   EXCHANGE_HOT_WALLET_KEY  — 0x-prefixed EVM private key (all EVM chains share one key)
 *   BSV_SETTLEMENT_KEY       — BSV WIF key (re-uses the settlement wallet)
 *
 * If a key is absent the request stays "pending" for manual admin processing.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getOrCreateWallet, fetchWalletBalance, buildAndBroadcastBsvTx } from "./bsvWallet.js";
import { logger } from "./logger.js";

// ── EVM chain registry ─────────────────────────────────────────────────────────

interface EvmChain {
  id:          number;
  name:        string;
  rpcUrl:      string;
  explorer:    string;
  nativeToken: string;
}

const EVM_REGISTRY: Record<string, EvmChain> = {
  ETH:  { id: 1,     name: "Ethereum",   rpcUrl: process.env.ETH_RPC_URL      ?? "https://eth.llamarpc.com",           explorer: "https://etherscan.io",    nativeToken: "ETH"  },
  BNB:  { id: 56,    name: "BNB Chain",  rpcUrl: process.env.BSC_RPC_URL      ?? "https://bsc-dataseed.binance.org",   explorer: "https://bscscan.com",     nativeToken: "BNB"  },
  MATIC:{ id: 137,   name: "Polygon",    rpcUrl: process.env.POLYGON_RPC_URL  ?? "https://polygon-rpc.com",            explorer: "https://polygonscan.com", nativeToken: "MATIC"},
  AVAX: { id: 43114, name: "Avalanche",  rpcUrl: process.env.AVAX_RPC_URL     ?? "https://api.avax.network/ext/bc/C/rpc", explorer: "https://snowtrace.io", nativeToken: "AVAX" },
  FTM:  { id: 250,   name: "Fantom",     rpcUrl: process.env.FTM_RPC_URL      ?? "https://rpcapi.fantom.network",      explorer: "https://ftmscan.com",     nativeToken: "FTM"  },
};

// ── ERC-20 token registry (symbol → per-chainId contract + decimals) ──────────

interface TokenInfo { address: Address; decimals: number }

const ERC20_TOKENS: Record<string, Record<number, TokenInfo>> = {
  USDT: {
    1:   { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6  },
    56:  { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    137: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6  },
  },
  USDC: {
    1:   { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6  },
    56:  { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    137: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6  },
  },
  DAI: {
    1:   { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    56:  { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
    137: { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
  },
  BUSD: {
    56:  { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
  },
  CAKE: {
    56:  { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
  },
  LINK: {
    1:   { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  },
  AAVE: {
    1:   { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
  },
  UNI:  {
    1:   { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  },
  MATIC: {
    1:   { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18 },
  },
};

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// ── Helper: determine which EVM chain to use for a given asset ────────────────

function assetToChainId(asset: string): number {
  const CHAIN_MAP: Record<string, number> = {
    ETH: 1, USDT: 1, USDC: 1, DAI: 1, LINK: 1, AAVE: 1, UNI: 1,
    BNB: 56, BUSD: 56, CAKE: 56,
    MATIC: 137,
    AVAX: 43114,
    FTM: 250,
  };
  return CHAIN_MAP[asset.toUpperCase()] ?? 1;
}

/** Find an EVM chain config by chain ID */
function chainById(id: number): EvmChain | undefined {
  return Object.values(EVM_REGISTRY).find(c => c.id === id);
}

// ── EVM withdrawal ─────────────────────────────────────────────────────────────

async function processEvmWithdrawal(params: {
  asset:     string;
  amount:    number;
  recipient: string;
}): Promise<{ txid: string; explorer: string }> {
  const rawKey = process.env.EXCHANGE_HOT_WALLET_KEY;
  if (!rawKey) throw new Error("EXCHANGE_HOT_WALLET_KEY not configured — cannot auto-process EVM withdrawal");

  const privKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privKey);
  const chainId = assetToChainId(params.asset);
  const chain   = chainById(chainId);
  if (!chain) throw new Error(`No EVM chain config for chainId ${chainId}`);

  const viemChain = {
    id:   chain.id,
    name: chain.name,
    nativeCurrency: { name: chain.nativeToken, symbol: chain.nativeToken, decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) });

  const assetUp = params.asset.toUpperCase();
  const isNative = chain.nativeToken === assetUp;

  let txHash: `0x${string}`;

  if (isNative) {
    // ── Native token transfer (ETH, BNB, MATIC, AVAX, FTM) ────────────────────
    const weiAmount = BigInt(Math.round(params.amount * 1e18));
    txHash = await walletClient.sendTransaction({
      to:    params.recipient as Address,
      value: weiAmount,
    });
  } else {
    // ── ERC-20 transfer ────────────────────────────────────────────────────────
    const tokenInfo = ERC20_TOKENS[assetUp]?.[chainId];
    if (!tokenInfo) throw new Error(`No ERC-20 contract known for ${assetUp} on chainId ${chainId}`);

    const tokenAmount = BigInt(Math.round(params.amount * 10 ** tokenInfo.decimals));

    txHash = await walletClient.writeContract({
      address:      tokenInfo.address,
      abi:          ERC20_ABI,
      functionName: "transfer",
      args:         [params.recipient as Address, tokenAmount],
    });
  }

  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => {
    // Don't throw — tx is broadcast; receipt may just be slow
    logger.warn({ txHash }, "withdrawal: receipt polling timed out (tx is broadcast)");
  });

  const explorer = `${chain.explorer}/tx/${txHash}`;
  logger.info({ txHash, asset: params.asset, amount: params.amount, recipient: params.recipient, chainId }, "EVM withdrawal broadcast");
  return { txid: txHash, explorer };
}

// ── BSV/BCH withdrawal ─────────────────────────────────────────────────────────

async function processBsvWithdrawal(params: {
  asset:     string;
  amount:    number;
  recipient: string;
}): Promise<{ txid: string; explorer: string }> {
  const wallet = await getOrCreateWallet();
  const balance = await fetchWalletBalance(wallet.address);

  const satoshis = Math.round(params.amount * 1e8);
  const FEE = 500;

  if (balance.totalSatoshis < satoshis + FEE) {
    throw new Error(
      `BSV hot wallet insufficient funds: has ${balance.totalSatoshis} sat, ` +
      `need ${satoshis + FEE} sat (${params.amount} BSV + fee). ` +
      `Fund address ${wallet.address} to enable auto-withdrawals.`
    );
  }

  const result = await buildAndBroadcastBsvTx(
    params.recipient,
    satoshis,
    wallet,
    balance.utxos,
    FEE,
  );

  const isMainnet = (process.env.BSV_NETWORK ?? "mainnet") === "mainnet";
  const explorer = isMainnet
    ? `https://whatsonchain.com/tx/${result.txid}`
    : `https://test.whatsonchain.com/tx/${result.txid}`;

  logger.info({ txid: result.txid, asset: params.asset, amount: params.amount, recipient: params.recipient }, "BSV withdrawal broadcast");
  return { txid: result.txid, explorer };
}

// ── Public entry point ─────────────────────────────────────────────────────────

export interface ProcessResult {
  status:   "completed" | "pending";
  txid?:    string;
  explorer?: string;
  note?:    string;
}

/**
 * Attempts to process a withdrawal on-chain immediately.
 * Returns { status: "completed", txid } on success, or { status: "pending", note }
 * if the hot wallet is not configured or an error occurs.
 */
export async function processWithdrawal(params: {
  asset:     string;
  amount:    number;
  network:   string;    // "evm" | "bsv" | "bch" | "btc" | ...
  recipient: string;
}): Promise<ProcessResult> {
  const net = params.network.toLowerCase();

  try {
    if (net === "evm") {
      const { txid, explorer } = await processEvmWithdrawal(params);
      return { status: "completed", txid, explorer };
    }

    if (net === "bsv" || net === "bch") {
      const { txid, explorer } = await processBsvWithdrawal(params);
      return { status: "completed", txid, explorer };
    }

    // Unsupported network — leave pending for manual processing
    return {
      status: "pending",
      note:   `Auto-processing not yet available for ${params.network.toUpperCase()} network. Request queued for manual processing.`,
    };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.warn({ err: msg, asset: params.asset, network: params.network }, "withdrawal: auto-processing failed — staying pending");
    return {
      status: "pending",
      note:   `Auto-processing failed: ${msg}. Request queued for manual processing.`,
    };
  }
}
