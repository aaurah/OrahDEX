import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Star, ChevronUp, ChevronDown, ArrowLeftRight } from "lucide-react";
import { useLocation } from "wouter";
import { CoinLogo } from "@/components/CoinLogo";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
  MNT_MARKETS, ZK_MARKETS, SCR_MARKETS, LINEA_MARKETS,
  AI_MARKETS, SOL_MARKETS, MEME_MARKETS, DEFI_MARKETS, NEW_MARKETS,
  FUTURES_MARKETS,
  BASE_MARKETS, ZORA_MARKETS, GAMING_MARKETS, COSMOS_MARKETS,
  L1_MARKETS, L2_MARKETS, RWA_MARKETS, EXCHANGE_MARKETS,
  DEPIN_MARKETS, BRC20_MARKETS, UNISWAP_MARKETS, PANCAKE_MARKETS,
} from "@/lib/mock-data";
import { useLetsExchangePairs } from "@/hooks/useLetsExchangePairs";
import { cn, marketMatchesQuery } from "@/lib/utils";

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

type Cat = "all" | "favorites" | "usd" | "new" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "bch" | "bsv" | "ai" | "sol" | "meme" | "defi" | "mnt" | "zk" | "scr" | "linea" | "futures" | "base" | "zora" | "gaming" | "cosmos" | "l1" | "l2" | "rwa" | "exchange" | "depin" | "brc20" | "uniswap" | "pancake";

const CATS: { id: Cat; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "all",       label: "All"       },
  { id: "usd",       label: "USD"       },
  { id: "new",       label: "NEW"       },
  { id: "btc",       label: "BTC"       },
  { id: "bsv",       label: "BSV"       },
  { id: "eth",       label: "ETH"       },
  { id: "bnb",       label: "BNB"       },
  { id: "matic",     label: "MATIC"     },
  { id: "avax",      label: "AVAX"      },
  { id: "arb",       label: "ARB"       },
  { id: "op",        label: "OP"        },
  { id: "ftm",       label: "FTM"       },
  { id: "cro",       label: "CRO"       },
  { id: "base",      label: "⬡ Base"    },
  { id: "zora",      label: "ZORA"      },
  { id: "mnt",       label: "MNT"       },
  { id: "zk",        label: "ZK"        },
  { id: "scr",       label: "SCROLL"    },
  { id: "linea",     label: "LINEA"     },
  { id: "bch",       label: "BCH"       },
  { id: "sol",       label: "SOL"       },
  { id: "ai",        label: "AI"        },
  { id: "depin",     label: "DePIN"     },
  { id: "meme",      label: "MEME"      },
  { id: "defi",      label: "DEFI"      },
  { id: "uniswap",   label: "UNISWAP"   },
  { id: "pancake",   label: "PANCAKE"   },
  { id: "gaming",    label: "GAMING"    },
  { id: "cosmos",    label: "COSMOS"    },
  { id: "l1",        label: "LAYER 1"   },
  { id: "l2",        label: "LAYER 2"   },
  { id: "rwa",       label: "RWA"       },
  { id: "exchange",  label: "EXCHANGE"  },
  { id: "brc20",     label: "BRC-20"    },
  { id: "futures",   label: "Futures"   },
];

