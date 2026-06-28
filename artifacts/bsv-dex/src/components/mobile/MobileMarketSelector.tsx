import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search, Star, ChevronUp, ChevronDown, ArrowLeftRight, Info, RefreshCw } from "lucide-react";
import { CoinInfoSheet } from "@/components/mobile/CoinInfoSheet";
import { useLocation } from "wouter";
import { CoinLogo } from "@/components/CoinLogo";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
  MNT_MARKETS, ZK_MARKETS, SCR_MARKETS, LINEA_MARKETS,
  AI_MARKETS, SOL_MARKETS, MEME_MARKETS, DEFI_MARKETS, NEW_MARKETS,
  FUTURES_MARKETS,
  BASE_MARKETS, GAMING_MARKETS, COSMOS_MARKETS,
  L1_MARKETS, L2_MARKETS, RWA_MARKETS, EXCHANGE_MARKETS,
  DEPIN_MARKETS, BRC20_MARKETS, UNISWAP_MARKETS, PANCAKE_MARKETS,
} from "@/lib/mock-data";
import { useLetsExchangePairs } from "@/hooks/useLetsExchangePairs";
import { useSSPairs } from "@/hooks/useSSPairs";
import { useGeckoTerminalPools } from "@/hooks/useGeckoTerminalPools";
import { useBaseTokenList } from "@/hooks/useBaseTokenList";
import { useBaseTokenPrices } from "@/hooks/useBaseTokenPrices";
import { cn, marketMatchesQuery } from "@/lib/utils";
import { getCoinInfo, getTagColor } from "@/lib/coinInfo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(p: number): string {
  if (!p && p !== 0) return "—";
  if (p >= 10000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 100)    return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.01)   return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function normalise(m: any) {
  const base     = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote    = m.quoteAsset ?? m.quote ?? "USDT";
  const price    = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg      = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const type     = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  const symbol   = m.symbol ?? `${base}-${quote}`;
  const network  = (m.network ?? m.networkName ?? undefined) as string | undefined;
  const swapOnly = m.swapOnly === true;      // true for AOS pairs (from LE)
  return { symbol, base, quote, price, chg, type, network, swapOnly };
}

type NormRow = ReturnType<typeof normalise>;
type UsdSub  = "USDT" | "USDC" | "TUSD" | "USDD";

const USD_SUBS: UsdSub[] = ["USDT", "USDC", "TUSD", "USDD"];
const STABLE_MOCK: Record<UsdSub, any[]> = {
  USDT: USDT_MARKETS, USDC: USDC_MARKETS, TUSD: TUSD_MARKETS, USDD: USDD_MARKETS,
};

type Cat = "all" | "favorites" | "usd" | "new" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "bch" | "bsv" | "ai" | "sol" | "meme" | "defi" | "mnt" | "zk" | "scr" | "linea" | "futures" | "base" | "gaming" | "cosmos" | "l1" | "l2" | "rwa" | "exchange" | "depin" | "brc20" | "uniswap" | "pancake";

const CATS: { id: Cat; label: string }[] = [
  { id: "favorites", label: "Favs"      },
  { id: "all",       label: "All"       },
  { id: "new",       label: "NEW"       },
  { id: "usd",       label: "USD"       },
  { id: "btc",       label: "BTC"       },
  { id: "bsv",       label: "⚡ BSV"    },
  { id: "eth",       label: "ETH"       },
  { id: "bnb",       label: "BNB"       },
  { id: "matic",     label: "MATIC"     },
  { id: "avax",      label: "AVAX"      },
  { id: "arb",       label: "ARB"       },
  { id: "op",        label: "OP"        },
  { id: "ftm",       label: "FTM"       },
  { id: "cro",       label: "CRO"       },
  { id: "base",      label: "⬡ Base"    },
  { id: "linea",     label: "LINEA"     },
  { id: "zk",        label: "ZK"        },
  { id: "scr",       label: "SCROLL"    },
  { id: "mnt",       label: "MNT"       },
  { id: "sol",       label: "SOL"       },
  { id: "bch",       label: "BCH"       },
  { id: "ai",        label: "AI"        },
  { id: "depin",     label: "DePIN"     },
  { id: "meme",      label: "MEME"      },
  { id: "defi",      label: "DEFI"      },
  { id: "gaming",    label: "GAMING"    },
  { id: "cosmos",    label: "COSMOS"    },
  { id: "l1",        label: "LAYER 1"   },
  { id: "l2",        label: "LAYER 2"   },
  { id: "rwa",       label: "RWA"       },
  { id: "exchange",  label: "EXCHANGE"  },
  { id: "brc20",     label: "BRC-20"    },
  { id: "uniswap",   label: "UNISWAP"   },
  { id: "pancake",   label: "PANCAKE"   },
  { id: "futures",   label: "Futures"   },
];

