import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export type ExternalSwapStatus =
  | "idle"
  | "creating"
  | "waiting_deposit"
  | "confirming"
  | "completing"
  | "completed"
  | "failed";

export interface ExternalSwapData {
  swapId:         string;
  venue:          "letsexchange" | "simpleswap";
  fromCoin:       string;
  toCoin:         string;
  fromAmount:     number;
  expectedOutput: number;
  depositAddress: string;
  depositExtraId: string | null;
  status:         ExternalSwapStatus;
}

export interface ExecuteParams {
  fromCoin:      string;
  toCoin:        string;
  amount:        number;
  walletAddress: string;
  outputAddress: string;
  symbol?:       string;
  side?:         "buy" | "sell";
}

export function useExternalSwap() {
  const [status, setStatus]   = useState<ExternalSwapStatus>("idle");
  const [swap,   setSwap]     = useState<ExternalSwapData | null>(null);
  const [error,  setError]    = useState<string | null>(null);
  const pollRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef            = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const stopPoll = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  };

  const pollStatus = useCallback(async (swapId: string) => {
    stopPoll();
    const tick = async () => {
      if (!mountedRef.current) return;
      try {
        const r = await fetch(`${API_BASE}/external-swap/${swapId}`);
        if (!r.ok) return;
        const data = await r.json();
        const liveStatus = data.status as ExternalSwapStatus;
        if (mountedRef.current) {
          setStatus(liveStatus);
          setSwap(prev => prev ? { ...prev, status: liveStatus } : prev);
        }
        if (liveStatus !== "completed" && liveStatus !== "failed" && mountedRef.current) {
          pollRef.current = setTimeout(tick, 5000);
        }
      } catch {
        if (mountedRef.current) {
          pollRef.current = setTimeout(tick, 8000);
        }
      }
    };
    pollRef.current = setTimeout(tick, 5000);
  }, []);

  const execute = useCallback(async (params: ExecuteParams): Promise<ExternalSwapData | null> => {
    stopPoll();
    setStatus("creating");
    setError(null);
    setSwap(null);

    try {
      const r = await fetch(`${API_BASE}/external-swap/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(params),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data?.error ?? "Swap creation failed";
        setError(msg);
        setStatus("failed");
        return null;
      }

      const swapData: ExternalSwapData = {
        swapId:         data.swapId,
        venue:          data.venue,
        fromCoin:       data.fromCoin,
        toCoin:         data.toCoin,
        fromAmount:     data.fromAmount,
        expectedOutput: data.expectedOutput,
        depositAddress: data.depositAddress,
        depositExtraId: data.depositExtraId ?? null,
        status:         (data.status as ExternalSwapStatus) ?? "waiting_deposit",
      };

      if (mountedRef.current) {
        setSwap(swapData);
        setStatus(swapData.status);
        pollStatus(swapData.swapId);
      }
      return swapData;
    } catch (e: any) {
      const msg = e?.message ?? "Network error";
      if (mountedRef.current) { setError(msg); setStatus("failed"); }
      return null;
    }
  }, [pollStatus]);

  const reset = useCallback(() => {
    stopPoll();
    setStatus("idle");
    setSwap(null);
    setError(null);
  }, []);

  return { status, swap, error, execute, reset };
}
