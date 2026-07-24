import { getCoinbaseProvider } from "./coinbaseWallet";
import { createConfig, http } from "@wagmi/core";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, mantle, fantom, cronos, sepolia,
} from "viem/chains";

// Minimal wagmi config — no WalletConnect connectors.
// Used by ThirdWeb panels for provider detection; they fall back to window.ethereum.
// Optional VITE_ overrides — set these in .env to a direct QuickNode/Alchemy URL
// if you want the frontend to call the provider directly (faster, no proxy hop).
// When blank, the frontend uses the backend /api/rpc/:chainId proxy instead,
// which keeps the Alchemy API key server-side only.
const QN = {
  eth:  import.meta.env.VITE_QN_ETH_RPC  || undefined,
  bsc:  import.meta.env.VITE_QN_BSC_RPC  || undefined,
  base: import.meta.env.VITE_QN_BASE_RPC || undefined,
  poly: import.meta.env.VITE_QN_MATIC_RPC|| undefined,
  arb:  import.meta.env.VITE_QN_ARB_RPC  || undefined,
  op:   import.meta.env.VITE_QN_OP_RPC   || undefined,
  avax: import.meta.env.VITE_QN_AVAX_RPC || undefined,
};

// Backend RPC proxy — keeps Alchemy key off the client bundle.
// Format: {origin}/api/rpc/{chainId}
const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _base   = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const _proxy  = (chainId: number) => `${_origin}${_base}/api/rpc/${chainId}`;

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum, optimism, base, bsc, avalanche, linea, zkSync, scroll, mantle, fantom, cronos, sepolia],
  transports: {
    [mainnet.id]:   http(QN.eth  ?? _proxy(1)),
    [polygon.id]:   http(QN.poly ?? _proxy(137)),
    [arbitrum.id]:  http(QN.arb  ?? _proxy(42161)),
    [optimism.id]:  http(QN.op   ?? _proxy(10)),
    [base.id]:      http(QN.base ?? _proxy(8453)),
    [bsc.id]:       http(QN.bsc  ?? _proxy(56)),
    [avalanche.id]: http(QN.avax ?? "https://api.avax.network/ext/bc/C/rpc"),
    [linea.id]:     http("https://rpc.linea.build"),
    [zkSync.id]:    http("https://mainnet.era.zksync.io"),
    [scroll.id]:    http("https://rpc.scroll.io"),
    [mantle.id]:    http("https://rpc.mantle.xyz"),
    [fantom.id]:    http("https://rpc.ftm.tools"),
    [cronos.id]:    http("https://evm.cronos.org"),
    [sepolia.id]:   http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});

export function getWagmiConfig() { return wagmiConfig; }

export function parseChainFromCaip(caipAddress?: string): number | null {
  if (!caipAddress) return null;
  const parts = caipAddress.split(":");
  if (parts.length < 2) return null;
  const n = parseInt(parts[1], 10);
  return isNaN(n) ? null : n;
}

export const CHAIN_RPC_URLS: Record<number, string> = {
  1:       QN.eth  ?? _proxy(1),
  56:      QN.bsc  ?? _proxy(56),
  137:     QN.poly ?? _proxy(137),
  42161:   QN.arb  ?? _proxy(42161),
  10:      QN.op   ?? _proxy(10),
  8453:    QN.base ?? _proxy(8453),
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
  33139:   "https://rpc.apechain.com/http",
  1329:    "https://evm-rpc.sei-apis.com",
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
  33139:   "https://apechain.calderachain.xyz/http",
};

export async function fetchEvmBalance(
  address: string,
  chainId?: number | null
): Promise<string | null> {
  try {
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

  throw new Error("No active wallet found. Please connect MetaMask or install a browser wallet.");
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

  throw new Error("No active wallet found. Please connect MetaMask or install a browser wallet.");
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
    case "coinbase":  return getCoinbaseProvider() ?? w.coinbaseWalletExtension ?? (w.ethereum?.isCoinbaseWallet ? w.ethereum : null);
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
