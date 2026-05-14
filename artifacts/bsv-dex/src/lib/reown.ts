import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, mantle, fantom, cronos,
  type AppKitNetwork,
} from "@reown/appkit/networks";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "";

const sepolia: AppKitNetwork = {
  id:             11155111,
  name:           "Sepolia",
  caipNetworkId:  "eip155:11155111",
  chainNamespace: "eip155",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls:        { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  testnet:        true,
};

export const REOWN_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, mantle, fantom, cronos, sepolia,
];

export const wagmiAdapter = new WagmiAdapter({
  networks: REOWN_NETWORKS,
  projectId,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: REOWN_NETWORKS,
  projectId,
  metadata: {
    name: "OrahDEX",
    description: "Trade means DEX — Multi-chain BSV DEX with instant on-chain settlement",
    url: typeof window !== "undefined" ? window.location.origin : "https://orahdex.org",
    icons: [
      typeof window !== "undefined"
        ? `${window.location.origin}/favicon.svg`
        : "https://orahdex.org/favicon.svg",
    ],
  },
  features: {
    analytics: false,
    email:     false,
    socials:   [],
    onramp:    true,
    swaps:     false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent":               "#4ade80",
    "--w3m-border-radius-master": "12px",
    "--w3m-font-family":          "inherit",
    "--w3m-z-index":              9999,
  },
});

suppressThirdPartyBranding();

