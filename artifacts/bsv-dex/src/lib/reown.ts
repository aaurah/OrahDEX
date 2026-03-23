import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  type AppKitNetwork,
} from "@reown/appkit/networks";

export const REOWN_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
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
        description: "Trade means DEX — Multi-chain BSV DEX",
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
        "--w3m-accent": "#8B5CF6",
        "--w3m-border-radius-master": "12px",
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
 * Fetch native token balance for an EVM address.
 * Returns formatted string "0.1234" or null on failure.
 */
export async function fetchEvmBalance(address: string): Promise<string | null> {
  try {
    const eth = (window as any).ethereum;
    if (!eth) return null;
    const hex: string = await eth.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
    const wei = BigInt(hex);
    const native = Number(wei) / 1e18;
    return native.toFixed(4);
  } catch {
    return null;
  }
}

export function getWagmiConfig() {
  return _adapter?.wagmiConfig ?? null;
}

export function getReownModal() { return _modal; }
export function getWagmiAdapter() { return _adapter; }
export function isReownReady() { return _initialized && !!_modal; }
