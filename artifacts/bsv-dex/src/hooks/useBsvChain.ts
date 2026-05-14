import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface BsvChainStatus {
  online: boolean;
  blockHeight: number;
  bestBlockHash: string;
  difficulty: number;
  medianTime: number;
  lastChecked: string;
  explorerUrl: string;
  hashrateEHs: number;
  mempoolTxCount: number;
  mempoolBytes: number;
  feeRateSatPerByte: number;
  avgBlockTimeSec: number;
  bsvUsd: number;
}

const FALLBACK: BsvChainStatus = {
  online: false,
  blockHeight: 0,
  bestBlockHash: "",
  difficulty: 0,
  medianTime: 0,
  lastChecked: new Date().toISOString(),
  explorerUrl: "https://whatsonchain.com",
  hashrateEHs: 0,
  mempoolTxCount: 0,
  mempoolBytes: 0,
  feeRateSatPerByte: 1,
  avgBlockTimeSec: 600,
  bsvUsd: 0,
};

export function useBsvChain() {
  return useQuery<BsvChainStatus>({
    queryKey: ["bsv-chain-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/bsv-status`);
      if (!r.ok) return FALLBACK;
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    placeholderData: FALLBACK,
  });
}

/** Format hashrate: 0.012 EH/s → "12 PH/s", 1.5 → "1.5 EH/s" */
export function fmtHashrate(ehs: number): string {
  if (ehs <= 0) return "—";
  if (ehs >= 1)   return ehs.toFixed(2) + " EH/s";
  if (ehs >= 0.001) return (ehs * 1000).toFixed(1) + " PH/s";
  return (ehs * 1_000_000).toFixed(0) + " TH/s";
}

/** Format mempool bytes to MB */
export function fmtMempoolMb(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 0.1) return "<0.1 MB";
  return mb.toFixed(1) + " MB";
}

/** Format difficulty in T (trillions) */
export function fmtDifficulty(diff: number): string {
  if (diff <= 0) return "—";
  if (diff >= 1e12) return (diff / 1e12).toFixed(2) + " T";
  if (diff >= 1e9)  return (diff / 1e9).toFixed(1) + " G";
  if (diff >= 1e6)  return (diff / 1e6).toFixed(1) + " M";
  return diff.toFixed(0);
}

/** Estimated time since median block (seconds ago → human string) */
export function fmtBlockAge(medianTimeUnix: number): string {
  if (!medianTimeUnix) return "—";
  const ageSec = Math.floor(Date.now() / 1000) - medianTimeUnix;
  if (ageSec < 0) return "just now";
  if (ageSec < 90)  return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`;
  return `${Math.round(ageSec / 3600)}h ago`;
}