/** Chain tabs shown in the top "by network" row — ordered by importance */
const CHAIN_TABS: { id: Cat; icon: string; name: string }[] = [
  { id: "bsv",   icon: "⚡", name: "BSV"      },
  { id: "btc",   icon: "₿",  name: "BTC"      },
  { id: "eth",   icon: "⟠",  name: "ETH"      },
  { id: "sol",   icon: "◎",  name: "SOL"      },
  { id: "bnb",   icon: "🟡", name: "BNB"      },
  { id: "bch",   icon: "🔶", name: "BCH"      },
  { id: "matic", icon: "🟣", name: "Polygon"  },
  { id: "avax",  icon: "🔺", name: "AVAX"     },
  { id: "arb",   icon: "🔷", name: "Arbitrum" },
  { id: "op",    icon: "🔴", name: "Optimism" },
  { id: "base",  icon: "🔵", name: "Base"     },
  { id: "zk",    icon: "⚡", name: "zkSync"   },
  { id: "linea", icon: "⬛", name: "Linea"    },
  { id: "scr",   icon: "📜", name: "Scroll"   },
  { id: "mnt",   icon: "🟢", name: "Mantle"   },
  { id: "ftm",   icon: "👻", name: "Fantom"   },
  { id: "cro",   icon: "⬡",  name: "Cronos"   },
];

/** Topic/theme tabs shown in the bottom "by category" row */
const TOPIC_TABS: { id: Cat; label: string }[] = [
  { id: "favorites", label: "⭐ Favs"    },
  { id: "all",       label: "All"        },
  { id: "usd",       label: "💵 USD"     },
  { id: "new",       label: "🆕 NEW"     },
  { id: "ai",        label: "🤖 AI"      },
  { id: "meme",      label: "🐸 MEME"    },
  { id: "defi",      label: "🏦 DeFi"    },
  { id: "depin",     label: "📡 DePIN"   },
  { id: "gaming",    label: "🎮 Gaming"  },
  { id: "rwa",       label: "🏛 RWA"     },
  { id: "l1",        label: "L1"         },
  { id: "l2",        label: "L2"         },
  { id: "cosmos",    label: "⚛ Cosmos"  },
  { id: "brc20",     label: "BRC-20"     },
  { id: "exchange",  label: "Exchange"   },
  { id: "uniswap",   label: "🦄 Uni"     },
  { id: "pancake",   label: "🥞 Cake"    },
  { id: "futures",   label: "📈 Futures" },
];

const ALL_POOL = [
  ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
  ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
  ...BNB_MARKETS, ...MATIC_MARKETS, ...AVAX_MARKETS, ...ARB_MARKETS,
  ...OP_MARKETS, ...FTM_MARKETS, ...CRO_MARKETS,
  ...BASE_MARKETS,
  ...MNT_MARKETS, ...ZK_MARKETS, ...SCR_MARKETS, ...LINEA_MARKETS,
  ...AI_MARKETS, ...DEPIN_MARKETS, ...SOL_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
  ...UNISWAP_MARKETS, ...PANCAKE_MARKETS,
  ...GAMING_MARKETS, ...COSMOS_MARKETS, ...L1_MARKETS, ...L2_MARKETS,
  ...RWA_MARKETS, ...EXCHANGE_MARKETS, ...BRC20_MARKETS,
  ...NEW_MARKETS, ...FUTURES_MARKETS,
];

function dedupePool(pool: any[]) {
  const seen = new Set<string>();
  return pool.filter(m => {
    const sym = m.symbol ?? `${m.baseAsset ?? m.base}-${m.quoteAsset ?? m.quote ?? "USDT"}`;
    if (seen.has(sym)) return false;
    seen.add(sym);
    return true;
  });
}

const ALL_POOL_DEDUPED = dedupePool(ALL_POOL);

// Maps each OrahDEX chain category to keywords found in LE network names.
const CAT_NETWORKS: Partial<Record<Cat, string[]>> = {
  btc:     ["bitcoin", "btc"],
  eth:     ["ethereum", "eth", "erc20"],
  bnb:     ["bsc", "binance", "bnb", "bep20", "bep2"],
  matic:   ["polygon", "matic"],
  avax:    ["avalanche", "avax"],
  arb:     ["arbitrum"],
  op:      ["optimism"],
  ftm:     ["fantom", "ftm"],
  cro:     ["cronos", "cro"],
  bch:     ["bitcoin-cash", "bch", "bitcoincash"],
  bsv:     ["bsv", "bitcoin-sv", "bitcoinsv"],
  sol:     ["solana", "sol"],
  mnt:     ["mantle", "mnt"],
  zk:      ["zksync"],
  scr:     ["scroll"],
  linea:   ["linea"],
  base:    ["base", "base-mainnet"],
  cosmos:  ["cosmos", "ibc", "cosmoshub"],
  brc20:   ["bitcoin", "btc"],
  uniswap: ["ethereum", "eth", "erc20"],
  pancake: ["bsc", "binance", "bnb", "bep20"],
};

