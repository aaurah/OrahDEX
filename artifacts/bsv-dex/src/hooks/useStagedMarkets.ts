import { useEffect, useState } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/api";

const PRIORITY_LIMIT = 1000;

let priorityCache: any[] | null = null;
let priorityPromise: Promise<any[]> | null = null;

async function fetchPriority(): Promise<any[]> {
  if (priorityCache) return priorityCache;
  if (priorityPromise) return priorityPromise;
  priorityPromise = (async () => {
    try {
      const r = await fetch(`${API_BASE}/markets?limit=${PRIORITY_LIMIT}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`priority markets ${r.status}`);
      const data = (await r.json()) as any[];
      priorityCache = data;
      return data;
    } finally {
      priorityPromise = null;
    }
  })();
  return priorityPromise;
}

/**
 * Staged markets loader.
 *
 * Stage 1 — fire a tiny `/api/markets?limit=1000` request immediately and
 *           render with whatever comes back (≈30 KB, ~80 ms).
 * Stage 2 — let the existing react-query `useGetMarkets()` continue fetching
 *           the full ~36 000-row catalogue (~12 MB) in the background; when
 *           it lands, swap to it transparently.
 *
 * The 950 curated/tradeable pairs the user actually sees are sorted to the
 * top of the server response (pinned + has price + volume24h), so the priority
 * batch is exactly the set the UI needs to be useful on first paint.
 */
export function useStagedMarkets(opts?: Parameters<typeof useGetMarkets>[0]) {
  const full = useGetMarkets({
    ...opts,
    request: { ...(opts?.request ?? {}), cache: opts?.request?.cache ?? "no-store" },
  });
  const [priority, setPriority] = useState<any[] | null>(priorityCache);

  useEffect(() => {
    if (priorityCache) { setPriority(priorityCache); return; }
    let alive = true;
    fetchPriority().then((d) => { if (alive) setPriority(d); }).catch(() => { /* fall through to full */ });
    return () => { alive = false; };
  }, []);

  // Prefer the full result once it's available; otherwise show the priority slice.
  const data = (full.data && (full.data as any[]).length > 0) ? full.data : (priority ?? undefined);
  return { ...full, data } as typeof full;
}
