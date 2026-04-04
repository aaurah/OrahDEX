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
        "--w3m-z-index": 9999,
      },
    });

    _initialized = true;
    suppressThirdPartyBranding();
  } catch (err) {
    console.error("[OrahDEX] Failed to initialize Reown AppKit:", err);
  }
}

/**
 * Inject a <style> into the AppKit modal's shadow DOM to hide third-party
 * branding elements ("UX by reown", footer links, etc.).
 * Uses MutationObserver because the modal element is added dynamically.
 */
function suppressThirdPartyBranding(): void {
  const STYLE_ID = "orahdex-no-brand";
  const HIDE_CSS = `
    wui-footer, w3m-legal-footer, wcm-footer { display: none !important; }
    [data-testid="w3m-footer"] { display: none !important; }
  `;

  function injectIntoShadow(root: ShadowRoot) {
    if (root.querySelector(`#${STYLE_ID}`)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = HIDE_CSS;
    root.appendChild(s);
    // Recurse into nested custom elements inside the shadow root
    root.querySelectorAll("*").forEach(el => {
      if ((el as Element & { shadowRoot?: ShadowRoot }).shadowRoot) {
        injectIntoShadow((el as Element & { shadowRoot: ShadowRoot }).shadowRoot);
      }
    });
  }

  const observer = new MutationObserver(() => {
    const modal = document.querySelector("w3m-modal");
    if (modal?.shadowRoot) injectIntoShadow(modal.shadowRoot);
  });

  observer.observe(document.body, { childList: true, subtree: true });
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
  1:          "https://ethereum.publicnode.com",
  56:         "https://bsc-dataseed.binance.org",
  137:        "https://polygon-rpc.com",
  42161:      "https://arb1.arbitrum.io/rpc",
  10:         "https://mainnet.optimism.io",
  8453:       "https://mainnet.base.org",
  59144:      "https://rpc.linea.build",
  324:        "https://mainnet.era.zksync.io",
  534352:     "https://rpc.scroll.io",
  5000:       "https://rpc.mantle.xyz",
  43114:      "https://api.avax.network/ext/bc/C/rpc",
  250:        "https://rpc.ftm.tools",
  25:         "https://evm.cronos.org",
  // ── Additional chains ─────────────────────────────────────────────
  100:        "https://rpc.gnosischain.com",
  42220:      "https://forno.celo.org",
  1284:       "https://rpc.api.moonbeam.network",
  146:        "https://rpc.soniclabs.com",
  81457:      "https://rpc.blast.io",
  34443:      "https://mainnet.mode.network",
  288:        "https://mainnet.boba.network",
  1088:       "https://andromeda.metis.io/?owner=1088",
  167000:     "https://rpc.mainnet.taiko.xyz",
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

/**
 * Switch chain for Reown/WalletConnect connections.
 * Uses AppKit's switchNetwork which routes the request through the
 * WalletConnect session rather than window.ethereum.
 * Returns true on success, false if the chain isn't in the Reown config.
 */
export async function switchReownChain(chainId: number): Promise<boolean> {
  if (!_modal) return false;
  const network = REOWN_NETWORKS.find(n => n.id === chainId);
  if (!network) return false;
  try {
    await (_modal as any).switchNetwork(network);
    return true;
  } catch (err) {
    // Re-throw so caller can distinguish user rejection (code 4001) from other errors
    throw err;
  }
}

/**
 * Track whether the user intentionally disconnected to prevent auto-reconnect.
 * The flag clears itself after 3 seconds as a safety net.
 */
let _userDisconnecting = false;
let _disconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function setUserDisconnecting(val: boolean): void {
  _userDisconnecting = val;
  if (_disconnectTimer) clearTimeout(_disconnectTimer);
  if (val) {
    _disconnectTimer = setTimeout(() => { _userDisconnecting = false; }, 3000);
  }
}

export function isUserDisconnecting(): boolean {
  return _userDisconnecting;
}

/**
 * Sign a message directly via the Reown/WalletConnect EIP-1193 provider.
 * This is the authoritative signing path for Reown connections — it goes
 * through the live WalletConnect session rather than wagmi's connector state,
 * so it works even when useAccount().isConnected is stale.
 * Returns null if the provider is unavailable (e.g. no active session).
 */
export async function signMessageWithReownProvider(
  message: string,
  address: string,
): Promise<string | null> {
  if (!_adapter?.wagmiConfig) return null;
  // Hex-encode the message (EIP-191 personal_sign expects 0x-prefixed hex)
  const hexMsg =
    "0x" +
    Array.from(new TextEncoder().encode(message))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  for (const connector of _adapter.wagmiConfig.connectors) {
    try {
      const provider = await (connector as any).getProvider?.();
      if (!provider) continue;
      const sig = await (provider as any).request({
        method: "personal_sign",
        params: [hexMsg, address],
      });
      if (sig) return sig as string;
    } catch {
      // This connector isn't active; try next
    }
  }
  return null;
}

/**
 * Fully disconnect from the Reown session — kills the WalletConnect/AppKit
 * session so re-opening the modal shows the wallet picker from scratch.
 */
export async function disconnectReown(): Promise<void> {
  if (!_modal) return;
  setUserDisconnecting(true);
  try {
    await (_modal as any).disconnect?.();
  } catch (err) {
    console.warn("[OrahDEX] Reown disconnect:", err);
  }
}

/* ── ERC-20 ABI helpers (minimal selectors) ──────────────────────────────── */
const ERC20_BALANCE_OF = "0x70a08231"; // balanceOf(address)
const ERC20_ALLOWANCE  = "0xdd62ed3e"; // allowance(owner, spender)
const ERC20_APPROVE    = "0x095ea7b3"; // approve(spender, uint256)

function padAddress(addr: string): string {
  return addr.replace("0x", "").padStart(64, "0");
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

async function ethCall(rpc: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch ERC-20 token balance for an address.
 * Returns the human-readable amount as a string, or null on failure.
 */
export async function fetchErc20Balance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
  decimals = 18,
): Promise<string | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return null;
  const data = ERC20_BALANCE_OF + padAddress(ownerAddress);
  const result = await ethCall(rpc, tokenAddress, data);
  if (!result) return null;
  const raw = hexToBigInt(result);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac  = raw % divisor;
  return `${whole}.${frac.toString().padStart(decimals, "0").slice(0, 6)}`;
}

/**
 * Check how many tokens `spender` is allowed to spend from `owner`.
 * Returns the allowance as a bigint (in token's smallest unit).
 */
export async function checkAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number,
): Promise<bigint> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return 0n;
  const data = ERC20_ALLOWANCE + padAddress(ownerAddress) + padAddress(spenderAddress);
  const result = await ethCall(rpc, tokenAddress, data);
  return result ? hexToBigInt(result) : 0n;
}

