/**
 * useHybridBalance
 *
 * Aggregates the native-coin USD value across ALL of an orah-wallet user's
 * internal chain addresses simultaneously:
 *   • EVM L1/L2  (ETH mainnet, OP, BASE, ARB) → internalEvmAddress
 *   • BNB Chain                                 → internalEvmAddress
 *   • Polygon                                   → internalEvmAddress
 *   • BSV                                       → internalBsvAddress
 *   • BTC                                       → internalBtcAddress
 *   • SOL                                       → internalSolAddress
 *   • BCH                                       → internalBchAddress
 */

import { useEffect, useState, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { fetchBsvBalance } from "@/hooks/useBsvBalance";
import { CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS } from "@/lib/reown";

export interface ChainBalance {
  symbol: string;
  chain: string;
  native: number;
  usd: number;
}

export interface HybridBalance {
  totalUsd: number;
  chains: ChainBalance[];
  loading: boolean;
}

/* ── RPC helpers ─────────────────────────────────────────────────────────── */

async function evmGetBalance(address: string, chainId: number): Promise<number> {
  const urls = [CHAIN_RPC_URLS[chainId], CHAIN_RPC_FALLBACKS[chainId]].filter(Boolean);
  for (const rpc of urls) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
      });
      const json = await res.json();
      if (json?.result) return Number(BigInt(json.result)) / 1e18;
    } catch { /* try next */ }
  }
  return 0;
}

// ETH mainnet fallback when not in CHAIN_RPC_URLS
async function fetchEthMainnet(address: string): Promise<number> {
  try {
    const res = await fetch("https://ethereum.publicnode.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    });
    const json = await res.json();
    if (json?.result) return Number(BigInt(json.result)) / 1e18;
  } catch { /* ignore */ }
  return 0;
}

export async function fetchBtcNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://blockstream.info/api/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const funded = json?.chain_stats?.funded_txo_sum ?? 0;
    const spent  = json?.chain_stats?.spent_txo_sum  ?? 0;
    return (funded - spent) / 1e8;
  } catch { return 0; }
}

export async function fetchSolNative(address: string): Promise<number> {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    });
    const json = await res.json();
    return (json?.result?.value ?? 0) / 1e9;
  } catch { return 0; }
}

export async function fetchBchNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.blockchair.com/bitcoin-cash/dashboards/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const key  = Object.keys(json?.data ?? {})[0];
    const bal  = json?.data?.[key]?.address?.balance ?? 0;
    return bal / 1e8;
  } catch { return 0; }
}

export async function fetchXrpNative(address: string): Promise<number> {
  try {
    const res = await fetch("https://xrplcluster.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] }),
    });
    const json = await res.json();
    const drops = json?.result?.account_data?.Balance;
    return drops ? Number(drops) / 1e6 : 0;
  } catch { return 0; }
}

export async function fetchLtcNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.blockchair.com/litecoin/dashboards/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const key  = Object.keys(json?.data ?? {})[0];
    const bal  = json?.data?.[key]?.address?.balance ?? 0;
    return bal / 1e8;
  } catch { return 0; }
}

export async function fetchDogeNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.blockchair.com/dogecoin/dashboards/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const key  = Object.keys(json?.data ?? {})[0];
    const bal  = json?.data?.[key]?.address?.balance ?? 0;
    return bal / 1e8;
  } catch { return 0; }
}

export async function fetchTrxNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const bal  = json?.data?.[0]?.balance ?? 0;
    return bal / 1e6;
  } catch { return 0; }
}

