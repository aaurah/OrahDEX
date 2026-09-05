import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
  solana, solanaTestnet, solanaDevnet,
  bitcoin, bitcoinTestnet,
} from "@reown/appkit/networks";
import { useThemeStore } from "../store/useThemeStore";

const projectId =
  (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) ||
  "04663615251cf13fb1b043d754e7a17f";

const networks = [
  // EVM
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
  // Solana
  solana, solanaTestnet, solanaDevnet,
  // Bitcoin
  bitcoin, bitcoinTestnet,
] as const;

/**
 * localStorage key that persists the user's last chosen EVM chainId across sessions.
 * Read at module-load time so AppKit starts on the correct network instead of always
 * defaulting to mainnet, which would cause `subscribeAccount` to fire with chainId=1
 * and overwrite the user's Sepolia (or other testnet) selection on every refresh.
 */
const REOWN_CHAIN_KEY = "orah-reown-chain";

function readStoredChainId(): number {
  try { return parseInt(localStorage.getItem(REOWN_CHAIN_KEY) ?? "", 10) || 1; }
  catch { return 1; }
}

/** Persist the user's chosen EVM chainId so it survives page refresh. */
export function saveReownChain(chainId: number): void {
  try { localStorage.setItem(REOWN_CHAIN_KEY, String(chainId)); } catch {}
}

/** Read the stored OrahDEX theme so AppKit can open with the right themeMode. */
function readStoredOrahTheme(): "dark" | "light" | "amoled" | "system" {
  try {
    const raw = localStorage.getItem("aura-dex-theme");
    if (!raw) return "dark";
    const { state } = JSON.parse(raw);
    const t = state?.theme;
    if (t === "light" || t === "amoled" || t === "system") return t as "light" | "amoled" | "system";
    return "dark";
  } catch { return "dark"; }
}

const storedChainId = readStoredChainId();
const initialNetwork =
  (networks as readonly (typeof mainnet)[]).find((n) => n.id === storedChainId)
  ?? mainnet;

const _storedTheme = readStoredOrahTheme();
const _initialThemeMode: "dark" | "light" = _storedTheme === "light" ? "light" : "dark";

const evmNetworks = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
] as const;

export const wagmiAdapter  = new WagmiAdapter({ projectId, networks: evmNetworks });
export const solanaAdapter  = new SolanaAdapter();
export const bitcoinAdapter = new BitcoinAdapter();

const appKit = createAppKit({
  adapters: [wagmiAdapter, solanaAdapter, bitcoinAdapter],
  projectId,
  networks,
  defaultNetwork: initialNetwork,
  metadata: {
    name: "OrahDEX",
    description: "OrahDEX — Multi-chain Exchange",
    url: typeof window !== "undefined" ? window.location.origin : "https://orahdex.io",
    icons: typeof window !== "undefined"
      ? [`${window.location.origin}${import.meta.env.BASE_URL}icon-512.png`]
      : ["https://orahdex.io/icon-512.png"],
  },
  features: {
    analytics:     false,
    email:         false,   // native social login handled in WalletChooserDialog
    socials:       false,   // native social login handled in WalletChooserDialog
    onramp:        true,
    swaps:         true,
    smartAccounts: true,
  },
  enableWallets: true,
  themeMode: _initialThemeMode,
  themeVariables: {
    "--w3m-accent":               _storedTheme === "light" ? "#1fb757" : "#4ade80",
    "--w3m-color-mix-strength":   0,
    "--w3m-border-radius-master": "3px",
    "--w3m-font-family":          "Inter, system-ui, sans-serif",
    "--w3m-z-index":              9999,
  } as any,
});

/** Prevents the account subscription from re-connecting after intentional disconnect. */
let _suppressNextConnect = false;

/** Injects CSS into AppKit's shadow DOM to hide Reown branding. */
function hideReownBranding(): void {
  if (typeof window === "undefined") return;
  // The "UX by reown" badge (<wui-ux-by-reown>) is rendered inside NESTED
  // shadow roots (w3m-connect-view, w3m-connecting-wc-view, w3m-legal-footer,
  // w3m-connecting-wc-qrcode), so a single style tag in the modal's shadow
  // root can't reach it. Walk every shadow root under the modal and inject
  // the rule into each one. Views swap inside shadow DOM without touching
  // the light DOM, so we also re-walk on an interval while the modal exists.
  const CSS = `
    wui-ux-by-reown, w3m-legal-footer, w3m-footer, .w3m-footer {
      display: none !important; height: 0 !important;
    }
  `;
  const seen = new WeakSet<ShadowRoot>();
  const walk = (root: ShadowRoot) => {
    if (!seen.has(root)) {
      seen.add(root);
      const style = document.createElement("style");
      style.textContent = CSS;
      root.appendChild(style);
    }
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  const inject = () => {
    const modal = document.querySelector("w3m-modal");
    if (modal?.shadowRoot) walk(modal.shadowRoot);
  };
  const observer = new MutationObserver(inject);
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => {
    if (document.querySelector("w3m-modal")) inject();
  }, 1200);
  inject();
}

if (typeof window !== "undefined") {
  hideReownBranding();
}
