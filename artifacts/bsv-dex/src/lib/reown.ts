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
        onramp: false,
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

export function openReownModal(view?: "Connect" | "Account" | "Networks"): boolean {
  if (!_modal) {
    console.warn("[OrahDEX] Reown modal not ready — Project ID may not be configured.");
    return false;
  }
  _modal.open(view ? { view } : undefined);
  return true;
}

export function getWagmiConfig() {
  return _adapter?.wagmiConfig ?? null;
}

export function getReownModal() { return _modal; }
export function getWagmiAdapter() { return _adapter; }
export function isReownReady() { return _initialized && !!_modal; }
