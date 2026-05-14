/**
 * orahVault.ts — OrahDEX
 *
 * Client for the OrahVault smart contract.
 *
 * OrahVault interface:
 *   function deposit(address token, uint256 amount) external
 *   function withdraw(address token, address to, uint256 amount) external onlyOwner
 *
 * Config (env vars):
 *   VAULT_CONTRACT_ADDRESS  — deployed OrahVault address (enables vault mode)
 *   VAULT_CHAIN_ID          — chain the vault is deployed on (default: 8453 = Base)
 *   VAULT_OWNER_KEY         — 0x-hex private key of the vault owner
 *                             (falls back to EXCHANGE_HOT_WALLET_KEY if absent)
 *
 * When VAULT_CONTRACT_ADDRESS is not set, isVaultConfigured() returns false
 * and callers fall back to hot-wallet direct transfer.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getOrCreateEvmHotWallet } from "./exchangeHotWallet.js";
import { logger } from "./logger.js";

// ── Vault ABI (only the functions we call) ─────────────────────────────────────

export const VAULT_ABI = parseAbi([
  "function withdraw(address token, address to, uint256 amount) external",
  "function deposit(address token, uint256 amount) external",
  "event Withdrawn(address indexed user, address indexed token, uint256 amount, address to)",
  "event Deposited(address indexed user, address indexed token, uint256 amount)",
]);

// ── ERC-20 token registry (symbol → per-chainId contract address + decimals) ──
// Extend this table as you deploy on more chains.

interface TokenInfo { address: Address; decimals: number }

const TOKEN_REGISTRY: Record<string, Record<number, TokenInfo>> = {
  USDT: {
    1:       { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6  },
    56:      { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    137:     { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6  },
    8453:    { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6  }, // Base
    42161:   { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6  }, // Arbitrum
    10:      { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6  }, // Optimism
  },
  USDC: {
    1:       { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6  },
    56:      { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    137:     { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6  },
    8453:    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6  }, // Base USDC
    42161:   { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6  }, // Arbitrum native USDC
    10:      { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6  }, // Optimism native USDC
    324:     { address: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4", decimals: 6  }, // zkSync
  },
  DAI: {
    1:       { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    56:      { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
    137:     { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
    8453:    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 }, // Base DAI
    42161:   { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 }, // Arbitrum DAI
    10:      { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 }, // Optimism DAI
  },
  LINK: {
    1:       { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    8453:    { address: "0xd403D1624DAEF243FBb98CC7bdE7601A8e01b1D4", decimals: 18 }, // Base LINK (Bridged)
    42161:   { address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18 }, // Arbitrum LINK
  },
  AAVE: {
    1:       { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
  },
  UNI: {
    1:       { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
    42161:   { address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", decimals: 18 },
  },
};

// ── Chain RPC registry ─────────────────────────────────────────────────────────

const CHAIN_RPC: Record<number, { name: string; rpcUrl: string; explorer: string }> = {
  1:      { name: "Ethereum",   rpcUrl: process.env.ETH_RPC_URL    ?? "https://eth.llamarpc.com",             explorer: "https://etherscan.io"              },
  56:     { name: "BNB Chain",  rpcUrl: process.env.BSC_RPC_URL    ?? "https://bsc-dataseed.binance.org",     explorer: "https://bscscan.com"               },
  137:    { name: "Polygon",    rpcUrl: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",             explorer: "https://polygonscan.com"           },
  8453:   { name: "Base",       rpcUrl: process.env.BASE_RPC_URL   ?? "https://mainnet.base.org",             explorer: "https://basescan.org"              },
  42161:  { name: "Arbitrum",   rpcUrl: process.env.ARB_RPC_URL    ?? "https://arb1.arbitrum.io/rpc",         explorer: "https://arbiscan.io"               },
  10:     { name: "Optimism",   rpcUrl: process.env.OP_RPC_URL     ?? "https://mainnet.optimism.io",          explorer: "https://optimistic.etherscan.io"   },
  324:    { name: "zkSync Era", rpcUrl: process.env.ZKSYNC_RPC_URL ?? "https://mainnet.era.zksync.io",        explorer: "https://explorer.zksync.io"        },
  59144:  { name: "Linea",      rpcUrl: process.env.LINEA_RPC_URL  ?? "https://rpc.linea.build",              explorer: "https://lineascan.build"           },
  534352: { name: "Scroll",     rpcUrl: process.env.SCROLL_RPC_URL ?? "https://rpc.scroll.io",               explorer: "https://scrollscan.com"            },
};

// ── Public helpers ─────────────────────────────────────────────────────────────

/** Returns true when VAULT_CONTRACT_ADDRESS is set — vault mode is active */
export function isVaultConfigured(): boolean {
  return !!process.env.VAULT_CONTRACT_ADDRESS;
}

