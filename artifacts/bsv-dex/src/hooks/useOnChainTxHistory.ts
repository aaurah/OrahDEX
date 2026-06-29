import { useQuery } from "@tanstack/react-query";

export interface OnChainTx {
  hash: string;
  chainId: number;
  chainName: string;
  chainColor: string;
  from: string;
  to: string;
  valueEth: number;
  nativeSymbol: string;
  timeStamp: number;
  isError: boolean;
  isIncoming: boolean;
  functionName: string;
  isTokenTransfer: boolean;
  tokenSymbol?: string;
  tokenValue?: number;
  explorerUrl: string;
}

// Blockscout — free, no API key, same Etherscan-compatible format
const CHAIN_EXPLORERS: Record<number, {
  api: string;
  url: string;
  name: string;
  symbol: string;
  color: string;
}> = {
  1:     { api: "https://eth.blockscout.com/api",       url: "https://eth.blockscout.com/tx/",       name: "Ethereum",  symbol: "ETH",  color: "#8B5CF6" },
  56:    { api: "https://bsc.blockscout.com/api",       url: "https://bsc.blockscout.com/tx/",       name: "BNB Chain", symbol: "BNB",  color: "#F59E0B" },
  137:   { api: "https://polygon.blockscout.com/api",   url: "https://polygon.blockscout.com/tx/",   name: "Polygon",   symbol: "MATIC",color: "#8B5CF6" },
  42161: { api: "https://arbitrum.blockscout.com/api",  url: "https://arbitrum.blockscout.com/tx/",  name: "Arbitrum",  symbol: "ETH",  color: "#3B82F6" },
  10:    { api: "https://optimism.blockscout.com/api",  url: "https://optimism.blockscout.com/tx/",  name: "Optimism",  symbol: "ETH",  color: "#EF4444" },
  8453:  { api: "https://base.blockscout.com/api",      url: "https://base.blockscout.com/tx/",      name: "Base",      symbol: "ETH",  color: "#3B82F6" },
  43114: { api: "https://avalanche.blockscout.com/api", url: "https://avalanche.blockscout.com/tx/", name: "Avalanche", symbol: "AVAX", color: "#EF4444" },
  59144: { api: "https://explorer.linea.build/api",     url: "https://explorer.linea.build/tx/",     name: "Linea",     symbol: "ETH",  color: "#22C55E" },
};

async function fetchChainTxs(address: string, chainId: number): Promise<OnChainTx[]> {
  const explorer = CHAIN_EXPLORERS[chainId];
  if (!explorer) return [];

  const addrLower = address.toLowerCase();
  const txs: OnChainTx[] = [];

  const [nativeRes, tokenRes] = await Promise.allSettled([
    fetch(`${explorer.api}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=25`),
    fetch(`${explorer.api}?module=account&action=tokentx&address=${address}&sort=desc&page=1&offset=15`),
  ]);

  if (nativeRes.status === "fulfilled" && nativeRes.value.ok) {
    try {
      const json = await nativeRes.value.json();
      if (json.status === "1" && Array.isArray(json.result)) {
        for (const tx of json.result) {
          const valueEth = Number(BigInt(tx.value || "0")) / 1e18;
          txs.push({
            hash: tx.hash,
            chainId,
            chainName: explorer.name,
            chainColor: explorer.color,
            from: tx.from ?? "",
            to: tx.to ?? "",
            valueEth,
            nativeSymbol: explorer.symbol,
            timeStamp: parseInt(tx.timeStamp, 10),
            isError: tx.isError === "1",
            isIncoming: (tx.to ?? "").toLowerCase() === addrLower,
            functionName: tx.functionName ?? "",
            isTokenTransfer: false,
            explorerUrl: explorer.url + tx.hash,
          });
        }
      }
    } catch { /* skip chain */ }
  }

  if (tokenRes.status === "fulfilled" && tokenRes.value.ok) {
    try {
      const json = await tokenRes.value.json();
      if (json.status === "1" && Array.isArray(json.result)) {
        for (const tx of json.result) {
          if (txs.some(t => t.hash === tx.hash && !t.isTokenTransfer)) continue;
          const decimals = parseInt(tx.tokenDecimal ?? "18", 10);
          const tokenValue = Number(BigInt(tx.value || "0")) / Math.pow(10, decimals);
          txs.push({
            hash: tx.hash,
            chainId,
            chainName: explorer.name,
            chainColor: explorer.color,
            from: tx.from ?? "",
            to: tx.to ?? "",
            valueEth: 0,
            nativeSymbol: explorer.symbol,
            timeStamp: parseInt(tx.timeStamp, 10),
            isError: false,
            isIncoming: (tx.to ?? "").toLowerCase() === addrLower,
            functionName: "",
            isTokenTransfer: true,
            tokenSymbol: tx.tokenSymbol,
            tokenValue,
            explorerUrl: explorer.url + tx.hash,
          });
        }
      }
    } catch { /* skip */ }
  }

  return txs;
}

export function useOnChainTxHistory(address: string | null) {
  return useQuery<OnChainTx[]>({
    queryKey: ["onchain-tx-history", address],
    enabled: !!address,
    staleTime: 2 * 60 * 1000,
    gcTime:    5 * 60 * 1000,
    queryFn: async () => {
      if (!address) return [];

      // Try server-side proxy first (avoids CORS/mobile browser blocks)
      try {
        const res = await fetch(`/api/wallet/evm-tx-history/${encodeURIComponent(address)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length >= 0) return data as OnChainTx[];
        }
      } catch { /* fall through to direct */ }

      // Direct fallback for non-proxied environments
      const results = await Promise.allSettled(
        Object.keys(CHAIN_EXPLORERS).map(id => fetchChainTxs(address, parseInt(id, 10)))
      );
      const all: OnChainTx[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") all.push(...r.value);
      }
      return all.sort((a, b) => b.timeStamp - a.timeStamp);
    },
  });
}

export const ONCHAIN_CHAIN_IDS = Object.keys(CHAIN_EXPLORERS).map(Number);
