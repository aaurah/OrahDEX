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
  applicationName?: string;
  applicationIcon?: string;
}

// Reown BlockchainAPI — same source as AppKit modal Activity tab
const REOWN_PROJECT_ID = "04663615251cf13fb1b043d754e7a17f";
const REOWN_API = "https://rpc.walletconnect.org";

const CHAIN_META: Record<string, { chainId: number; name: string; symbol: string; color: string; explorerUrl: string }> = {
  "eip155:1":     { chainId: 1,     name: "Ethereum",  symbol: "ETH",  color: "#8B5CF6", explorerUrl: "https://etherscan.io/tx/" },
  "eip155:56":    { chainId: 56,    name: "BNB Chain", symbol: "BNB",  color: "#F59E0B", explorerUrl: "https://bscscan.com/tx/" },
  "eip155:137":   { chainId: 137,   name: "Polygon",   symbol: "MATIC",color: "#8B5CF6", explorerUrl: "https://polygonscan.com/tx/" },
  "eip155:42161": { chainId: 42161, name: "Arbitrum",  symbol: "ETH",  color: "#3B82F6", explorerUrl: "https://arbiscan.io/tx/" },
  "eip155:10":    { chainId: 10,    name: "Optimism",  symbol: "ETH",  color: "#EF4444", explorerUrl: "https://optimistic.etherscan.io/tx/" },
  "eip155:8453":  { chainId: 8453,  name: "Base",      symbol: "ETH",  color: "#3B82F6", explorerUrl: "https://basescan.org/tx/" },
  "eip155:43114": { chainId: 43114, name: "Avalanche", symbol: "AVAX", color: "#EF4444", explorerUrl: "https://snowtrace.io/tx/" },
  "eip155:59144": { chainId: 59144, name: "Linea",     symbol: "ETH",  color: "#22C55E", explorerUrl: "https://lineascan.build/tx/" },
};

function mapReownTx(tx: any, meta: typeof CHAIN_META[string], addrLower: string): OnChainTx {
  const hash      = tx.metadata?.hash ?? tx.id ?? "";
  const sentTo    = (tx.metadata?.sentTo ?? "").toLowerCase();
  const minedAt   = tx.metadata?.minedAt ? new Date(tx.metadata.minedAt).getTime() / 1000 : 0;
  const isIncoming = sentTo === addrLower;

  const transfer   = Array.isArray(tx.transfers) && tx.transfers.length > 0 ? tx.transfers[0] : null;
  const isToken    = !!transfer?.fungible_info?.symbol && transfer.fungible_info.symbol !== meta.symbol;
  const qty        = parseFloat(transfer?.quantity?.numeric ?? "0");
  const valueEth   = isToken ? 0 : qty;
  const tokenValue = isToken ? qty : undefined;

  return {
    hash,
    chainId:         meta.chainId,
    chainName:       meta.name,
    chainColor:      meta.color,
    from:            tx.metadata?.sentFrom ?? "",
    to:              tx.metadata?.sentTo   ?? "",
    valueEth,
    nativeSymbol:    meta.symbol,
    timeStamp:       Math.round(minedAt),
    isError:         tx.metadata?.status === "failed",
    isIncoming,
    functionName:    tx.metadata?.operationType ?? "",
    isTokenTransfer: isToken,
    tokenSymbol:     isToken ? transfer.fungible_info.symbol : undefined,
    tokenValue,
    explorerUrl:     meta.explorerUrl + hash,
    applicationName: tx.metadata?.application?.name,
    applicationIcon: tx.metadata?.application?.iconUrl,
  };
}

async function fetchReownChainTxs(address: string, caipChainId: string): Promise<OnChainTx[]> {
  const meta = CHAIN_META[caipChainId];
  if (!meta) return [];
  const addrLower = address.toLowerCase();
  try {
    const url = `${REOWN_API}/v1/account/${address}/history?projectId=${REOWN_PROJECT_ID}&chainId=${caipChainId}&st=c&sv=html-wagmi-1.8.0`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json.data)) return [];
    return json.data.map((tx: any) => mapReownTx(tx, meta, addrLower));
  } catch { return []; }
}

export function useOnChainTxHistory(address: string | null) {
  return useQuery<OnChainTx[]>({
    queryKey: ["onchain-tx-history", address],
    enabled: !!address,
    staleTime: 2 * 60 * 1000,
    gcTime:    5 * 60 * 1000,
    queryFn: async () => {
      if (!address) return [];

      // Server-side proxy first (avoids mobile CORS, same Reown BlockchainAPI underneath)
      try {
        const res = await fetch(`/api/wallet/evm-tx-history/${encodeURIComponent(address)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data as OnChainTx[];
        }
      } catch { /* fall through */ }

      // Direct Reown BlockchainAPI fallback (if proxy unavailable)
      const results = await Promise.allSettled(
        Object.keys(CHAIN_META).map(caipId => fetchReownChainTxs(address, caipId))
      );
      const all: OnChainTx[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") all.push(...r.value);
      }
      const seen = new Set<string>();
      return all
        .filter(tx => { const k = `${tx.chainId}:${tx.hash}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.timeStamp - a.timeStamp);
    },
  });
}

export const ONCHAIN_CHAIN_IDS = Object.keys(CHAIN_META).map(k => CHAIN_META[k].chainId);
