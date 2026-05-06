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

const CHAIN_EXPLORERS: Record<number, {
  api: string;
  url: string;
  name: string;
  symbol: string;
  color: string;
}> = {
  1:     { api: "https://api.etherscan.io/api",            url: "https://etherscan.io/tx/",            name: "Ethereum",  symbol: "ETH",  color: "#8B5CF6" },
  56:    { api: "https://api.bscscan.com/api",             url: "https://bscscan.com/tx/",             name: "BNB Chain", symbol: "BNB",  color: "#F59E0B" },
  137:   { api: "https://api.polygonscan.com/api",         url: "https://polygonscan.com/tx/",         name: "Polygon",   symbol: "MATIC",color: "#8B5CF6" },
  42161: { api: "https://api.arbiscan.io/api",             url: "https://arbiscan.io/tx/",             name: "Arbitrum",  symbol: "ETH",  color: "#3B82F6" },
  10:    { api: "https://api-optimistic.etherscan.io/api", url: "https://optimistic.etherscan.io/tx/", name: "Optimism",  symbol: "ETH",  color: "#EF4444" },
  8453:  { api: "https://api.basescan.org/api",            url: "https://basescan.org/tx/",            name: "Base",      symbol: "ETH",  color: "#3B82F6" },
  43114: { api: "https://api.snowtrace.io/api",            url: "https://snowtrace.io/tx/",            name: "Avalanche", symbol: "AVAX", color: "#EF4444" },
  59144: { api: "https://api.lineascan.build/api",         url: "https://lineascan.build/tx/",         name: "Linea",     symbol: "ETH",  color: "#22C55E" },
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
