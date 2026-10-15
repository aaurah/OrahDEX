import { useEffect, useRef, useState, useCallback } from "react";

type Level = [string, string];

interface DepthData {
  symbol: string;
  ts: number;
  venues: string[];
  bids: Level[];
  asks: Level[];
}

interface Props {
  symbol: string;
  refreshMs?: number;
}

export default function ExternalDepthPanel({ symbol, refreshMs = 4000 }: Props) {
  const [data, setData] = useState<DepthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastOk = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/external-depth?symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DepthData = await res.json();
      lastOk.current = Date.now();
      setData(json);
      setError(null);
      setStale(false);
    } catch (e: any) {
      setError(String(e?.message || e));
      setStale(Date.now() - lastOk.current > 15000);
    }
  }, [symbol]);

  useEffect(() => {
    setData(null);
    load();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, refreshMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, refreshMs]);

  const maxAmt = (lvls: Level[]) =>
    Math.max(1, ...lvls.map((l) => Number(l[1]) || 0));

  const renderSide = (lvls: Level[], side: "bid" | "ask") => {
    const peak = maxAmt(lvls);
    const color = side === "bid" ? "#22c55e" : "#ef4444";
    return (
      <div className="flex-1 min-w-0">
        <div className="flex justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
          <span>Price</span>
          <span>Amount</span>
        </div>
        {lvls.map(([p, a]) => (
          <div key={p + a} className="relative flex justify-between px-2 py-[1px] text-xs font-mono">
            <div
              className="absolute inset-y-0 right-0 opacity-15"
              style={{ width: `${((Number(a) / peak) * 100).toFixed(1)}%`, background: color }}
            />
            <span style={{ color }}>{p}</span>
            <span className="text-neutral-300">{a}</span>
          </div>
        ))}
      </div>
    );
  };

  const bestBid = data?.bids?.[0]?.[0];
  const bestAsk = data?.asks?.[0]?.[0];
  const spread =
    bestBid && bestAsk ? (Number(bestAsk) - Number(bestBid)).toFixed(2) : "—";

  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-2">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-xs font-semibold text-neutral-300">
          MARKET DEPTH
          <span className="ml-2 text-[10px] font-normal text-neutral-500">
            {symbol} · {data ? data.venues.join(" + ") : "…"}
          </span>
        </div>
        <div className="text-[10px] text-neutral-500">
          {error ? (
            <span className="text-amber-500">degraded{stale ? " (stale)" : ""}</span>
          ) : (
            <span className="text-emerald-500">● live</span>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-1 text-[10px] text-neutral-500">
        spread {spread}
      </div>

      {data ? (
        <div className="flex gap-2">
          {renderSide(data.bids.slice(0, 12), "bid")}
          {renderSide(data.asks.slice(0, 12), "ask")}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-neutral-500">
          {error ? `Depth unavailable: ${error}` : "Loading depth…"}
        </div>
      )}

      <div className="pt-2 text-center text-[9px] uppercase tracking-wide text-neutral-600">
        external display only — orders not executable on OrahDEX
      </div>
    </div>
  );
}