export async function fetchBsvNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/balance`);
    if (!res.ok) return 0;
    const json = await res.json();
    return ((json?.confirmed ?? 0) + (json?.unconfirmed ?? 0)) / 1e8;
  } catch { return 0; }
}

/* ── EVM chains to scan ──────────────────────────────────────────────────── */
const EVM_CHAINS: Array<{ chainId: number; symbol: string; chain: string; priceKey: string }> = [
  { chainId: 1,     symbol: "ETH", chain: "ETH",   priceKey: "ETH" },
  { chainId: 10,    symbol: "ETH", chain: "OP",    priceKey: "ETH" },
  { chainId: 8453,  symbol: "ETH", chain: "BASE",  priceKey: "ETH" },
  { chainId: 42161, symbol: "ETH", chain: "ARB",   priceKey: "ETH" },
  { chainId: 56,    symbol: "BNB", chain: "BNB",   priceKey: "BNB" },
  { chainId: 137,   symbol: "POL", chain: "MATIC", priceKey: "MATIC" },
];

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useHybridBalance(refreshMs = 60_000): HybridBalance {
  const {
    internalEvmAddress,
    internalBsvAddress,
    internalBtcAddress,
    internalSolAddress,
    internalBchAddress,
    address: connectedAddress,
    network,
  } = useWalletStore();

  // Use connected wallet address as fallback for EVM when no Orah internal address
  const evmAddress = internalEvmAddress ?? (network === "evm" && connectedAddress ? connectedAddress : null);

  const { prices } = useWalletPrices(refreshMs);
  const [chains, setChains] = useState<ChainBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchKey = [
    evmAddress, internalBsvAddress,
    internalBtcAddress, internalSolAddress, internalBchAddress,
  ].join("|");
  const prevKey = useRef<string>("");

  useEffect(() => {
    if (fetchKey === "|||||") return;
    if (fetchKey === prevKey.current && chains.length > 0) return;
    prevKey.current = fetchKey;

    let alive = true;
    setLoading(true);

    async function load() {
      const tasks: Promise<ChainBalance>[] = [];

      // EVM chains — use internal address if available, otherwise connected wallet
      if (evmAddress) {
        for (const { chainId, symbol, chain, priceKey } of EVM_CHAINS) {
          const fetcher = chainId === 1
            ? fetchEthMainnet(evmAddress)
            : evmGetBalance(evmAddress, chainId);
          tasks.push(
            fetcher.then(native => ({
              symbol,
              chain,
              native,
              usd: native * ((prices as any)[priceKey]?.usd ?? 0),
            }))
          );
        }
      }

      if (internalBsvAddress) {
        tasks.push(fetchBsvBalance(internalBsvAddress).then(r => {
          const native = r?.balance ?? 0;
          return { symbol: "BSV", chain: "BSV", native, usd: native * (prices.BSV?.usd ?? 0) };
        }));
      }
      if (internalBtcAddress) {
        tasks.push(fetchBtcNative(internalBtcAddress).then(native => ({
          symbol: "BTC", chain: "BTC", native, usd: native * (prices.BTC?.usd ?? 0),
        })));
      }
      if (internalSolAddress) {
        tasks.push(fetchSolNative(internalSolAddress).then(native => ({
          symbol: "SOL", chain: "SOL", native, usd: native * (prices.SOL?.usd ?? 0),
        })));
      }
      if (internalBchAddress) {
        tasks.push(fetchBchNative(internalBchAddress).then(native => ({
          symbol: "BCH", chain: "BCH", native, usd: native * (prices.BCH?.usd ?? 0),
        })));
      }

      const results = await Promise.allSettled(tasks);
      if (!alive) return;

      const settled: ChainBalance[] = results
        .filter((r): r is PromiseFulfilledResult<ChainBalance> => r.status === "fulfilled")
        .map(r => r.value);

      setChains(settled);
      setLoading(false);
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(id); };
  }, [fetchKey, refreshMs]);

  // Recalculate USD values when prices update (without re-fetching balances)
  const pricedChains = chains.map(c => {
    const priceKey = EVM_CHAINS.find(e => e.chain === c.chain)?.priceKey ?? c.symbol;
    const usd = c.native * ((prices as any)[priceKey]?.usd ?? 0);
    return { ...c, usd };
  });

  const totalUsd = pricedChains.reduce((sum, c) => sum + c.usd, 0);

  return { totalUsd, chains: pricedChains, loading };
}
