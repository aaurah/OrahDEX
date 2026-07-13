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
    icons: typeof window !== "undefined"
      ? [`${window.location.origin}${import.meta.env.BASE_URL}icon-512.png`]
      : ["https://orahdex.io/icon-512.png"],
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
    "--w3m-color-mix-strength": 0,
    "--w3m-border-radius-master": "3px",
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
  inject();
}

if (typeof window !== "undefined") {
  hideReownBranding();
}

/**
 * Applies OrahDEX's exact theme colours directly to the AppKit CSS token variables.
 *
 * AppKit generates --apkt-tokens-theme-* on :root via a <style> element.
 * document.documentElement.style (inline) has higher CSS specificity than any
 * stylesheet :root rule, so our values always win — no color-mix maths needed.
 *
 * Token names come from ThemeConstantsUtil.js → tokens.dark / tokens.light.
 * Base hex values are computed from OrahDEX's CSS HSL variables in index.css:
 *   DARK    background hsl(216 20% 5%)   ≈ #0a0c0f
 *   AMOLED  background hsl(0 0% 0%)      = #000000
 *   LIGHT   background hsl(210 20% 98%)  ≈ #f9fafb
 */
function applyTokenOverrides(
  theme: "dark" | "light" | "amoled" | "system",
  effective: "dark" | "light",
): void {
  const r = document.documentElement;

  if (theme === "amoled") {
    // True-black AMOLED — matches html.amoled in index.css
    r.style.setProperty("--apkt-tokens-theme-backgroundPrimary",  "#000000");
    r.style.setProperty("--apkt-tokens-theme-backgroundInvert",   "#e8e8e8");
    r.style.setProperty("--apkt-tokens-theme-foregroundPrimary",  "#080808");
    r.style.setProperty("--apkt-tokens-theme-foregroundSecondary","#0d0d0d");
    r.style.setProperty("--apkt-tokens-theme-foregroundTertiary", "#141414");
    r.style.setProperty("--apkt-tokens-theme-borderPrimary",      "#1a1a1a");
    r.style.setProperty("--apkt-tokens-theme-borderPrimaryDark",  "#222222");
    r.style.setProperty("--apkt-tokens-theme-borderSecondary",    "#2a2a2a");
    r.style.setProperty("--apkt-tokens-theme-overlay",            "rgba(0,0,0,0.75)");
    r.style.setProperty("--apkt-tokens-theme-textPrimary",        "#e9f0f8");
    r.style.setProperty("--apkt-tokens-theme-textSecondary",      "#6b7c94");
    r.style.setProperty("--apkt-tokens-theme-textTertiary",       "#8a9db8");
    r.style.setProperty("--apkt-tokens-theme-textInvert",         "#000000");
    r.style.setProperty("--apkt-tokens-theme-iconDefault",        "#6b7c94");
    r.style.setProperty("--apkt-tokens-theme-iconInverse",        "#e9f0f8");
    r.style.setProperty("--apkt-tokens-core-backgroundAccentPrimary", "#4ade80");
    r.style.setProperty("--apkt-tokens-core-textAccentPrimary",       "#4ade80");
    r.style.setProperty("--apkt-tokens-core-iconAccentPrimary",       "#4ade80");
    r.style.setProperty("--apkt-tokens-core-borderAccentPrimary",     "#4ade80");
  } else if (effective === "light") {
    // Light theme — matches html.light in index.css
    // background hsl(210 20% 98%) ≈ #f9fafb, card #ffffff, border hsl(210 16% 86%) ≈ #d5dbe1
    r.style.setProperty("--apkt-tokens-theme-backgroundPrimary",  "#f9fafb");
    r.style.setProperty("--apkt-tokens-theme-backgroundInvert",   "#14191f");
    r.style.setProperty("--apkt-tokens-theme-foregroundPrimary",  "#edf1f6");
    r.style.setProperty("--apkt-tokens-theme-foregroundSecondary","#e5eaef");
    r.style.setProperty("--apkt-tokens-theme-foregroundTertiary", "#d5dbe1");
    r.style.setProperty("--apkt-tokens-theme-borderPrimary",      "#d5dbe1");
    r.style.setProperty("--apkt-tokens-theme-borderPrimaryDark",  "#c0ccd8");
    r.style.setProperty("--apkt-tokens-theme-borderSecondary",    "#aab8c6");
    r.style.setProperty("--apkt-tokens-theme-overlay",            "rgba(200,210,220,0.5)");
    r.style.setProperty("--apkt-tokens-theme-textPrimary",        "#14191f");
    r.style.setProperty("--apkt-tokens-theme-textSecondary",      "#566476");
    r.style.setProperty("--apkt-tokens-theme-textTertiary",       "#6f8399");
    r.style.setProperty("--apkt-tokens-theme-textInvert",         "#ffffff");
    r.style.setProperty("--apkt-tokens-theme-iconDefault",        "#566476");
    r.style.setProperty("--apkt-tokens-theme-iconInverse",        "#14191f");
    r.style.setProperty("--apkt-tokens-core-backgroundAccentPrimary", "#22a349");
    r.style.setProperty("--apkt-tokens-core-textAccentPrimary",       "#22a349");
    r.style.setProperty("--apkt-tokens-core-iconAccentPrimary",       "#22a349");
    r.style.setProperty("--apkt-tokens-core-borderAccentPrimary",     "#22a349");
  } else {
    // Dark (and system-dark) — matches :root in index.css
    // background hsl(216 20% 5%) ≈ #0a0c0f, card hsl(216 15% 9%) ≈ #14161b
    r.style.setProperty("--apkt-tokens-theme-backgroundPrimary",  "#0a0c0f");
    r.style.setProperty("--apkt-tokens-theme-backgroundInvert",   "#e0e8f0");
    r.style.setProperty("--apkt-tokens-theme-foregroundPrimary",  "#14161b");
    r.style.setProperty("--apkt-tokens-theme-foregroundSecondary","#1a1e23");
    r.style.setProperty("--apkt-tokens-theme-foregroundTertiary", "#23282f");
    r.style.setProperty("--apkt-tokens-theme-borderPrimary",      "#23282f");
    r.style.setProperty("--apkt-tokens-theme-borderPrimaryDark",  "#2a3040");
    r.style.setProperty("--apkt-tokens-theme-borderSecondary",    "#3a4254");
    r.style.setProperty("--apkt-tokens-theme-overlay",            "rgba(0,0,0,0.6)");
    r.style.setProperty("--apkt-tokens-theme-textPrimary",        "#dde4ed");
    r.style.setProperty("--apkt-tokens-theme-textSecondary",      "#7a899f");
    r.style.setProperty("--apkt-tokens-theme-textTertiary",       "#a0b0c8");
    r.style.setProperty("--apkt-tokens-theme-textInvert",         "#0a0c0f");
    r.style.setProperty("--apkt-tokens-theme-iconDefault",        "#7a899f");
    r.style.setProperty("--apkt-tokens-theme-iconInverse",        "#dde4ed");
    r.style.setProperty("--apkt-tokens-core-backgroundAccentPrimary", "#4ade80");
    r.style.setProperty("--apkt-tokens-core-textAccentPrimary",       "#4ade80");
    r.style.setProperty("--apkt-tokens-core-iconAccentPrimary",       "#4ade80");
    r.style.setProperty("--apkt-tokens-core-borderAccentPrimary",     "#4ade80");
  }
}