function suppressThirdPartyBranding(): void {
  const STYLE_ID = "orahdex-no-brand";
  const HIDE_CSS = `
    wui-ux-by-reown,
    wui-footer,
    w3m-legal-footer,
    wcm-footer,
    [class*="reown"],
    [class*="ux-by"],
    [data-testid="w3m-footer"],
    [data-testid="wui-ux-by-reown"] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  `;

  const processedRoots = new WeakSet<ShadowRoot>();

  function injectIntoShadow(root: ShadowRoot) {
    if (processedRoots.has(root)) return;
    processedRoots.add(root);
    if (!root.querySelector(`#${STYLE_ID}`)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = HIDE_CSS;
      root.appendChild(s);
    }
    root.querySelectorAll("*").forEach(el => {
      const sr = (el as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
      if (sr) injectIntoShadow(sr);
    });
    const obs = new MutationObserver(() => {
      root.querySelectorAll("*").forEach(el => {
        const sr = (el as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
        if (sr) injectIntoShadow(sr);
      });
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  function scan() {
    ["w3m-modal", "wcm-modal", "appkit-modal"].forEach(tag => {
      document.querySelectorAll(tag).forEach(modal => {
        const sr = (modal as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
        if (sr) injectIntoShadow(sr);
      });
    });
  }

  if (typeof document !== "undefined") {
    const obs = new MutationObserver(scan);
    obs.observe(document.body, { childList: true, subtree: true });
    scan();
  }
}

type ReownView =
  | "Connect" | "Account" | "Networks" | "OnRampProviders"
  | "Swap" | "AllWallets" | "WhatIsAWallet" | "WhatIsANetwork";

export function openReownModal(view?: ReownView): void {
  modal.open(view ? { view } : undefined);
}

export function closeReownModal(): void {
  modal.close();
}

export function subscribeReownAccount(
  cb: (state: { address?: string; isConnected: boolean; caipAddress?: string }) => void
): () => void {
  try {
    return (modal.subscribeAccount as any)(cb) ?? (() => {});
  } catch {
    return () => {};
  }
}

export function getReownAccount(): { address?: string; isConnected: boolean } {
  try {
    return (modal as any).getAccount?.() ?? { isConnected: false };
  } catch {
    return { isConnected: false };
  }
}

export function getWagmiConfig() {
  return wagmiConfig;
}

export function getWagmiAdapter() { return wagmiAdapter; }

let _userDisconnecting = false;
let _disconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function setUserDisconnecting(val: boolean): void {
  _userDisconnecting = val;
  if (_disconnectTimer) clearTimeout(_disconnectTimer);
  if (val) {
    _disconnectTimer = setTimeout(() => { _userDisconnecting = false; }, 3000);
  }
}

export function isUserDisconnecting(): boolean { return _userDisconnecting; }

export async function disconnectReown(): Promise<void> {
  setUserDisconnecting(true);
  try {
    await (modal as any).disconnect?.();
  } catch (err) {
    console.warn("[OrahDEX] Reown disconnect:", err);
  }
}

export async function switchReownChain(chainId: number): Promise<boolean> {
  const network = REOWN_NETWORKS.find(n => n.id === chainId);
  if (!network) return false;
  try {
    await (modal as any).switchNetwork(network);
    return true;
  } catch (err) {
    throw err;
  }
}

export function parseChainFromCaip(caipAddress?: string): number | null {
  if (!caipAddress) return null;
  const parts = caipAddress.split(":");
  if (parts.length < 2) return null;
  const n = parseInt(parts[1], 10);
  return isNaN(n) ? null : n;
}

export const CHAIN_RPC_URLS: Record<number, string> = {
  1:       "https://eth.llamarpc.com",
  56:      "https://bsc.llamarpc.com",
  137:     "https://polygon.llamarpc.com",
  42161:   "https://arbitrum.llamarpc.com",
  10:      "https://optimism.llamarpc.com",
  8453:    "https://base.llamarpc.com",
  59144:   "https://rpc.linea.build",
  324:     "https://mainnet.era.zksync.io",
  534352:  "https://rpc.scroll.io",
  5000:    "https://rpc.mantle.xyz",
  43114:   "https://api.avax.network/ext/bc/C/rpc",
  250:     "https://rpc.ftm.tools",
  25:      "https://evm.cronos.org",
  11155111:"https://ethereum-sepolia-rpc.publicnode.com",
  84532:   "https://sepolia.base.org",
  100:     "https://rpc.gnosischain.com",
  42220:   "https://forno.celo.org",
  1284:    "https://rpc.api.moonbeam.network",
  146:     "https://rpc.soniclabs.com",
  81457:   "https://rpc.blast.io",
  34443:   "https://mainnet.mode.network",
  288:     "https://mainnet.boba.network",
  1088:    "https://andromeda.metis.io/?owner=1088",
  167000:  "https://rpc.mainnet.taiko.xyz",
};

export const CHAIN_RPC_FALLBACKS: Record<number, string> = {
  1:       "https://ethereum.publicnode.com",
  56:      "https://bsc-dataseed.binance.org",
  137:     "https://rpc.ankr.com/polygon",
  42161:   "https://arb1.arbitrum.io/rpc",
  10:      "https://mainnet.optimism.io",
  8453:    "https://mainnet.base.org",
  43114:   "https://api.avax.network/ext/bc/C/rpc",
  11155111:"https://eth-sepolia.public.blastapi.io",
};

export async function fetchEvmBalance(
  address: string,
  chainId?: number | null
): Promise<string | null> {
  try {
    if (chainId && wagmiAdapter?.wagmiConfig) {
      try {
        const { getBalance } = await import("@wagmi/core");
        const result = await getBalance(wagmiAdapter.wagmiConfig, {
          address: address as `0x${string}`,
          chainId,
        });
        const native = Number(result.value) / 1e18;
        if (native >= 0) return native.toFixed(6);
      } catch { /* fall through */ }
    }

    const eth = (window as any).ethereum;
    if (eth) {
      try {
        const hex: string = await eth.request({ method: "eth_getBalance", params: [address, "latest"] });
        return (Number(BigInt(hex)) / 1e18).toFixed(6);
      } catch { /* fall through */ }
    }

    const rpcs = [
      chainId ? CHAIN_RPC_URLS[chainId] : null,
      chainId ? CHAIN_RPC_FALLBACKS[chainId] : null,
    ].filter(Boolean) as string[];

    for (const rpc of rpcs) {
      try {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.result) continue;
        return (Number(BigInt(json.result)) / 1e18).toFixed(6);
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
}

export async function signMessageWithReownProvider(
  message: string,
  address: string,
): Promise<string | null> {
  if (!wagmiAdapter?.wagmiConfig) return null;
  const hexMsg = "0x" + Array.from(new TextEncoder().encode(message))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  for (const connector of wagmiAdapter.wagmiConfig.connectors) {
    try {
      const provider = await (connector as any).getProvider?.();
      if (!provider) continue;
      const sig = await (provider as any).request({ method: "personal_sign", params: [hexMsg, address] });
      if (sig) return sig as string;
    } catch { /* try next */ }
  }
  return null;
}

export async function sendEvmTransfer({
  from, to, valueWei, targetChainId,
}: { from: string; to: string; valueWei: bigint; targetChainId: number }): Promise<string> {
  const valueHex = "0x" + valueWei.toString(16);
  const chainHex = "0x" + targetChainId.toString(16);

  async function tryProvider(provider: any): Promise<string | null> {
    try {
      const currentHex: string = await provider.request({ method: "eth_chainId" });
      if (parseInt(currentHex, 16) !== targetChainId) {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      }
      const hash: string = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to, value: valueHex }],
      });
      return hash ?? null;
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes("rejected")) throw err;
      return null;
    }
  }

  const injected = (window as any).ethereum;
  if (injected) { const h = await tryProvider(injected); if (h) return h; }

  const config = wagmiAdapter?.wagmiConfig;
  if (config) {
    for (const connector of config.connectors) {
      try {
        const provider = await (connector as any).getProvider?.();
        if (!provider) continue;
        const h = await tryProvider(provider);
        if (h) return h;
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.includes("rejected")) throw err;
      }
    }
  }
  throw new Error("No active wallet found. Please connect MetaMask or use WalletConnect.");
}

export async function sendErc20Transfer({
  tokenAddress, from, to, amount, targetChainId,
}: { tokenAddress: string; from: string; to: string; amount: bigint; targetChainId: number }): Promise<string> {
  const paddedTo  = to.replace("0x", "").padStart(64, "0");
  const paddedAmt = amount.toString(16).padStart(64, "0");
  const data      = "0xa9059cbb" + paddedTo + paddedAmt;
  const chainHex  = "0x" + targetChainId.toString(16);

  async function tryProvider(provider: any): Promise<string | null> {
    try {
      const currentHex: string = await provider.request({ method: "eth_chainId" });
      if (parseInt(currentHex, 16) !== targetChainId) {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      }
      const hash: string = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to: tokenAddress, data }],
      });
      return hash ?? null;
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes("rejected")) throw err;
      return null;
    }
  }

  const injected = (window as any).ethereum;
  if (injected) { const h = await tryProvider(injected); if (h) return h; }

  const config = wagmiAdapter?.wagmiConfig;
  if (config) {
    for (const connector of config.connectors) {
      try {
        const provider = await (connector as any).getProvider?.();
        if (!provider) continue;
        const h = await tryProvider(provider);
        if (h) return h;
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.includes("rejected")) throw err;
      }
    }
  }
  throw new Error("No active wallet found. Please connect MetaMask or use WalletConnect.");
}

