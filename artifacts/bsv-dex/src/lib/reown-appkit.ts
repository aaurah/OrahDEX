import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
} from "@reown/appkit/networks";

const projectId =
  (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) ||
  "04663615251cf13fb1b043d754e7a17f";

const networks = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
] as const;

export const wagmiAdapter = new WagmiAdapter({ projectId, networks });

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: "OrahDEX",
    description: "OrahDEX — Multi-chain Exchange",
    url: typeof window !== "undefined" ? window.location.origin : "https://orahdex.io",
    icons: ["/favicon.ico"],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    onramp: false,
    swaps: false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#4ade80",
    "--w3m-color-mix": "#0b0d12",
    "--w3m-color-mix-strength": 20,
    "--w3m-border-radius-master": "2px",
    "--w3m-font-family": "Inter, system-ui, sans-serif",
    "--w3m-z-index": 9999,
  } as any,
});

/** Prevents the account subscription from re-connecting after intentional disconnect. */
let _suppressNextConnect = false;

/** Injects CSS into AppKit's shadow DOM to hide Reown branding. */
function hideReownBranding(): void {
  if (typeof window === "undefined") return;
  const inject = () => {
    const modal = document.querySelector("w3m-modal");
    if (!modal?.shadowRoot) return;
    const id = "orah-hide-branding";
    if (modal.shadowRoot.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      w3m-footer, w3m-legal-footer { display: none !important; height: 0 !important; }
      .w3m-footer { display: none !important; }
    `;
    modal.shadowRoot.appendChild(style);
  };
  const observer = new MutationObserver(inject);
  observer.observe(document.body, { childList: true });
  // Also try immediately in case modal is already rendered
  inject();
}

if (typeof window !== "undefined") {
  hideReownBranding();
}

export function openReownModal(): void {
  _suppressNextConnect = false;
  try {
    appKit.open({ view: "Connect" });
  } catch (e) {
    console.error("[OrahDEX] Failed to open Reown modal:", e);
  }
}

export function disconnectReown(): void {
  _suppressNextConnect = true;
  try {
    appKit.disconnect();
  } catch { /* */ }
}

export function subscribeReownAccount(
  cb: (address: string | null, chainId: number) => void
): () => void {
  try {
    return appKit.subscribeAccount((acc: any) => {
      if (acc?.isConnected && acc?.address) {
        if (_suppressNextConnect) return;
        cb(acc.address as string, typeof acc.chainId === "number" ? acc.chainId : 1);
      } else {
        _suppressNextConnect = false;
        cb(null, 1);
      }
    });
  } catch {
    return () => {};
  }
}