// Preferred quote order when picking a single AOS pair per coin in each chain tab.
const CAT_PREFERRED_QUOTE: Partial<Record<Cat, string[]>> = {
  btc:     ["BTC",  "USDT", "USDC"],
  eth:     ["ETH",  "USDT", "USDC"],
  bnb:     ["BNB",  "USDT", "USDC"],
  matic:   ["MATIC","USDT", "USDC"],
  avax:    ["AVAX", "USDT", "USDC"],
  arb:     ["ETH",  "USDT", "USDC"],
  op:      ["ETH",  "USDT", "USDC"],
  ftm:     ["FTM",  "USDT", "USDC"],
  cro:     ["CRO",  "USDT", "USDC"],
  bch:     ["BCH",  "USDT", "USDC"],
  bsv:     ["BSV",  "USDT", "USDC"],
  sol:     ["SOL",  "USDT", "USDC"],
  mnt:     ["MNT",  "USDT", "USDC"],
  zk:      ["ETH",  "USDT", "USDC"],
  scr:     ["ETH",  "USDT", "USDC"],
  linea:   ["ETH",  "USDT", "USDC"],
  base:    ["ETH",  "USDT", "USDC"],
  cosmos:  ["ATOM", "USDT", "USDC"],
  brc20:   ["BTC",  "USDT", "USDC"],
  uniswap: ["ETH",  "USDT", "USDC"],
  pancake: ["BNB",  "USDT", "USDC"],
};

