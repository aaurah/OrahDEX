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

/**
 * useMarketSearch — Debounced server-side search across the full 1.24 M pair catalog.
 *
 * Calls GET /api/markets/search?q=QUERY on every query change (debounced).
 * Returns [] when query is empty — callers can fall back to local in-memory data.
 * Spot/futures results come first; simpleswap/catalog fill the remainder.
 */
export function useMarketSearch(
  query: string,
  opts: { limit?: number; debounceMs?: number } = {},
): { results: any[]; loading: boolean } {
  const limit      = opts.limit      ?? 100;
  const debounceMs = opts.debounceMs ?? 300;
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim().toUpperCase();
    if (!q) { setResults([]); setLoading(false); return; }

    setLoading(true);
    let controller: AbortController | null = null;

    const id = setTimeout(() => {
      controller = new AbortController();
      fetch(`${API_BASE}/markets/catalog?scope=all&q=${encodeURIComponent(q)}&limit=${limit}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : { items: [] })
        .then((data: unknown) => {
          const payload = data as { items?: unknown[] };
          setResults(Array.isArray(payload?.items) ? payload.items : []);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if ((err as any)?.name !== "AbortError") setLoading(false);
        });
    }, debounceMs);

    return () => {
      clearTimeout(id);
      controller?.abort();
    };
  }, [query, limit, debounceMs]);

  return { results, loading };
}

export interface VenueCatalogPage {
  items: any[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const EMPTY_CATALOG_PAGE: VenueCatalogPage = {
  items: [],
  total: 0,
  limit: 100,
  offset: 0,
  hasMore: false,
};

/** Paginated all-venues browser. Never downloads the complete provider catalog. */
export function useVenueCatalog(opts: {
  query?: string;
  quote?: string;
  sources?: string[];
  limit?: number;
  offset?: number;
  enabled?: boolean;
} = {}): VenueCatalogPage & { loading: boolean } {
  const {
    query = "",
    quote = "",
    sources = [],
    limit = 100,
    offset = 0,
    enabled = true,
  } = opts;
  const [page, setPage] = useState<VenueCatalogPage>(EMPTY_CATALOG_PAGE);
  const [loading, setLoading] = useState(false);
  const sourcesKey = sources.join(",");

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      scope: "all",
      limit: String(limit),
      offset: String(offset),
    });
    if (query.trim()) params.set("q", query.trim().toUpperCase());
    if (quote.trim()) params.set("quote", quote.trim().toUpperCase());
    if (sourcesKey) params.set("sources", sourcesKey);

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/markets/catalog?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : EMPTY_CATALOG_PAGE)
        .then((data: unknown) => {
          const d = data as Partial<VenueCatalogPage>;
          setPage({
            items: Array.isArray(d.items) ? d.items : [],
            total: Number(d.total) || 0,
            limit: Number(d.limit) || limit,
            offset: Number(d.offset) || 0,
            hasMore: Boolean(d.hasMore),
          });
          setLoading(false);
        })
        .catch((err: unknown) => {
          if ((err as any)?.name !== "AbortError") {
            setPage(EMPTY_CATALOG_PAGE);
            setLoading(false);
          }
        });
    }, query.trim() ? 250 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, quote, sourcesKey, limit, offset, enabled]);

  return { ...page, loading };
}