export function getVaultAddress(): Address | null {
  return (process.env.VAULT_CONTRACT_ADDRESS ?? null) as Address | null;
}

export function getVaultChainId(): number {
  return parseInt(process.env.VAULT_CHAIN_ID ?? "8453", 10);
}

/** Resolve the token address + decimals for a given asset on the vault's chain */
export function resolveTokenInfo(asset: string, chainId: number): TokenInfo | null {
  return TOKEN_REGISTRY[asset.toUpperCase()]?.[chainId] ?? null;
}

// ── Core: call vault.withdraw(token, to, amount) ───────────────────────────────

export interface VaultWithdrawResult {
  txHash:   string;
  explorer: string;
  vault:    string;
  asset:    string;
  amount:   number;
  to:       string;
  chainId:  number;
}

/**
 * Calls OrahVault.withdraw(token, to, amount) on-chain.
 *
 * For native ETH withdrawals (asset === "ETH" or the chain's native token),
 * the vault contract cannot be used since it only handles ERC-20.
 * In that case, this function throws so the caller can fall back to
 * the hot-wallet direct transfer.
 */
export async function vaultWithdraw(params: {
  asset:     string;
  amount:    number;   // in human-readable units (e.g. 1.5 USDC)
  recipient: string;   // destination wallet address
  chainId?:  number;   // override — defaults to VAULT_CHAIN_ID env var
}): Promise<VaultWithdrawResult> {
  const vaultAddress = getVaultAddress();
  if (!vaultAddress) throw new Error("VAULT_CONTRACT_ADDRESS is not set");

  const chainId  = params.chainId ?? getVaultChainId();
  const chainCfg = CHAIN_RPC[chainId];
  if (!chainCfg) throw new Error(`No RPC config for chainId ${chainId}`);

  const assetUp = params.asset.toUpperCase();

  // Native tokens cannot go through the ERC-20 vault — caller must handle separately
  const NATIVE_SYMBOLS = ["ETH", "BNB", "MATIC", "AVAX", "FTM"];
  if (NATIVE_SYMBOLS.includes(assetUp)) {
    throw new Error(`${assetUp} is a native token — use direct hot-wallet transfer instead of vault`);
  }

  const tokenInfo = resolveTokenInfo(assetUp, chainId);
  if (!tokenInfo) {
    throw new Error(`No token address known for ${assetUp} on chainId ${chainId}. Add it to TOKEN_REGISTRY in orahVault.ts.`);
  }

  // Get owner key: VAULT_OWNER_KEY env var, then fall back to hot wallet
  let ownerPrivKey: `0x${string}`;
  const envVaultKey = process.env.VAULT_OWNER_KEY;
  if (envVaultKey && envVaultKey.length >= 64) {
    ownerPrivKey = (envVaultKey.startsWith("0x") ? envVaultKey : `0x${envVaultKey}`) as `0x${string}`;
  } else {
    const hotWallet = await getOrCreateEvmHotWallet();
    ownerPrivKey    = hotWallet.privKeyHex;
    logger.warn("VAULT_OWNER_KEY not set — using EXCHANGE_HOT_WALLET_KEY as vault owner. Ensure this matches the vault deployer address.");
  }

  const account = privateKeyToAccount(ownerPrivKey);

  const viemChain = {
    id:   chainId,
    name: chainCfg.name,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chainCfg.rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: viemChain, transport: http(chainCfg.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chainCfg.rpcUrl) });

  // Convert human amount → token smallest unit
  const rawAmount = BigInt(Math.round(params.amount * 10 ** tokenInfo.decimals));

  logger.info({
    vault:   vaultAddress,
    token:   tokenInfo.address,
    to:      params.recipient,
    amount:  params.amount,
    rawAmount: rawAmount.toString(),
    asset:   assetUp,
    chainId,
    caller:  account.address,
  }, "vault.withdraw: submitting transaction");

  const txHash = await walletClient.writeContract({
    address:      vaultAddress,
    abi:          VAULT_ABI,
    functionName: "withdraw",
    args:         [tokenInfo.address, params.recipient as Address, rawAmount],
  });

  // Wait for confirmation (non-blocking on timeout)
  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => {
    logger.warn({ txHash }, "vault.withdraw: receipt polling timed out — tx is broadcast");
  });

  const explorer = `${chainCfg.explorer}/tx/${txHash}`;

  logger.info({ txHash, explorer, asset: assetUp, amount: params.amount, to: params.recipient, chainId }, "vault.withdraw: confirmed");

  return {
    txHash,
    explorer,
    vault:   vaultAddress,
    asset:   assetUp,
    amount:  params.amount,
    to:      params.recipient,
    chainId,
  };
}