export async function approveToken(
  tokenAddress: string,
  spenderAddress: string,
  amountHex: string,
  fromAddress: string,
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const data = "0x095ea7b3" + spenderAddress.replace("0x","").padStart(64,"0") + amountHex.replace("0x","").padStart(64,"0");
    const txHash: string = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: tokenAddress, data }],
    });
    return txHash ?? null;
  } catch { return null; }
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
  } catch { return null; }
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

export async function fetchErc20Balance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
  decimals = 18,
): Promise<string | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return null;
  const data = "0x70a08231" + ownerAddress.replace("0x","").padStart(64,"0");
  const result = await ethCall(rpc, tokenAddress, data);
  if (!result) return null;
  const raw = hexToBigInt(result);
  const divisor = 10n ** BigInt(decimals);
  return `${raw / divisor}.${(raw % divisor).toString().padStart(decimals,"0").slice(0,6)}`;
}

export async function checkAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number,
): Promise<bigint> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return 0n;
  const data = "0xdd62ed3e" + ownerAddress.replace("0x","").padStart(64,"0") + spenderAddress.replace("0x","").padStart(64,"0");
  const result = await ethCall(rpc, tokenAddress, data);
  return result ? hexToBigInt(result) : 0n;
}

export async function getBlockNumber(chainId: number): Promise<number | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return null;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.result) return null;
    return parseInt(json.result, 16);
  } catch { return null; }
}

export interface TxReceipt {
  status: "0x1" | "0x0";
  blockNumber: string;
  transactionHash: string;
  logs: unknown[];
}

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
  const maxAttempts = opts.maxAttempts ?? 75;
  let attempt = 0;
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    attempt++;
    if (attempt > maxAttempts) { opts.onTimeout?.(); return; }
    try {
      if (rpc) {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.result) {
            opts.onReceipt(json.result as TxReceipt);
            return;
          }
        }
      }
    } catch { /* ignore */ }
    setTimeout(poll, intervalMs);
  };

  setTimeout(poll, intervalMs);
  return () => { cancelled = true; };
}

export function getEvmProvider(walletId: string): any {
  const w = window as any;
  switch (walletId) {
    case "metamask":  return w.ethereum?.isMetaMask && !w.ethereum?.isRabby ? w.ethereum : w.ethereum?.providers?.find((p: any) => p.isMetaMask && !p.isRabby) ?? null;
    case "rabby":     return w.rabby ?? (w.ethereum?.isRabby ? w.ethereum : null);
    case "coinbase":  return w.coinbaseWalletExtension ?? w.ethereum?.isCoinbaseWallet ? w.ethereum : null;
    case "trust":     return w.trustwallet ?? (w.ethereum?.isTrust ? w.ethereum : null);
    case "okx":       return w.okxwallet ?? null;
    case "bybit":     return w.bybitWallet ?? null;
    case "rainbow":   return w.rainbow ?? (w.ethereum?.isRainbow ? w.ethereum : null);
    case "phantom":   return w.phantom?.ethereum ?? (w.ethereum?.isPhantom ? w.ethereum : null);
    case "imtoken":   return w.imToken ?? (w.ethereum?.isImToken ? w.ethereum : null);
    case "guarda":    return w.guarda ?? null;
    case "atomic":    return w.atomicWallet ?? null;
    default:          return null;
  }
}
