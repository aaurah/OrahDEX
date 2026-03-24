import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, mantle, fantom, cronos,
  type AppKitNetwork,
} from "@reown/appkit/networks";

export const REOWN_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, mantle, fantom, cronos,
];

let _modal: ReturnType<typeof createAppKit> | null = null;
let _adapter: WagmiAdapter | null = null;
let _initialized = false;

export function setupReown(projectId: string): void {
  if (_initialized || !projectId) return;

  try {
    _adapter = new WagmiAdapter({ networks: REOWN_NETWORKS, projectId });

    _modal = createAppKit({
      adapters: [_adapter],
      networks: REOWN_NETWORKS,
      projectId,
      metadata: {
        name: "OrahDEX",
        description: "Trade means DEX — Multi-chain BSV DEX with instant on-chain settlement",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
      features: {
        analytics: false,
        email: false,
        socials: [],
        onramp: true,
        swaps: false,
      },
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#4ade80",
        "--w3m-border-radius-master": "12px",
        "--w3m-font-family": "inherit",
        "--w3m-z-index": "9999",
      },
    });

    _initialized = true;
  } catch (err) {
    console.error("[OrahDEX] Failed to initialize Reown AppKit:", err);
  }
}

type ReownView =
  | "Connect" | "Account" | "Networks" | "OnRampProviders"
  | "Swap" | "AllWallets" | "WhatIsAWallet" | "WhatIsANetwork";

export function openReownModal(view?: ReownView): boolean {
  if (!_modal) {
    console.warn("[OrahDEX] Reown modal not ready — Project ID may not be configured.");
    return false;
  }
  _modal.open(view ? { view } : undefined);
  return true;
}

export function closeReownModal(): void {
  _modal?.close();
}

/**
 * Subscribe to Reown account state changes.
 * Fires immediately with current state, then on every change.
 * Returns an unsubscribe function.
 */
export function subscribeReownAccount(
  cb: (state: { address?: string; isConnected: boolean; caipAddress?: string }) => void
): () => void {
  if (!_modal) return () => {};
  try {
    return (_modal.subscribeAccount as any)(cb) ?? (() => {});
  } catch {
    return () => {};
  }
}

/**
 * Get the current Reown account state synchronously.
 */
export function getReownAccount(): { address?: string; isConnected: boolean } {
  if (!_modal) return { isConnected: false };
  try {
    return (_modal as any).getAccount?.() ?? { isConnected: false };
  } catch {
    return { isConnected: false };
  }
}

/* ── Public RPC endpoints for every supported chain ──────────────────────── */
export const CHAIN_RPC_URLS: Record<number, string> = {
  1:      "https://ethereum.publicnode.com",
  56:     "https://bsc-dataseed.binance.org",
  137:    "https://polygon-rpc.com",
  42161:  "https://arb1.arbitrum.io/rpc",
  10:     "https://mainnet.optimism.io",
  8453:   "https://mainnet.base.org",       // Base
  59144:  "https://rpc.linea.build",
  324:    "https://mainnet.era.zksync.io",
  534352: "https://rpc.scroll.io",
  5000:   "https://rpc.mantle.xyz",
  43114:  "https://api.avax.network/ext/bc/C/rpc",
  250:    "https://rpc.ftm.tools",
  25:     "https://evm.cronos.org",
};

/**
 * Fetch the native token balance for any EVM address on any chain.
 * Uses a public JSON-RPC endpoint — works regardless of whether
 * window.ethereum exists (covers MetaMask, WalletConnect/Reown, Coinbase, etc.)
 */
export async function fetchEvmBalance(
  address: string,
  chainId?: number | null
): Promise<string | null> {
  try {
    /* 1. Try injected wallet provider first (fast path, already on correct chain) */
    const eth = (window as any).ethereum;
    if (eth) {
      try {
        const hex: string = await eth.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        });
        const wei = BigInt(hex);
        const native = Number(wei) / 1e18;
        return native.toFixed(6);
      } catch {
        /* fall through to public RPC */
      }
    }

    /* 2. Fall back to public RPC (needed for WalletConnect / Reown) */
    const rpc = chainId ? CHAIN_RPC_URLS[chainId] : null;
    if (!rpc) return null;

    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.result) return null;
    const native = Number(BigInt(json.result)) / 1e18;
    return native.toFixed(6);
  } catch {
    return null;
  }
}

/**
 * Parse chainId from a CAIP-10 address string.
 * e.g. "eip155:8453:0xabc..." → 8453
 */
export function parseChainFromCaip(caipAddress?: string): number | null {
  if (!caipAddress) return null;
  const parts = caipAddress.split(":");
  if (parts.length < 2) return null;
  const n = parseInt(parts[1], 10);
  return isNaN(n) ? null : n;
}

export function getWagmiConfig() {
  return _adapter?.wagmiConfig ?? null;
}

export function getReownModal() { return _modal; }
export function getWagmiAdapter() { return _adapter; }
export function isReownReady() { return _initialized && !!_modal; }