function getRows(
  cat: Cat,
  usdSub: UsdSub,
  livePrice: Map<string, NormRow>,
  favorites: Set<string>,
  aosPairs: NormRow[],   // swap-only (AOS) pairs from LetsExchange
  apiRows: NormRow[],    // all DB pairs normalised
) {
  const enrich = (mock: any[]): NormRow[] =>
    mock.map(m => {
      const n = normalise(m);
      const live = livePrice.get(n.symbol);
      if (!live) return n;
      const chg = live.chg !== 0 ? live.chg : n.chg;
      return { ...n, price: live.price, chg };
    });

  /** All DB spot pairs for a given quote currency, priced > 0, sorted by base */
  const dbByQuote = (quote: string): NormRow[] =>
    apiRows
      .filter(m => m.quote === quote && m.type !== "futures" && m.price > 0)
      .sort((a, b) => a.base.localeCompare(b.base));

  // Merge native rows with ONE AOS row per unique base coin (best quote for the chain).
  const mergeAOS = (native: NormRow[], keywords: string[], quotePriority: string[]): NormRow[] => {
    const seenSymbols = new Set(native.map(r => r.symbol));
    const seenBases   = new Set(native.map(r => r.base));

    const eligible = aosPairs.filter(p => {
      const net = (p.network ?? "").toLowerCase();
      return keywords.some(kw => net.includes(kw)) && p.price > 0;
    });

    const byBase = new Map<string, NormRow[]>();
    for (const p of eligible) {
      if (!byBase.has(p.base)) byBase.set(p.base, []);
      byBase.get(p.base)!.push(p);
    }

    const extra: NormRow[] = [];
    for (const [base, pairs] of byBase) {
      if (seenBases.has(base)) continue;
      let best: NormRow | undefined;
      for (const q of quotePriority) {
        best = pairs.find(p => p.quote === q);
        if (best) break;
      }
      best = best ?? pairs[0];
      if (best && !seenSymbols.has(best.symbol)) extra.push(best);
    }

    extra.sort((a, b) => a.base.localeCompare(b.base));
    return [...native, ...extra];
  };

  /**
   * Chain-quote tab: use all DB pairs for `quote`, supplement with AOS extras
   * that belong to this chain's network. Falls back to static enrich if DB is empty.
   */
  const chainFromDB = (quote: string, c: Cat, fallbackMock: any[]): NormRow[] => {
    const db            = dbByQuote(quote);
    const keywords      = CAT_NETWORKS[c] ?? [];
    const quotePriority = CAT_PREFERRED_QUOTE[c] ?? ["USDT", "USDC"];
    const native        = db.length > 0 ? db : enrich(fallbackMock);
    return mergeAOS(native, keywords, quotePriority);
  };

  /**
   * BTC / BSV tabs: all DB pairs for that quote + ALL AOS pairs quoted in it
   * (BTC and BSV span every chain, so we don't filter by network).
   */
  const quoteAllPairs = (quote: string, fallbackMock: any[]): NormRow[] => {
    const db     = dbByQuote(quote);
    const native = db.length > 0 ? db : enrich(fallbackMock).filter(m => m.price > 0);
    const seenSymbols = new Set(native.map(r => r.symbol));
    const seenBases   = new Set(native.map(r => r.base));
    // Deduplicate within AOS pairs by base — same coin on multiple chains → show once (best price)
    const aosByBase = new Map<string, NormRow>();
    for (const p of aosPairs) {
      if (p.quote !== quote || p.price <= 0) continue;
      if (seenBases.has(p.base) || seenSymbols.has(p.symbol)) continue;
      const cur = aosByBase.get(p.base);
      if (!cur || p.price > cur.price) aosByBase.set(p.base, p);
    }
    const aos = Array.from(aosByBase.values()).sort((a, b) => a.base.localeCompare(b.base));
    return [...native, ...aos];
  };

  /** Category/topic tabs that are NOT chain-quote based — keep using static enrich + AOS */
  const chainRows = (mock: any[], c: Cat): NormRow[] => {
    const native        = enrich(mock);
    const keywords      = CAT_NETWORKS[c];
    const quotePriority = CAT_PREFERRED_QUOTE[c] ?? ["USDT", "USDC"];
    if (!keywords) return native;
    return mergeAOS(native, keywords, quotePriority);
  };

  // "All" pool = all native spot + AOS pairs not already native (priced only)
  const nativeSymbols = new Set(ALL_POOL_DEDUPED.map((m: any) => normalise(m).symbol));
  const nativeBases   = new Set(ALL_POOL_DEDUPED.map((m: any) => normalise(m).base));
  // Deduplicate AOS by base coin — LE lists the same coin on multiple chains.
  // Keep one entry per base (highest price = most liquid network).
  const aosOnly = (() => {
    const bestByBase = new Map<string, NormRow>();
    for (const p of aosPairs) {
      if (p.price <= 0) continue;
      if (nativeSymbols.has(p.symbol) || nativeBases.has(p.base)) continue;
      const cur = bestByBase.get(p.base);
      if (!cur || p.price > cur.price) bestByBase.set(p.base, p);
    }
    return Array.from(bestByBase.values());
  })();
  const allSpot = () => [
    ...enrich(ALL_POOL_DEDUPED).filter(m => m.type !== "futures" && m.price > 0),
    ...aosOnly,
  ];

  switch (cat) {
    case "all":       return allSpot();
    case "favorites": return allSpot().filter(m => favorites.has(m.symbol));
    case "usd":       return enrich(STABLE_MOCK[usdSub]);
    case "new":       return chainRows(NEW_MARKETS,   cat);
    // ── Chain-quote tabs: DB-backed ────────────────────────────────────────────
    case "btc":       return quoteAllPairs("BTC",   BTC_MARKETS);
    case "bsv":       return quoteAllPairs("BSV",   BSV_MARKETS);
    case "eth":       return chainFromDB("ETH",   cat, ETH_MARKETS);
    case "bnb":       return chainFromDB("BNB",   cat, BNB_MARKETS);
    case "sol":       return chainFromDB("SOL",   cat, SOL_MARKETS);
    case "bch":       return chainFromDB("BCH",   cat, BCH_MARKETS);
    case "matic":     return chainFromDB("MATIC", cat, MATIC_MARKETS);
    case "avax":      return chainFromDB("AVAX",  cat, AVAX_MARKETS);
    case "arb":       return chainFromDB("ARB",   cat, ARB_MARKETS);
    case "op":        return chainFromDB("OP",    cat, OP_MARKETS);
    case "ftm":       return chainFromDB("FTM",   cat, FTM_MARKETS);
    case "cro":       return chainFromDB("CRO",   cat, CRO_MARKETS);
    case "mnt":       return chainFromDB("MNT",   cat, MNT_MARKETS);
    case "zk":        return chainFromDB("ZK",    cat, ZK_MARKETS);
    case "scr":       return chainFromDB("SCR",   cat, SCR_MARKETS);
    case "linea":     return chainFromDB("LINEA", cat, LINEA_MARKETS);
    case "base":      return []; // Driven by live LE+SS pairs via baseChainRows memo
    // ── Category/topic tabs: static enrich + AOS ──────────────────────────────
    case "ai":        return chainRows(AI_MARKETS,       cat);
    case "meme":      return chainRows(MEME_MARKETS,     cat);
    case "defi":      return chainRows(DEFI_MARKETS,     cat);
    case "gaming":    return chainRows(GAMING_MARKETS,   cat);
    case "cosmos":    return chainRows(COSMOS_MARKETS,   cat);
    case "l1":        return enrich(L1_MARKETS);
    case "l2":        return enrich(L2_MARKETS);
    case "rwa":       return enrich(RWA_MARKETS);
    case "exchange":  return enrich(EXCHANGE_MARKETS);
    case "depin":     return chainRows(DEPIN_MARKETS,    cat);
    case "brc20":     return chainRows(BRC20_MARKETS,    cat);
    case "uniswap":   return chainRows(UNISWAP_MARKETS,  cat);
    case "pancake":   return chainRows(PANCAKE_MARKETS,  cat);
    case "futures":   return enrich(FUTURES_MARKETS);
    default:          return [];
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentSymbol?: string;
  defaultCat?: Cat;
  mode?: "spot" | "futures";
}

const SPOT_CATS    = CATS.filter(c => c.id !== "futures");
const FUTURES_CATS: { id: Cat; label: string }[] = [{ id: "futures", label: "Futures" }];

const PAGE = 150; // rows per infinite-scroll page

export function MobileMarketSelector({ open, onClose, currentSymbol, defaultCat, mode }: Props) {
  const [, navigate]  = useLocation();
  const queryClient   = useQueryClient();
  const effectiveCats = mode === "futures" ? FUTURES_CATS : mode === "spot" ? SPOT_CATS : CATS;
  const resolvedDefault: Cat = mode === "futures" ? "futures" : (defaultCat ?? "usd");

  const [cat, setCat]         = useState<Cat>(resolvedDefault);
  const [usdSub, setUsdSub]   = useState<UsdSub>("USDT");
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<"base"|"price"|"chg">("base");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [infoCoin, setInfoCoin] = useState<string | null>(null);
  const [renderCount, setRenderCount] = useState(PAGE);
  const [pulling, setPulling]   = useState(false);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("market_favorites");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Reset sort only (keep the user's last chain/category between opens)
  useEffect(() => {
    if (open) {
      setSortKey("base");
      setSortDir("asc");
    }
  }, [open]);

  // Only reset the category when the mode itself changes (spot ↔ futures)
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      setCat(mode === "futures" ? "futures" : (defaultCat ?? "usd"));
    }
  }, [mode, defaultCat]);

  // Reset render count whenever filters change so the list starts from the top
  useEffect(() => {
    setRenderCount(PAGE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [cat, usdSub, search, sortKey, sortDir]);

  // Infinite scroll — grow render window when sentinel comes into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setRenderCount(n => n + PAGE); },
      { root: scrollRef.current, rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cat, usdSub, search, sortKey, sortDir]);

  // Pull-to-refresh handlers
  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["markets"] });
    await queryClient.refetchQueries({ queryKey: ["markets"] });
    setRefreshing(false);
  }, [queryClient]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((scrollRef.current?.scrollTop ?? 0) === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = -1;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current < 0) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPulling(true);
      setPullDist(Math.min(delta * 0.45, 72));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDist >= 52 && !refreshing) doRefresh();
    setPulling(false);
    setPullDist(0);
    touchStartY.current = -1;
  }, [pullDist, refreshing, doRefresh]);

  // Native market data (prices / changes)
  const { data: apiData } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });

  // AOS pairs from LetsExchange — available to trade via Swap tab
  const { pairs: rawAosPairs } = useLetsExchangePairs({ all: true });
  // SimpleSwap pairs — combined with LE for chain-specific tabs
  const { pairs: rawSsPairs } = useSSPairs({ all: true });

  const aosPairs = useMemo<NormRow[]>(() => {
    const all = (rawAosPairs ?? []).map(p => ({
      symbol:   p.symbol,
      base:     p.baseAsset,
      quote:    p.quoteAsset,
      price:    p.lastPrice ?? 0,
      chg:      p.priceChangePercent24h ?? 0,
      type:     "spot" as const,
      network:  p.network ?? p.networkName ?? undefined,
      swapOnly: true as const,
    }));
    // Deduplicate at source: same base+quote on multiple chains → keep highest price.
    // Using uppercase keys so case inconsistencies in LE data don't slip through.
    const best = new Map<string, NormRow>();
    for (const p of all) {
      const key = `${p.base.toUpperCase()}:${p.quote.toUpperCase()}`;
      const ex = best.get(key);
      if (!ex || p.price > ex.price) best.set(key, p);
    }
    return [...best.values()];
  }, [rawAosPairs]);

  const apiRows = useMemo<NormRow[]>(
    () => (Array.isArray(apiData) ? apiData : []).map(normalise),
    [apiData]
  );

  // Base chain tab: purely live LE + SS pairs on the Base network.
  // Uses rawAosPairs (pre-global-dedup) so chain-specific filtering is accurate.
  const baseChainRows = useMemo<NormRow[]>(() => {
    if (cat !== "base") return [];
    const keywords     = CAT_NETWORKS["base"] ?? [];
    const quotePriority = CAT_PREFERRED_QUOTE["base"] ?? ["ETH", "USDT", "USDC"];
    const toRow = (p: { symbol: string; baseAsset: string; quoteAsset: string; lastPrice: number; priceChangePercent24h: number; network?: string | null; networkName?: string | null }): NormRow => ({
      symbol:   p.symbol,
      base:     p.baseAsset,
      quote:    p.quoteAsset,
      price:    p.lastPrice ?? 0,
      chg:      p.priceChangePercent24h ?? 0,
      type:     "spot" as const,
      network:  (p.network ?? p.networkName ?? undefined) as string | undefined,
      swapOnly: true as const,
    });
    const all = [
      ...(rawAosPairs ?? []).map(toRow),
      ...(rawSsPairs ?? []).map(p => toRow({ ...p, lastPrice: p.lastPrice, priceChangePercent24h: p.priceChangePercent24h })),
    ].filter(p => {
      const net = (p.network ?? "").toLowerCase();
      return keywords.some(kw => net.includes(kw)) && p.price > 0;
    });
    // Group by base, pick preferred quote, then fallback to highest price
    const byBase = new Map<string, NormRow[]>();
    for (const p of all) {
      if (!byBase.has(p.base)) byBase.set(p.base, []);
      byBase.get(p.base)!.push(p);
    }
    const result: NormRow[] = [];
    for (const [, pairs] of byBase) {
      let best: NormRow | undefined;
      for (const q of quotePriority) {
        best = pairs.find(p => p.quote === q);
        if (best) break;
      }
      if (!best) best = pairs.reduce((a, b) => b.price > a.price ? b : a);
      if (best) result.push(best);
    }
    // If baseTokenList has loaded, restrict to tokens with real Base contracts only.
    // While it's still loading (length 0) show all pairs so tab isn't blank.
    if (baseTokenList.length > 0) {
      const contractSet = new Set(baseTokenList.map(t => t.symbol.toUpperCase()));
      return result.filter(r => contractSet.has(r.base.toUpperCase())).sort((a, b) => a.base.localeCompare(b.base));
    }
    return result.sort((a, b) => a.base.localeCompare(b.base));
  }, [cat, rawAosPairs, rawSsPairs, baseTokenList]);

  // ETH tab supplement: all LE+SS Base-network pairs appended to the ETH tab
  // (Base is an ETH L2 — tokens without a Base contract route through ETH swaps)
  const baseOnEthRows = useMemo<NormRow[]>(() => {
    if (cat !== "eth") return [];
    const keywords = CAT_NETWORKS["base"] ?? [];
    const toRow = (p: { symbol: string; baseAsset: string; quoteAsset: string; lastPrice: number; priceChangePercent24h: number; network?: string | null; networkName?: string | null }): NormRow => ({
      symbol:   p.symbol,
      base:     p.baseAsset,
      quote:    p.quoteAsset,
      price:    p.lastPrice ?? 0,
      chg:      p.priceChangePercent24h ?? 0,
      type:     "spot" as const,
      network:  (p.network ?? p.networkName ?? undefined) as string | undefined,
      swapOnly: true as const,
    });
    const all = [
      ...(rawAosPairs ?? []).map(toRow),
      ...(rawSsPairs ?? []).map(p => toRow({ ...p, lastPrice: p.lastPrice, priceChangePercent24h: p.priceChangePercent24h })),
    ].filter(p => {
      const net = (p.network ?? "").toLowerCase();
      return keywords.some(kw => net.includes(kw)) && p.price > 0;
    });
    // One entry per base coin, prefer ETH quote
    const byBase = new Map<string, NormRow[]>();
    for (const p of all) {
      if (!byBase.has(p.base)) byBase.set(p.base, []);
      byBase.get(p.base)!.push(p);
    }
    const result: NormRow[] = [];
    for (const [, pairs] of byBase) {
      const best = pairs.find(p => p.quote === "ETH") ?? pairs.reduce((a, b) => b.price > a.price ? b : a);
      if (best) result.push({ ...best, quote: "ETH" });
    }
    return result;
  }, [cat, rawAosPairs, rawSsPairs]);

  const livePrice = useMemo(() => new Map(
    apiRows.map((m: NormRow) => [m.symbol, m])
  ), [apiRows]);

  // Lightweight global pool used ONLY when the user is searching.
  // We dedupe directly from apiRows + aosPairs instead of fanning out across
  // 36 categories — that fan-out crashed mobile Safari with ~30k AOS pairs.
  const globalRows = useMemo<NormRow[]>(() => {
    if (!search) return [];
    const merged = new Map<string, NormRow>();
    for (const m of apiRows) merged.set(m.symbol, m);
    for (const p of aosPairs) {
      if (p.price <= 0) continue;
      if (!merged.has(p.symbol)) merged.set(p.symbol, p);
    }
    return Array.from(merged.values());
  }, [search, apiRows, aosPairs]);

  // Live on-chain data from GeckoTerminal (chain tabs only, cached 90s)
  const { data: geckoRows } = useGeckoTerminalPools(cat);
  // Full Base chain token catalog from CoinGecko (base tab only, cached 1h)
  const { data: baseTokenList } = useBaseTokenList(cat === "base");
  // DexScreener prices for catalog tokens not covered by GeckoTerminal (cached 60s)
  const basePrices = useBaseTokenPrices(baseTokenList, cat === "base" && baseTokenList.length > 0);

  let rows: NormRow[] = search
    ? globalRows.filter(m => marketMatchesQuery(m.base, m.quote, m.symbol, search))
    : getRows(cat, usdSub, livePrice, favorites, aosPairs, apiRows);

  // Base tab: replace static rows with live LE+SS pairs for Base network
  if (!search && cat === "base" && baseChainRows.length > 0) {
    rows = baseChainRows;
  }

  // ETH tab: append Base-network LE+SS pairs (Base is ETH L2)
  if (!search && cat === "eth" && baseOnEthRows.length > 0) {
    const existingBases = new Set(rows.map(r => r.base));
    rows = [...rows, ...baseOnEthRows.filter(r => !existingBases.has(r.base))];
  }

  // Merge GeckoTerminal live data: update prices for known tokens, append new ones
  if (!search && geckoRows.length > 0) {
    const geckoByBase = new Map(geckoRows.map(g => [g.base, g]));
    rows = rows.map(r => {
      const g = geckoByBase.get(r.base);
      return g && g.price > 0 ? { ...r, price: g.price, chg: g.chg } : r;
    });
    const existingBases = new Set(rows.map(r => r.base));
    const newRows: NormRow[] = geckoRows
      .filter(g => !existingBases.has(g.base) && g.price > 0)
      .map(g => ({ symbol: g.symbol, base: g.base, quote: g.quote, price: g.price, chg: g.chg, type: "spot" as const, network: g.network, swapOnly: true }));
    rows = [...rows, ...newRows];
  }

  // Merge Base token list: append all ~2300 Base chain catalog tokens for base tab
  if (!search && cat === "base" && baseTokenList.length > 0) {
    const existingBases = new Set(rows.map(r => r.base));
    const newBase: NormRow[] = baseTokenList
      .filter(t => !existingBases.has(t.symbol))
      .map(t => { const dp = basePrices.get(t.symbol); return { symbol: `${t.symbol}/ETH`, base: t.symbol, quote: "ETH", price: dp?.price ? dp.price / 2420 : 0, chg: dp?.chg ?? 0, type: "spot" as const, network: "base-network", swapOnly: true as const }; });
    rows = [...rows, ...newBase];
  }

  rows = [...rows].sort((a, b) => {
    let v = 0;
    if (sortKey === "base")  v = a.base.localeCompare(b.base);
    if (sortKey === "price") v = a.price - b.price;
    if (sortKey === "chg")   v = a.chg - b.chg;
    return sortDir === "asc" ? v : -v;
  });

  // Infinite-scroll window — render PAGE rows at a time; sentinel triggers more
  const totalRows = rows.length;
  const hasMore   = totalRows > renderCount;
  if (hasMore) rows = rows.slice(0, renderCount);

  const toggleSort = (k: "base"|"price"|"chg") => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const toggleFav = (sym: string) =>
    setFavorites(prev => {
      const n = new Set(prev);
      n.has(sym) ? n.delete(sym) : n.add(sym);
      try { localStorage.setItem("market_favorites", JSON.stringify([...n])); } catch {}
      return n;
    });

  const pick = (m: NormRow) => {
    const slug = m.symbol.replace(/\//g, "-");
    navigate(m.type === "futures" ? `/futures/${slug}` : `/trade/${slug}`);
    onClose();
  };

  function SortIcon({ k }: { k: "base"|"price"|"chg" }) {
    if (sortKey !== k) return (
      <span className="inline-flex flex-col ml-0.5 opacity-30">
        <ChevronUp className="w-2.5 h-2.5" />
        <ChevronDown className="w-2.5 h-2.5 -mt-1" />
      </span>
    );
    return sortDir === "asc"
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-primary" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-primary" />;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-[88vw] max-w-sm bg-background flex flex-col shadow-2xl transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 border-b border-border shrink-0">
          <span className="text-base font-bold">{mode === "futures" ? "Futures Pairs" : "Markets"}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={doRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Refresh markets"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin text-primary" : "text-muted-foreground"} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground/60 outline-none"
              placeholder="Search by coin, name, or quote (e.g. ETH, bitcoin, BTC)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            />
            {search && (
              <button onClick={() => setSearch("")}><X size={12} className="text-muted-foreground" /></button>
            )}
          </div>
        </div>

        {/* Filter rows — replaced by result count pill when searching */}
        {search ? (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 shrink-0">
            <span className="text-[11px] font-bold text-primary bg-primary/15 px-2.5 py-1 rounded-full">
              🔍 All chains · {totalRows} result{totalRows !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground">Every chain &amp; quote asset</span>
          </div>
        ) : mode === "futures" ? (
          /* Futures mode — single flat tab row */
          <div className="flex overflow-x-auto no-scrollbar px-2 border-b border-border/40 shrink-0">
            {effectiveCats.map(c => (
              <button
                key={c.id}
                onClick={() => { setCat(c.id); setSearch(""); setSortKey("base"); setSortDir("asc"); }}
                className={cn(
                  "shrink-0 px-3 py-2.5 text-[12px] font-medium whitespace-nowrap relative transition-colors",
                  cat === c.id ? "text-foreground font-bold" : "text-muted-foreground"
                )}
              >
                {c.label}
                {cat === c.id && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        ) : (
          /* Spot mode — single flat scrollable tab row matching Markets tab order */
          <div className="flex overflow-x-auto no-scrollbar px-2 border-b border-border/40 shrink-0">
            {effectiveCats.map(c => (
              <button
                key={c.id}
                onClick={() => { setCat(c.id); setSearch(""); setSortKey("base"); setSortDir("asc"); }}
                className={cn(
                  "shrink-0 px-3 py-2.5 text-[12px] font-medium whitespace-nowrap relative transition-colors",
                  cat === c.id ? "text-foreground font-bold" : "text-muted-foreground"
                )}
              >
                {c.label}
                {cat === c.id && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* USD sub-tabs */}
        {!search && cat === "usd" && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 shrink-0">
            {USD_SUBS.map(s => (
              <button
                key={s}
                onClick={() => setUsdSub(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors",
                  usdSub === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Column headers */}
        <div className="flex items-center px-4 py-1.5 border-b border-border/30 shrink-0">
          <button onClick={() => toggleSort("base")} className="flex-1 flex items-center text-[10px] text-muted-foreground font-medium">
            Pair <SortIcon k="base" />
          </button>
          <button onClick={() => toggleSort("price")} className="w-24 flex items-center justify-end text-[10px] text-muted-foreground font-medium">
            Price <SortIcon k="price" />
          </button>
          <button onClick={() => toggleSort("chg")} className="w-16 flex items-center justify-end text-[10px] text-muted-foreground font-medium">
            Chg% <SortIcon k="chg" />
          </button>
        </div>

        {/* Market rows */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Pull-to-refresh indicator */}
          <div
            style={{
              height: pulling || refreshing ? `${Math.max(pullDist, refreshing ? 44 : 0)}px` : "0px",
              transition: pulling ? "none" : "height 0.2s ease",
              overflow: "hidden",
            }}
            className="flex items-center justify-center"
          >
            <RefreshCw
              size={18}
              className={cn(
                "transition-transform",
                refreshing ? "animate-spin text-primary" : "text-muted-foreground"
              )}
              style={{ transform: refreshing ? undefined : `rotate(${(pullDist / 72) * 360}deg)` }}
            />
            <span className="text-[11px] text-muted-foreground ml-2">
              {refreshing ? "Refreshing…" : pullDist >= 52 ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {cat === "favorites" ? "No favorites yet" : search ? "No results" : "Loading…"}
            </div>
          ) : (() => {
            // Insert a section divider before the first AOS (swap-only) row
            let aosDividerShown = false;
            return rows.map(m => {
              const isActive = m.symbol === currentSymbol?.replace(/\//g, "-");
              const isUp     = m.chg >= 0;
              const showDivider = !search && m.swapOnly && !aosDividerShown;
              if (showDivider) aosDividerShown = true;
              return (
                <div key={m.symbol}>
                  {/* AOS section header — shown once before the first swap-only row */}
                  {showDivider && (
                    cat === "btc" ? (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-500/8 border-y border-orange-500/20">
                        <ArrowLeftRight size={10} className="text-orange-400 shrink-0" />
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                          BTC Cross-Chain Swap
                        </span>
                        <div className="flex-1 h-px bg-orange-500/20" />
                        <span className="text-[9px] text-orange-400/60">⚡ auto-routed</span>
                      </div>
                    ) : cat === "bsv" ? (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/8 border-y border-yellow-500/20">
                        <ArrowLeftRight size={10} className="text-yellow-400 shrink-0" />
                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                          BSV Cross-Chain Swap
                        </span>
                        <div className="flex-1 h-px bg-yellow-500/20" />
                        <span className="text-[9px] text-yellow-400/60">⚡ auto-routed</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/5 border-y border-blue-500/15">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                          Available on Swap
                        </span>
                        <div className="flex-1 h-px bg-blue-500/15" />
                      </div>
                    )
                  )}

                  <div
                    className={cn(
                      "flex items-center px-4 py-[10px] border-b border-border/20",
                      isActive ? "bg-primary/8" : "active:bg-secondary/40"
                    )}
                  >
                    {/* Star */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleFav(m.symbol); }}
                      className="mr-1 shrink-0 flex items-center justify-center w-8 h-8 -ml-1 rounded-full active:bg-secondary/60"
                    >
                      <Star
                        size={15}
                        className={favorites.has(m.symbol) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}
                      />
                    </button>

                    {/* Coin logo */}
                    <button onClick={() => pick(m)} className="mr-2.5 shrink-0">
                      <CoinLogo symbol={m.base} size={28} />
                    </button>

                    {/* Pair name + badges + clickable description */}
                    <div className="flex-1 text-left min-w-0">
                      <button onClick={() => pick(m)} className="block w-full text-left">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={cn("text-[13px] font-semibold", isActive ? "text-primary" : "text-foreground")}>
                            {m.base}
                          </span>
                          <span className="text-[11px] text-muted-foreground">/{m.quote}</span>
                          {m.type === "futures" && (
                            <span className="text-[8px] font-bold text-green-400 bg-green-500/15 px-1 py-0.5 rounded">PERP</span>
                          )}
                          {m.swapOnly && (
                            <span className="text-[8px] font-bold text-blue-400 bg-blue-500/15 px-1 py-0.5 rounded">AOS</span>
                          )}
                          {isActive && (
                            <span className="text-[8px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded">●</span>
                          )}
                        </div>
                      </button>
                      {(() => {
                        const info = getCoinInfo(m.base);
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); setInfoCoin(m.base); }}
                            className="group flex items-start gap-1 mt-0.5 w-full text-left"
                            aria-label={`About ${m.base}`}
                          >
                            <span className="text-[10px] text-muted-foreground/70 line-clamp-2 flex-1 group-hover:text-foreground/90 group-active:text-foreground transition leading-snug">
                              {info?.description ?? "Tap to view details"}
                            </span>
                            <Info className="w-3 h-3 shrink-0 mt-0.5 text-primary/50 group-hover:text-primary transition" />
                            {info?.tags.slice(0, 1).map(tag => (
                              <span key={tag} className={cn("text-[8px] font-semibold px-1 py-px rounded border leading-none mt-0.5 shrink-0", getTagColor(tag))}>
                                {tag}
                              </span>
                            ))}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Price */}
                    <button onClick={() => pick(m)} className="w-24 text-right pr-2">
                      <span className="text-[12px] font-semibold text-foreground tabular-nums">
                        {m.price > 0 ? fmt(m.price) : "—"}
                      </span>
                    </button>

                    {/* Change */}
                    <button onClick={() => pick(m)} className="w-16 text-right">
                      {m.price > 0 ? (
                        <span className={cn(
                          "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
                          isUp ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                        )}>
                          {isUp ? "+" : ""}{m.chg.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-blue-400/60">live →</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            });
          })()}
          {/* Infinite-scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {/* Footer: progress or end-of-list */}
          {hasMore ? (
            <div className="px-4 py-3 text-center text-[11px] text-muted-foreground border-t border-border/30">
              Showing {renderCount} of {totalRows} · scroll for more
            </div>
          ) : totalRows > PAGE ? (
            <div className="px-4 py-3 text-center text-[11px] text-muted-foreground/50 border-t border-border/20">
              All {totalRows} pairs loaded
            </div>
          ) : null}
        </div>
      </div>
      <CoinInfoSheet symbol={infoCoin} onClose={() => setInfoCoin(null)} />
    </>
  );
}
