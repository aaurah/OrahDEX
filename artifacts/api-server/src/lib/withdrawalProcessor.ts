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
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getOrCreateWallet, fetchWalletBalance, buildAndBroadcastBsvTx } from "./bsvWallet.js";
import { getOrCreateEvmHotWallet } from "./exchangeHotWallet.js";
import { isVaultConfigured, vaultWithdraw } from "./orahVault.js";
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
  ETH:    { id: 1,       name: "Ethereum",   rpcUrl: process.env.ETH_RPC_URL      ?? "https://ethereum.publicnode.com",            explorer: "https://etherscan.io",              nativeToken: "ETH"  },
  BNB:    { id: 56,      name: "BNB Chain",  rpcUrl: process.env.BSC_RPC_URL      ?? "https://bsc.publicnode.com",                 explorer: "https://bscscan.com",               nativeToken: "BNB"  },
  MATIC:  { id: 137,     name: "Polygon",    rpcUrl: process.env.POLYGON_RPC_URL  ?? "https://polygon.publicnode.com",             explorer: "https://polygonscan.com",           nativeToken: "MATIC"},
  AVAX:   { id: 43114,   name: "Avalanche",  rpcUrl: process.env.AVAX_RPC_URL     ?? "https://avalanche-c-chain.publicnode.com",   explorer: "https://snowtrace.io",              nativeToken: "AVAX" },
  FTM:    { id: 250,     name: "Fantom",     rpcUrl: process.env.FTM_RPC_URL      ?? "https://rpcapi.fantom.network",              explorer: "https://ftmscan.com",               nativeToken: "FTM"  },
  BASE:   { id: 8453,    name: "Base",       rpcUrl: process.env.BASE_RPC_URL     ?? "https://base.publicnode.com",                explorer: "https://basescan.org",              nativeToken: "ETH"  },
  ARB:    { id: 42161,   name: "Arbitrum",   rpcUrl: process.env.ARB_RPC_URL      ?? "https://arbitrum-one.publicnode.com",        explorer: "https://arbiscan.io",               nativeToken: "ETH"  },
  OP:     { id: 10,      name: "Optimism",   rpcUrl: process.env.OP_RPC_URL       ?? "https://optimism.publicnode.com",            explorer: "https://optimistic.etherscan.io",   nativeToken: "ETH"  },
  ZKSYNC: { id: 324,     name: "zkSync Era", rpcUrl: process.env.ZKSYNC_RPC_URL   ?? "https://mainnet.era.zksync.io",              explorer: "https://explorer.zksync.io",        nativeToken: "ETH"  },
  LINEA:  { id: 59144,   name: "Linea",      rpcUrl: process.env.LINEA_RPC_URL    ?? "https://linea.publicnode.com",               explorer: "https://lineascan.build",           nativeToken: "ETH"  },
  SCROLL: { id: 534352,  name: "Scroll",     rpcUrl: process.env.SCROLL_RPC_URL   ?? "https://rpc.scroll.io",                      explorer: "https://scrollscan.com",            nativeToken: "ETH"  },
  BLAST:  { id: 81457,   name: "Blast",      rpcUrl: process.env.BLAST_RPC_URL    ?? "https://rpc.blast.io",                       explorer: "https://blastscan.io",              nativeToken: "ETH"  },
  MODE:   { id: 34443,   name: "Mode",       rpcUrl: process.env.MODE_RPC_URL     ?? "https://mainnet.mode.network",               explorer: "https://modescan.io",               nativeToken: "ETH"  },
  TAIKO:  { id: 167000,  name: "Taiko",      rpcUrl: process.env.TAIKO_RPC_URL    ?? "https://rpc.mainnet.taiko.xyz",              explorer: "https://taikoscan.io",              nativeToken: "ETH"  },
  // ── Testnets (use by setting EVM_USE_TESTNET=1, or routing via network='sepolia') ──
  SEPOLIA:    { id: 11155111, name: "Sepolia",      rpcUrl: process.env.SEPOLIA_RPC_URL     ?? "https://ethereum-sepolia.publicnode.com", explorer: "https://sepolia.etherscan.io",     nativeToken: "ETH" },
  BASE_SEP:   { id: 84532,    name: "Base Sepolia", rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? "https://base-sepolia.publicnode.com",    explorer: "https://sepolia.basescan.org",     nativeToken: "ETH" },
  ARB_SEP:    { id: 421614,   name: "Arbitrum Sepolia", rpcUrl: process.env.ARB_SEPOLIA_RPC_URL ?? "https://arbitrum-sepolia.publicnode.com", explorer: "https://sepolia.arbiscan.io", nativeToken: "ETH" },
};

// When EVM_USE_TESTNET=1 the registry and chain map auto-route ETH-family
// withdrawals to their Sepolia equivalents. Lets the operator drain a testnet
// hot-wallet balance instead of mainnet for testing or when mainnet is unfunded.
export const EVM_USE_TESTNET = process.env.EVM_USE_TESTNET === "1" || process.env.EVM_USE_TESTNET === "true";
const TESTNET_REMAP: Record<number, number> = {
  1:    11155111,   // ETH mainnet → Sepolia
  8453: 84532,      // Base → Base Sepolia
  42161: 421614,    // Arbitrum → Arbitrum Sepolia
};

