/**
 * useHybridBalance
 *
 * Aggregates the native-coin USD value across ALL of an orah-wallet user's
 * internal chain addresses simultaneously:
 *   • EVM  (ETH mainnet, chainId 1)  → internalEvmAddress
 *   • BSV                             → internalBsvAddress
 *   • BTC                             → internalBtcAddress
 *   • SOL                             → internalSolAddress
 *   • BCH                             → internalBchAddress
 *
 * Returns a stable total USD value that never jumps when the user switches
 * the active chain — because it always sums all chains at once.
 */

import { useEffect, useState, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { fetchBsvBalance } from "@/hooks/useBsvBalance";

const ETH_RPC = "https://ethereum.publicnode.com";
const SOL_RPC = "https://api.mainnet-beta.solana.com";

export interface ChainBalance {
  symbol: string;
  native: number;
  usd: number;
}

export interface HybridBalance {
  totalUsd: number;
  chains: ChainBalance[];
  loading: boolean;
}

async function fetchEvmNative(address: string): Promise<number> {
  try {
    const res = await fetch(ETH_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    });
    const json = await res.json();
    if (!json?.result) return 0;
    return Number(BigInt(json.result)) / 1e18;
  } catch { return 0; }
}

async function fetchBtcNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://blockstream.info/api/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const funded   = json?.chain_stats?.funded_txo_sum   ?? 0;
    const spent    = json?.chain_stats?.spent_txo_sum    ?? 0;
    return (funded - spent) / 1e8;
  } catch { return 0; }
}

async function fetchSolNative(address: string): Promise<number> {
  try {
    const res = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    });
    const json = await res.json();
    return (json?.result?.value ?? 0) / 1e9;
  } catch { return 0; }
}

async function fetchBchNative(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.blockchair.com/bitcoin-cash/dashboards/address/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const key  = Object.keys(json?.data ?? {})[0];
    const bal  = json?.data?.[key]?.address?.balance ?? 0;
    return bal / 1e8;
  } catch { return 0; }
}

export function useHybridBalance(refreshMs = 60_000): HybridBalance {
  const {
    internalEvmAddress,
    internalBsvAddress,
    internalBtcAddress,
    internalSolAddress,
    internalBchAddress,
  } = useWalletStore();

  const { prices } = useWalletPrices(refreshMs);
  const [chains, setChains] = useState<ChainBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchKey = [
    internalEvmAddress, internalBsvAddress,
    internalBtcAddress, internalSolAddress, internalBchAddress,
  ].join("|");
  const prevKey = useRef<string>("");

  useEffect(() => {
    if (fetchKey === "|||||") return; // nothing set yet
    if (fetchKey === prevKey.current && chains.length > 0) return;
    prevKey.current = fetchKey;

    let alive = true;
    setLoading(true);

    async function load() {
      const tasks: Promise<ChainBalance>[] = [];

      if (internalEvmAddress) {
        tasks.push(fetchEvmNative(internalEvmAddress).then(native => ({
          symbol: "ETH",
          native,
          usd: native * (prices.ETH?.usd ?? 0),
        })));
      }
      if (internalBsvAddress) {
        tasks.push(fetchBsvBalance(internalBsvAddress).then(r => {
          const native = r?.balance ?? 0;
          return { symbol: "BSV", native, usd: native * (prices.BSV?.usd ?? 0) };
        }));
      }
      if (internalBtcAddress) {
        tasks.push(fetchBtcNative(internalBtcAddress).then(native => ({
          symbol: "BTC",
          native,
          usd: native * (prices.BTC?.usd ?? 0),
        })));
      }
      if (internalSolAddress) {
        tasks.push(fetchSolNative(internalSolAddress).then(native => ({
          symbol: "SOL",
          native,
          usd: native * (prices.SOL?.usd ?? 0),
        })));
      }
      if (internalBchAddress) {
        tasks.push(fetchBchNative(internalBchAddress).then(native => ({
          symbol: "BCH",
          native,
          usd: native * (prices.BCH?.usd ?? 0),
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
    const priceKey = c.symbol as keyof typeof prices;
    const usd = c.native * (prices[priceKey]?.usd ?? 0);
    return { ...c, usd };
  });

  const totalUsd = pricedChains.reduce((sum, c) => sum + c.usd, 0);

  return { totalUsd, chains: pricedChains, loading };
}
