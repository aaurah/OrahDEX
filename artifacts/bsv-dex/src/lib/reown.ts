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
let _initPromise: Promise<void> | null = null;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchProjectId(): Promise<string> {
  // 1. Check env var (set at build time or via Replit secrets tab)
  const envId = import.meta.env.VITE_REOWN_PROJECT_ID;
  if (envId && envId !== "YOUR_REOWN_PROJECT_ID_HERE") return envId;

  // 2. Fetch from admin-configured DB setting (runtime — no rebuild needed)
  try {
    const res = await fetch(`${BASE}/api/settings/public`);
    if (res.ok) {
      const data = await res.json();
      if (data?.reown_project_id) return data.reown_project_id;
    }
  } catch {
    // Silently fall through
  }
  return "";
}

export async function initReownAppKit(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const projectId = await fetchProjectId();
    if (!projectId) {
      console.warn(
        "[OrahDEX] Reown Project ID not configured. " +
        "Set it in Admin → Integrations or add VITE_REOWN_PROJECT_ID to your env secrets."
      );
      return;
    }

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
  })();

  return _initPromise;
}

export function openReownModal(view?: "Connect" | "Account" | "Networks") {
  if (!_modal) {
    console.warn("[OrahDEX] Reown modal not ready — Project ID may not be configured.");
    return false;
  }
  _modal.open(view ? { view } : undefined);
  return true;
}

export function getReownModal() { return _modal; }
export function getWagmiAdapter() { return _adapter; }
export function isReownReady() { return _initialized && !!_modal; }