const ALL_POOL = [
  ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
  ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
  ...BNB_MARKETS, ...MATIC_MARKETS, ...AVAX_MARKETS, ...ARB_MARKETS,
  ...OP_MARKETS, ...FTM_MARKETS, ...CRO_MARKETS,
  ...BASE_MARKETS, ...ZORA_MARKETS,
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
  zora:    ["zora"],
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
  zora:    ["ETH",  "USDT", "USDC"],
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
    const native = db.length > 0 ? db : enrich(fallbackMock);
    const seenSymbols = new Set(native.map(r => r.symbol));
    const seenBases   = new Set(native.map(r => r.base));
    const aos = aosPairs
      .filter(p => p.quote === quote && p.price > 0 && !seenBases.has(p.base) && !seenSymbols.has(p.symbol))
      .sort((a, b) => a.base.localeCompare(b.base));
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
  const aosOnly = aosPairs.filter(p => !nativeSymbols.has(p.symbol) && p.price > 0);
  const allSpot = () => [
    ...enrich(ALL_POOL_DEDUPED).filter(m => m.type !== "futures"),
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
    case "base":      return chainFromDB("BASE",  cat, BASE_MARKETS);
    case "zora":      return chainRows(ZORA_MARKETS,     cat);
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

export function MobileMarketSelector({ open, onClose, currentSymbol, defaultCat, mode }: Props) {
  const [, navigate]  = useLocation();
  const effectiveCats = mode === "futures" ? FUTURES_CATS : mode === "spot" ? SPOT_CATS : CATS;
  const resolvedDefault: Cat = mode === "futures" ? "futures" : (defaultCat ?? "usd");

  const [cat, setCat]         = useState<Cat>(resolvedDefault);
  const [usdSub, setUsdSub]   = useState<UsdSub>("USDT");
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<"base"|"price"|"chg">("base");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
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

  const aosPairs = useMemo<NormRow[]>(() =>
    (rawAosPairs ?? []).map(p => ({
      symbol:   p.symbol,
      base:     p.baseAsset,
      quote:    p.quoteAsset,
      price:    p.lastPrice ?? 0,
      chg:      p.priceChangePercent24h ?? 0,
      type:     "spot" as const,
      network:  p.network ?? p.networkName ?? undefined,
      swapOnly: true,
    })),
  [rawAosPairs]);

  const apiRows = useMemo<NormRow[]>(
    () => (Array.isArray(apiData) ? apiData : []).map(normalise),
    [apiData]
  );

  const livePrice = useMemo(() => new Map(
    apiRows.map((m: NormRow) => [m.symbol, m])
  ), [apiRows]);

  const globalRows = useMemo(() => Array.from(new Map(
    [
      ...apiRows,
      ...CATS.flatMap(c => getRows(c.id, usdSub, livePrice, favorites, aosPairs, apiRows)),
    ]
      .filter(m => !m.swapOnly || m.price > 0)
      .map((m: NormRow) => [m.symbol, m])
  ).values()), [apiRows, usdSub, livePrice, favorites, aosPairs]);

  let rows = getRows(cat, usdSub, livePrice, favorites, aosPairs, apiRows);

  if (search) {
    rows = globalRows.filter(m => marketMatchesQuery(m.base, m.quote, m.symbol, search));
  }

  rows = [...rows].sort((a, b) => {
    let v = 0;
    if (sortKey === "base")  v = a.base.localeCompare(b.base);
    if (sortKey === "price") v = a.price - b.price;
    if (sortKey === "chg")   v = a.chg - b.chg;
    return sortDir === "asc" ? v : -v;
  });

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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
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
            />
            {search && (
              <button onClick={() => setSearch("")}><X size={12} className="text-muted-foreground" /></button>
            )}
          </div>
        </div>

        {/* Category tabs — replaced by result count pill when searching */}
        {search ? (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 shrink-0">
            <span className="text-[11px] font-bold text-primary bg-primary/15 px-2.5 py-1 rounded-full">
              🔍 All chains · {rows.length} result{rows.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground">Every chain &amp; quote asset</span>
          </div>
        ) : (
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

        {/* BTC Swap Hub banner */}
        {!search && cat === "btc" && (() => {
          const btcSwapCount = rows.filter(m => m.swapOnly).length;
          return btcSwapCount > 0 ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/8 border-b border-orange-500/20 shrink-0">
              <ArrowLeftRight size={12} className="text-orange-400 shrink-0" />
              <span className="text-[11px] font-bold text-orange-400">BTC Swap Hub</span>
              <span className="text-[10px] text-orange-400/70">— {btcSwapCount} coins available</span>
              <span className="ml-auto text-[9px] text-orange-400/50">⚡ auto-routed</span>
            </div>
          ) : null;
        })()}

        {/* BSV Swap Hub banner */}
        {!search && cat === "bsv" && (() => {
          const bsvSwapCount = rows.filter(m => m.swapOnly).length;
          return bsvSwapCount > 0 ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/8 border-b border-yellow-500/20 shrink-0">
              <ArrowLeftRight size={12} className="text-yellow-400 shrink-0" />
              <span className="text-[11px] font-bold text-yellow-400">⚡ BSV Swap Hub</span>
              <span className="text-[10px] text-yellow-400/70">— {bsvSwapCount} coins available</span>
              <span className="ml-auto text-[9px] text-yellow-400/50">auto-routed</span>
            </div>
          ) : null;
        })()}

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
        <div className="flex-1 overflow-y-auto overscroll-contain">
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

                    {/* Pair name + badges */}
                    <button onClick={() => pick(m)} className="flex-1 text-left">
                      <span className={cn("text-[13px] font-semibold", isActive ? "text-primary" : "text-foreground")}>
                        {m.base}
                      </span>
                      <span className="text-[11px] text-muted-foreground">/{m.quote}</span>
                      {m.type === "futures" && (
                        <span className="ml-1 text-[8px] font-bold text-green-400 bg-green-500/15 px-1 py-0.5 rounded">PERP</span>
                      )}
                      {m.swapOnly && (
                        <span className="ml-1 text-[8px] font-bold text-blue-400 bg-blue-500/15 px-1 py-0.5 rounded">AOS</span>
                      )}
                      {isActive && (
                        <span className="ml-1.5 text-[8px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded">●</span>
                      )}
                    </button>

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
        </div>
      </div>
    </>
  );
}