/**
 * Syncs AppKit's modal theme to match the active OrahDEX theme.
 * Call whenever the OrahDEX theme changes (dark / amoled / light / system).
 */
export function syncReownTheme(theme: "dark" | "light" | "amoled" | "system"): void {
  if (typeof window === "undefined") return;

  const effective: "dark" | "light" =
    theme === "light" ? "light"
    : theme === "system"
      ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : "dark";

  try {
    appKit.setThemeMode(effective);
    (appKit as any).setThemeVariables({
      "--w3m-accent":               effective === "light" ? "#22a349" : "#4ade80",
      "--w3m-color-mix-strength":   0,
      "--w3m-border-radius-master": "3px",
      "--w3m-font-family":          "Inter, system-ui, sans-serif",
      "--w3m-z-index":              9999,
    });
  } catch { /* AppKit not ready */ }

  // Apply immediately, then again after AppKit's async style flush
  applyTokenOverrides(theme, effective);
  setTimeout(() => applyTokenOverrides(theme, effective), 80);
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

/**
 * Returns the wagmi config managed by the AppKit WagmiAdapter.
 * This is the config that tracks the active WalletConnect / Reown session
 * and is DIFFERENT from the minimal wagmiConfig exported by reown.ts.
 */
export function getAppKitWagmiConfig() {
  return wagmiAdapter.wagmiConfig;
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