/**
 * Submit an ERC-20 `approve(spender, amount)` transaction via the injected wallet.
 * Returns the tx hash, or null if the user rejects / no wallet is available.
 */
export async function approveToken(
  tokenAddress: string,
  spenderAddress: string,
  amountHex: string,         // uint256 in hex, e.g. "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  fromAddress: string,
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const paddedSpender = padAddress(spenderAddress);
    const paddedAmount  = amountHex.replace("0x", "").padStart(64, "0");
    const data = ERC20_APPROVE + paddedSpender + paddedAmount;
    const txHash: string = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: tokenAddress, data }],
    });
    return txHash ?? null;
  } catch {
    return null;
  }
}

/* ── TX Receipt Polling ──────────────────────────────────────────────────── */

export interface TxReceipt {
  status: "0x1" | "0x0";
  blockNumber: string;
  transactionHash: string;
  logs: unknown[];
}

/**
 * Poll for a transaction receipt using public RPC.
 * Calls `onReceipt` once the tx is mined, or `onTimeout` after maxAttempts.
 * Returns a cleanup function to cancel polling.
 */
export function pollTxReceipt(
  txHash: string,
  chainId: number,
  opts: {
    intervalMs?: number;
    maxAttempts?: number;
    onReceipt: (receipt: TxReceipt) => void;
    onTimeout?: () => void;
  }
): () => void {
  const rpc = CHAIN_RPC_URLS[chainId];
  const intervalMs  = opts.intervalMs  ?? 4000;
  const maxAttempts = opts.maxAttempts ?? 75;   // ~5 min at 4s
  let attempt = 0;
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    attempt++;
    if (attempt > maxAttempts) {
      opts.onTimeout?.();
      return;
    }

    try {
      if (rpc) {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.result) {
            opts.onReceipt(json.result as TxReceipt);
            return;
          }
        }
      } else {
        // Fallback: try injected provider
        const eth = (window as any).ethereum;
        if (eth) {
          const receipt = await eth.request({
            method: "eth_getTransactionReceipt",
            params: [txHash],
          });
          if (receipt) {
            opts.onReceipt(receipt as TxReceipt);
            return;
          }
        }
      }
    } catch {
      /* swallow and retry */
    }

    if (!cancelled) setTimeout(poll, intervalMs);
  };

  setTimeout(poll, intervalMs);
  return () => { cancelled = true; };
}

/**
 * Get the current block number via public RPC.
 */
export async function getBlockNumber(chainId: number): Promise<number | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return null;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    const json = await res.json();
    return json?.result ? parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}