// Maps the l2.chainId keys used in the Bridge UI → EVM_REGISTRY keys
const BRIDGE_CHAIN_TO_REGISTRY: Record<string, string> = {
  eth:    "ETH",
  bnb:    "BNB",
  poly:   "MATIC",
  avax:   "AVAX",
  ftm:    "FTM",
  base:   "BASE",
  arb:    "ARB",
  op:     "OP",
  zksync: "ZKSYNC",
  linea:  "LINEA",
  scroll: "SCROLL",
  blast:  "BLAST",
  mode:   "MODE",
  taiko:  "TAIKO",
  sepolia:     "SEPOLIA",
  base_sep:    "BASE_SEP",
  basesepolia: "BASE_SEP",
  arb_sep:     "ARB_SEP",
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
  asset:      string;
  amount:     number;
  recipient:  string;
  chainIdOverride?: number;
}): Promise<{ txid: string; explorer: string }> {
  const baseChainId = params.chainIdOverride ?? assetToChainId(params.asset);
  const chainId     = EVM_USE_TESTNET && TESTNET_REMAP[baseChainId] ? TESTNET_REMAP[baseChainId] : baseChainId;
  const chain       = chainById(chainId);
  if (chainId !== baseChainId) {
    logger.info({ from: baseChainId, to: chainId, asset: params.asset }, "EVM_USE_TESTNET=1 → routing withdrawal to testnet");
  }
  if (!chain) throw new Error(`No EVM chain config for chainId ${chainId}`);

  const assetUp  = params.asset.toUpperCase();
  const isNative = chain.nativeToken === assetUp;

  // ── Vault path: ERC-20 tokens when VAULT_CONTRACT_ADDRESS is set ───────────
  if (!isNative && isVaultConfigured()) {
    try {
      const result = await vaultWithdraw({
        asset:     assetUp,
        amount:    params.amount,
        recipient: params.recipient,
        chainId,
      });
      logger.info({ txHash: result.txHash, vault: result.vault, asset: assetUp, chainId }, "EVM withdrawal via vault");
      return { txid: result.txHash, explorer: result.explorer };
    } catch (vaultErr: any) {
      // If vault throws because this token isn't in the vault registry, fall through to direct transfer
      logger.warn({ err: vaultErr?.message, asset: assetUp, chainId }, "vault.withdraw failed — falling back to direct ERC-20 transfer");
    }
  }

  // ── Hot-wallet direct path (native tokens + vault fallback) ───────────────
  const hotWallet = await getOrCreateEvmHotWallet();
  const account   = privateKeyToAccount(hotWallet.privKeyHex);

  const viemChain = {
    id:   chain.id,
    name: chain.name,
    nativeCurrency: { name: chain.nativeToken, symbol: chain.nativeToken, decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) });

  let txHash: `0x${string}`;

  if (isNative) {
    // ── Native token transfer (ETH, BNB, MATIC, AVAX, FTM) ──────────────────
    // Use parseUnits (string → BigInt) to avoid IEEE-754 precision loss on
    // large balances (> ~9007 ETH would overflow Number.MAX_SAFE_INTEGER).
    const weiAmount = parseUnits(params.amount.toFixed(18), 18);
    txHash = await walletClient.sendTransaction({
      to:    params.recipient as Address,
      value: weiAmount,
    });
  } else {
    // ── ERC-20 direct transfer (vault not configured or vault fallback) ───────
    const tokenInfo = ERC20_TOKENS[assetUp]?.[chainId];
    if (!tokenInfo) throw new Error(`No ERC-20 contract known for ${assetUp} on chainId ${chainId}`);

    // Use parseUnits to avoid precision loss for tokens with up to 18 decimals.
    const tokenAmount = parseUnits(params.amount.toFixed(tokenInfo.decimals), tokenInfo.decimals);

    txHash = await walletClient.writeContract({
      address:      tokenInfo.address,
      abi:          ERC20_ABI,
      functionName: "transfer",
      args:         [params.recipient as Address, tokenAmount],
    });
  }

  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => {
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
    // ── Legacy "evm" key — asset determines the chain ─────────────────────────
    if (net === "evm") {
      const { txid, explorer } = await processEvmWithdrawal(params);
      return { status: "completed", txid, explorer };
    }

    // ── Bridge-specific chain keys (base, arb, op, zksync, …) ────────────────
    const registryKey = BRIDGE_CHAIN_TO_REGISTRY[net];
    if (registryKey) {
      const chainCfg = EVM_REGISTRY[registryKey];
      if (!chainCfg) throw new Error(`No EVM registry config for key ${registryKey}`);
      const { txid, explorer } = await processEvmWithdrawal({ ...params, chainIdOverride: chainCfg.id });
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
