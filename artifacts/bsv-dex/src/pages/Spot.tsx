import { useParams, Link } from "wouter";
import { CoinLogo } from "@/components/CoinLogo";
import { useSEO } from "@/hooks/useSEO";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders, useCancelOrder, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useStagedMarkets as useGetMarkets } from "@/hooks/useStagedMarkets";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import type { OrderBookFill } from "@/components/trading/OrderBook";
import type { OrderFormFill } from "@/components/trading/OrderForm";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import type { ExternalFlash } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { LetsExchangePanel } from "@/components/LetsExchangePanel";
import { CrossChainSwapPanel } from "@/components/trading/CrossChainSwapPanel";
import { PriceCompareBar } from "@/components/trading/PriceCompareBar";
import { useLetsExchangeCoins } from "@/hooks/useLetsExchangeCoins";
import { usePairPrices } from "@/hooks/usePairPrices";
import { useLetsExchangePairs } from "@/hooks/useLetsExchangePairs";
import { useSSPairs } from "@/hooks/useSSPairs";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades, generateTickerForSymbol, ALL_SPOT_MOCK } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume, marketMatchesQuery } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEscrow } from "@/hooks/useEscrow";
import { checkEscrowDeposit } from "@/lib/escrow";
import { ExternalLink, CheckCircle2, Search, ChevronDown, X, Droplets, TrendingUp, BarChart3, Zap, Building2, ArrowUpDown, ArrowLeftRight, BookOpen, RefreshCw } from "lucide-react";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { AiTradeAnalysis } from "@/components/AiTradeAnalysis";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { VENUE_LABELS, VENUE_COLORS } from "@/lib/venues";
import { useBaseTokenList } from "@/hooks/useBaseTokenList";
import { useBaseTokenPrices } from "@/hooks/useBaseTokenPrices";
import { useZoraCoins } from "@/hooks/useZoraCoins";

type BottomTab = "open" | "history" | "trades" | "liquidity";
// Markets-style category tabs — same structure as the Markets page
type SideTab =
  | "all" | "usd" | "bsv" | "btc" | "eth" | "bnb"
  | "base" | "zora" | "sol" | "le";

const SIDE_TABS: { id: SideTab; label: string; color: string }[] = [
  { id: "all",  label: "All",   color: "text-foreground"  },
  { id: "usd",  label: "USD",   color: "text-blue-400"    },
  { id: "bsv",  label: "⚡BSV", color: "text-yellow-400"  },
  { id: "btc",  label: "BTC",   color: "text-orange-400"  },
  { id: "eth",  label: "ETH",   color: "text-violet-400"  },
  { id: "bnb",  label: "BNB",   color: "text-yellow-500"  },
  { id: "base", label: "BASE",  color: "text-blue-400"    },
  { id: "zora", label: "ZORA",  color: "text-pink-400"    },
  { id: "sol",  label: "SOL",   color: "text-cyan-400"    },
  { id: "le",   label: "LE",    color: "text-yellow-400"  },
];

const STABLES = new Set(["USDT","USDC","DAI","TUSD","USDD","FDUSD","BUSD"]);
function matchSideTab(m: any, tab: SideTab): boolean {
  switch (tab) {
    case "usd":  return STABLES.has(m.quoteAsset);
    case "bsv":  return m.quoteAsset === "BSV";
    case "btc":  return m.quoteAsset === "BTC";
    case "eth":  return m.quoteAsset === "ETH";
    case "bnb":  return m.quoteAsset === "BNB";
    case "base": return String(m.network ?? "") === "base-network";
    case "zora": return String(m.network ?? "") === "zora-network";
    case "sol":  return m.quoteAsset === "SOL" || String(m.network ?? "").includes("sol");
    case "le":   return (m as any).leSource === true || (m as any).type === "letsexchange";
    default:     return true; // "all"
  }
}


// Maps EVM chain ID → SS / LE network-code substrings used to filter pairs
const CHAIN_NET_CODES: Record<number, string[]> = {
  1:       ["eth","erc20"],
  56:      ["bsc","bnb"],
  43114:   ["avaxc","avax"],
  137:     ["matic","polygon"],
  42161:   ["arb"],
  10:      ["op","optimism"],
  8453:    ["base"],
  59144:   ["linea"],
  534352:  ["scroll"],
  1329:    ["sei"],
  324:     ["zksync","zk"],
  250:     ["ftm","fantom"],
  25:      ["cro","cronos"],
  5000:    ["mantle","mnt"],
  100:     ["xdai","gnosis"],
  42220:   ["celo"],
  1284:    ["moonbeam","glmr"],
  146:     ["sonic"],
  81457:   ["blast"],
  34443:   ["mode"],
  288:     ["boba"],
  1088:    ["metis"],
  167000:  ["taiko"],
  // Non-EVM chains — negative pseudo-IDs (never matched by walletChainId)
  [-1]:  ["sol","solana"],
  [-2]:  ["trx","tron"],
  [-3]:  ["xrp","ripple","xrpl"],
  [-4]:  ["ton"],
  [-5]:  ["near"],
  [-6]:  ["sui"],
  [-7]:  ["apt","aptos"],
  [-8]:  ["ada","cardano"],
  [-9]:  ["doge"],
  [-10]: ["ltc","litecoin"],
  [-11]: ["bch"],
  [-12]: ["xlm","stellar"],
  [-13]: ["atom","cosmos"],
  [-14]: ["dot","polkadot"],
  [-15]: ["algo"],
  [-16]: ["xmr","monero"],
};

const CHAIN_PILLS = [
  // ── EVM ──────────────────────────────────────────────────────────────────
  { id: 1,       name: "ETH",      icon: "⟠",  group: "evm" },
  { id: 56,      name: "BNB",      icon: "🟡", group: "evm" },
  { id: 43114,   name: "AVAX",     icon: "🔺", group: "evm" },
  { id: 137,     name: "Polygon",  icon: "🟣", group: "evm" },
  { id: 42161,   name: "Arbitrum", icon: "🔷", group: "evm" },
  { id: 10,      name: "Optimism", icon: "🔴", group: "evm" },
  { id: 8453,    name: "Base",     icon: "🔵", group: "evm" },
  { id: 59144,   name: "Linea",    icon: "⬛", group: "evm" },
  { id: 534352,  name: "Scroll",   icon: "📜", group: "evm" },
  { id: 1329,    name: "Sei",      icon: "🌊", group: "evm" },
  { id: 324,     name: "zkSync",   icon: "⚡", group: "evm" },
  { id: 250,     name: "Fantom",   icon: "👻", group: "evm" },
  { id: 25,      name: "Cronos",   icon: "⬡",  group: "evm" },
  { id: 5000,    name: "Mantle",   icon: "🟢", group: "evm" },
  { id: 100,     name: "Gnosis",   icon: "🦉", group: "evm" },
  { id: 42220,   name: "Celo",     icon: "🌿", group: "evm" },
  { id: 1284,    name: "Moonbeam", icon: "🌙", group: "evm" },
  { id: 146,     name: "Sonic",    icon: "🎵", group: "evm" },
  { id: 81457,   name: "Blast",    icon: "💥", group: "evm" },
  { id: 34443,   name: "Mode",     icon: "◈",  group: "evm" },
  { id: 288,     name: "Boba",     icon: "○",  group: "evm" },
  { id: 1088,    name: "Metis",    icon: "⬡",  group: "evm" },
  { id: 167000,  name: "Taiko",    icon: "🥁", group: "evm" },
  // ── Non-EVM ──────────────────────────────────────────────────────────────
  { id: -1,      name: "Solana",   icon: "◎",  group: "l1"  },
  { id: -2,      name: "Tron",     icon: "⊕",  group: "l1"  },
  { id: -3,      name: "XRP",      icon: "✕",  group: "l1"  },
  { id: -4,      name: "TON",      icon: "💎", group: "l1"  },
  { id: -5,      name: "NEAR",     icon: "Ⓝ",  group: "l1"  },
  { id: -6,      name: "SUI",      icon: "💧", group: "l1"  },
  { id: -7,      name: "Aptos",    icon: "Ⓐ",  group: "l1"  },
  { id: -8,      name: "Cardano",  icon: "₳",  group: "l1"  },
  { id: -9,      name: "DOGE",     icon: "Ð",  group: "l1"  },
  { id: -10,     name: "LTC",      icon: "Ł",  group: "l1"  },
  { id: -11,     name: "BCH",      icon: "₿",  group: "l1"  },
  { id: -12,     name: "Stellar",  icon: "✦",  group: "l1"  },
  { id: -13,     name: "Cosmos",   icon: "⚛",  group: "l1"  },
  { id: -14,     name: "Polkadot", icon: "●",  group: "l1"  },
  { id: -15,     name: "Algorand", icon: "Ⓐ",  group: "l1"  },
  { id: -16,     name: "Monero",   icon: "ɱ",  group: "l1"  },
];

const POOL_MAP: Record<string, { tvl: number; vol24: number; fee: number; farmApr: number }> = {
  "BTC/USDT":  { tvl: 423_600_000, vol24: 98_200_000,  fee: 0.3,  farmApr: 4.2  },
  "ETH/USDT":  { tvl: 187_400_000, vol24: 44_100_000,  fee: 0.3,  farmApr: 6.1  },
  "SOL/USDT":  { tvl: 95_700_000,  vol24: 21_300_000,  fee: 0.3,  farmApr: 8.4  },
  "BSV/USDT":  { tvl: 8_240_000,   vol24: 1_920_000,   fee: 0.2,  farmApr: 18.2 },
  "BNB/USDT":  { tvl: 67_300_000,  vol24: 14_800_000,  fee: 0.3,  farmApr: 5.9  },
  "XRP/USDT":  { tvl: 52_100_000,  vol24: 12_700_000,  fee: 0.3,  farmApr: 7.3  },
  "ADA/USDT":  { tvl: 29_800_000,  vol24: 6_400_000,   fee: 0.3,  farmApr: 9.1  },
  "DOGE/USDT": { tvl: 41_200_000,  vol24: 9_300_000,   fee: 0.25, farmApr: 7.8  },
  "DOT/USDT":  { tvl: 18_600_000,  vol24: 3_900_000,   fee: 0.3,  farmApr: 11.2 },
  "LINK/USDT": { tvl: 22_900_000,  vol24: 5_100_000,   fee: 0.3,  farmApr: 10.1 },
  "BSV/BTC":   { tvl: 4_100_000,   vol24: 980_000,     fee: 0.2,  farmApr: 22.8 },
  "ETH/BTC":   { tvl: 76_500_000,  vol24: 17_200_000,  fee: 0.3,  farmApr: 5.3  },
  "AVAX/USDT": { tvl: 31_400_000,  vol24: 8_200_000,   fee: 0.3,  farmApr: 9.8  },
  "MATIC/USDT":{ tvl: 22_100_000,  vol24: 5_600_000,   fee: 0.3,  farmApr: 10.5 },
};

const CEX_SOURCES: { name: string; share: number; depth: number }[] = [
  { name: "OrahDEX AMM",     share: 42.1, depth: 2.8 },
  { name: "OrahDEX P2P",     share: 24.3, depth: 2.0 },
  { name: "OrahDEX Vault",   share: 16.4, depth: 1.5 },
  { name: "OrahDEX Futures", share: 11.6, depth: 1.2 },
  { name: "OrahDEX Bridge",  share:  5.6, depth: 0.8 },
];

function fmtLiq(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function formatDateTime(value: string | Date) {
  const dt = new Date(value);
  return dt.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getOrderExplorerUrl(order: any): string | null {
  if (order?.explorerUrl) return String(order.explorerUrl);
  if (!order?.txid) return null;
  const txid = String(order.txid);
  if (txid.startsWith("htlc-pending-")) return null;
  return txid.startsWith("0x")
    ? `https://etherscan.io/tx/${txid}`
    : `https://whatsonchain.com/tx/${txid}`;
}

function normalise(m: any) {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  return { ...m, symbol: m.symbol ?? `${base}-${quote}`, baseAsset: base, quoteAsset: quote,
    lastPrice: price, priceChangePercent24h: chg, type };
}

export function SpotTrading() {
  const { symbol: rawSymbol = "BSV-USDT" } = useParams();
  const { address, internalBsvAddress, internalEvmAddress, chainId: walletChainId } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  const { cancelOrder: cancelOrderOnChain, escrowAvailable } = useEscrow();
  // Alt address: Orah wallet users have both a BSV and an EVM address.
  // Orders placed on the BSV network are stored against the BSV address, and
  // orders placed on the EVM network are stored against the EVM address.
  // We must query both so orders don't disappear when the user switches networks.
  const altAddress = (internalEvmAddress && internalEvmAddress !== address)
    ? internalEvmAddress
    : (internalBsvAddress && internalBsvAddress !== address)
      ? internalBsvAddress
      : null;
  const [bottomTab, setBottomTab] = useState<BottomTab>("open");
  const [sideTab, setSideTab] = useState<SideTab>("usd");
  const [candleInterval, setCandleInterval] = useState(() => {
    const saved = localStorage.getItem('orahdex-spot-interval');
    const valid = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','3d','1w','1M','1Y','2Y','5Y','10Y','All'];
    return saved && valid.includes(saved) ? saved : "1h";
  });
  const [marketSearch, setMarketSearch] = useState("");
  const [orderBookFill, setOrderBookFill] = useState<OrderFormFill | null>(null);
  const [obFlash, setObFlash] = useState<ExternalFlash | null>(null);
  const [pairDropOpen, setPairDropOpen] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const [dropChain, setDropChain] = useState<number | null>(null);
  const [hideOtherPairs, setHideOtherPairs] = useState(false);
  const [cancelPairOnly, setCancelPairOnly] = useState(false);
  // Track whether to highlight the LE panel (set when user clicks LE orderbook rows)
  const [lePanelKey, setLePanelKey] = useState(0);
  // Buy/Sell direction for cross-chain swap mode
  const [swapSide, setSwapSide] = useState<"buy" | "sell">("buy");
  const lePanelRef = useRef<HTMLDivElement>(null);
  const pairDropRef = useRef<HTMLDivElement>(null);

  // ── Trade mode: "order" = internal DEX, "swap" = LetsExchange routing ─────
  type TradeMode = "order" | "swap";
  const [tradeMode, setTradeMode] = useState<TradeMode>("order");
  const [tradeModeLockedByUser, setTradeModeLockedByUser] = useState(false);
  const [atomicSwapOpen, setAtomicSwapOpen] = useState(false);



  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pairDropRef.current && !pairDropRef.current.contains(e.target as Node)) {
        setPairDropOpen(false);
        setDropSearch("");
      }
    }
    if (pairDropOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pairDropOpen]);


  // Persist candle interval across page refreshes
  useEffect(() => { localStorage.setItem('orahdex-spot-interval', candleInterval); }, [candleInterval]);

  const handleOrderBookFill = (fill: OrderBookFill) => {
    setOrderBookFill(fill as OrderFormFill);
  };

  // Flash the OrderBook spread row when a trade is placed or LE swap confirmed
  const handleTradeFlash = useCallback((fill: { price: number; side: "buy" | "sell"; source?: "order" | "letsexchange" }) => {
    setObFlash({ price: fill.price, side: fill.side, ts: Date.now(), source: fill.source ?? "order" });
  }, []);

  const handleLeExchangeCreated = useCallback((fill: { price: number; side: "buy" | "sell" }) => {
    handleTradeFlash({ ...fill, source: "letsexchange" });
  }, [handleTradeFlash]);

  // Handle both dash-separated (/trade/BTC-USDT) and URL-encoded slash (/trade/BTC%2FUSDT)
  const decodedRaw = decodeURIComponent(rawSymbol);
  const symbol = decodedRaw.includes('/') ? decodedRaw : decodedRaw.replace(/-/g, '/');
  const [base = '', quote = ''] = symbol.split('/');

  const noStoreRequest = { cache: "no-store" as const };
  const { data: apiTicker }    = useGetTicker(encodeURIComponent(symbol), { request: noStoreRequest });
  const { data: apiCandles }   = useGetCandles(encodeURIComponent(symbol), { interval: candleInterval as any, limit: 300 }, { request: noStoreRequest });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 }, {
    request: noStoreRequest,
    query: { refetchInterval: 4000, staleTime: 2000 } as any,
  });
  const { data: apiTrades }    = useGetRecentTrades(encodeURIComponent(symbol), { limit: 50 }, { request: noStoreRequest });
  const { data: apiOrders, refetch: refetchOrders } = useGetOrders(
    { walletAddress: address || '' },
    { query: { enabled: !!address, refetchInterval: 5000 } as any }
  );
  // Also fetch orders placed under the alternate address (BSV ↔ EVM cross-network)
  const { data: altOrders, refetch: refetchAltOrders } = useGetOrders(
    { walletAddress: altAddress || '' },
    { query: { enabled: !!altAddress, refetchInterval: 5000 } as any }
  );
  const { data: apiMarkets } = useGetMarkets();

  // ── LetsExchange integration ──────────────────────────────────────────────
  const { getCoin: getLECoin, isLECoin } = useLetsExchangeCoins();
  // Server-provided pairs — all LE coins against all supported quote assets.
  // Fetched once per quote tab on demand; falls back to [] while loading.
  const { pairs: lePairs } = useLetsExchangePairs({ all: true });
  // SimpleSwap pairs — additional coins not covered by LE; SS fills gaps, LE wins on overlap.
  const { pairs: ssPairs  } = useSSPairs({ all: true });

  // Full Base chain token catalog + live DexScreener prices (cached 1h / 60s)
  const { data: baseTokenList } = useBaseTokenList(true);
  const basePrices = useBaseTokenPrices(baseTokenList, baseTokenList.length > 0);
  // All Zora coins from Zora Coins API (cached 90s)
  const { data: zoraRows } = useZoraCoins(true);

  // Get primary LE coin entries for the current pair (null if not supported)
  const fromLECoin = useMemo(() => getLECoin(base),  [getLECoin, base]);
  const toLECoin   = useMemo(() => getLECoin(quote), [getLECoin, quote]);

  // Live venue prices for the current pair (LE + SS in one call)
  const { letsexchange: leVenuePrice, simpleswap: ssVenuePrice, bestVenue, loading: pricesLoading } = usePairPrices(
    fromLECoin ? { symbol: fromLECoin.symbol, network: fromLECoin.network } : null,
    toLECoin   ? { symbol: toLECoin.symbol,   network: toLECoin.network   } : null,
  );

  // Derive leRateData shape expected by OrderBook + swap nudge
  const leRateData = leVenuePrice ? {
    rate:       String(leVenuePrice.rate),
    minAmount:  leVenuePrice.minAmount != null ? String(leVenuePrice.minAmount) : "0",
    maxAmount:  leVenuePrice.maxAmount != null ? String(leVenuePrice.maxAmount) : "999999",
    rateId:     null as string | null,
    rateExpiry: null as number | null,
    fromNetwork: fromLECoin?.network ?? fromLECoin?.symbol ?? "",
    toNetwork:   toLECoin?.network   ?? toLECoin?.symbol   ?? "",
  } : null;

  // Callback for OrderBook LE rows — switch to swap mode and remount LE panel
  const handleLeSwap = useCallback(() => {
    setLePanelKey(k => k + 1);
    setTradeMode("swap");
    setTradeModeLockedByUser(true);
  }, []);

  // Real price for catalog tokens (Base chain DexScreener / Zora Coins API / LE-SS rate)
  // Used when the API has no stored ticker for the pair.
  // Priority: DexScreener live price → Zora Coins API → LE exchange rate → SS exchange rate
  const catalogPrice = useMemo(() => {
    const dp = basePrices.get(base);
    if (dp?.price > 0) return { price: dp.price, chg: dp.chg };
    const zr = (zoraRows ?? []).find((z: any) => z.base === base);
    if (zr?.price > 0) return { price: zr.price, chg: zr.chg ?? 0 };
    // LE/SS rate: "rate" = how many quote tokens you receive per 1 base token (= price in quote)
    const leRate = Number(leVenuePrice?.rate);
    if (leRate > 0) return { price: leRate, chg: 0 };
    const ssRate = Number(ssVenuePrice?.rate);
    if (ssRate > 0) return { price: ssRate, chg: 0 };
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, basePrices, zoraRows, leVenuePrice, ssVenuePrice]);

  const _genTicker = generateTickerForSymbol(base, quote);
  const ticker     = (apiTicker?.lastPrice && apiTicker.lastPrice > 0 ? apiTicker : null)
    ?? MOCK_TICKER[rawSymbol]
    ?? (catalogPrice
      ? { ..._genTicker, lastPrice: catalogPrice.price,
          priceChangePercent: catalogPrice.chg, priceChangePercent24h: catalogPrice.chg }
      : _genTicker);
  const isPositive = (ticker.priceChangePercent ?? ticker.priceChangePercent24h ?? 0) >= 0;

  /* ── Cross-rate: USD equivalent of the quoted price ── */
  const { prices: crossRates } = useWalletPrices();
  const STABLES = new Set(["USDT", "USDC", "TUSD", "USDD", "FDUSD", "BUSD", "DAI"]);
  const QUOTE_TO_USD: Record<string, number> = {
    USDT: 1, USDC: 1, TUSD: 1, USDD: 1, FDUSD: 1, BUSD: 1, DAI: 1,
    BTC:  crossRates.BTC?.usd  || 83000,
    ETH:  crossRates.ETH?.usd  || 2400,
    BSV:  crossRates.BSV?.usd  || 14,
    BNB: 580, BCH: 320, SOL: 130, MATIC: 0.32,
    AVAX: 18, ARB: 0.42, OP: 0.70, FTM: 0.51, CRO: 0.085, TRX: 0.24,
  };
  const isStableQuote  = STABLES.has(quote);
  const quoteMultiplier = QUOTE_TO_USD[quote] ?? 1;
  const priceInUsd     = ticker.lastPrice * quoteMultiplier;
  /* For stablecoin pairs the price IS the USD price, so just show $price.
     For cross-rate pairs show the approximate USD equivalent. */
  const usdEquivalent  = isStableQuote
    ? `$${formatPrice(ticker.lastPrice)}`
    : `≈$${formatPrice(priceInUsd)}`;

  /* ── SEO + live browser-tab title (price in title so it updates as price changes) ── */
  const seoJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `${base}/${quote} Spot Trading on OrahDEX`,
    "description": `Live ${base}/${quote} spot trading with real-time charts and order book`,
    "url": `https://orahdex.org/trade/${rawSymbol}`
  }), [base, quote, rawSymbol]);

  const priceSign = ticker.priceChangePercent >= 0 ? "▲" : "▼";
  useSEO({
    title: `${priceSign} ${formatPrice(ticker.lastPrice)} | ${base}/${quote}`,
    description: `Trade ${base}/${quote} on OrahDEX spot market. Real-time price chart, order book, and depth data. Place limit, market, and stop orders instantly.`,
    keywords: `${base} ${quote} trading, ${base} price, buy ${base}, sell ${base}, ${rawSymbol} spot, OrahDEX spot`,
    url: `/trade/${rawSymbol}`,
    jsonLd: seoJsonLd,
  });

  const candles    = (apiCandles && apiCandles.length > 0) ? apiCandles : generateMockCandles(ticker.lastPrice);
  const trades     = (Array.isArray(apiTrades) && apiTrades.length > 0) ? apiTrades : generateMockTrades(ticker.lastPrice);

  function toEntries(raw: number[][], descending: boolean) {
    const sorted = [...raw].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
    let cum = 0;
    return sorted.map(([p, q]) => { cum += p * q; return { price: p, quantity: q, total: cum }; });
  }
  const rawOB = apiOrderBook as any;
  // Bridge pairs (LE/SS) return isBridgePair:true with empty bids/asks —
  // they should route to the swap panel, not the DEX order form.
  const isBridgePair = rawOB?.isBridgePair === true;
  const hasRealOB = !isBridgePair && (rawOB?.bids?.length > 0 || rawOB?.asks?.length > 0);

  // Auto-switch trade mode based on liquidity, unless the user manually picked.
  // Bridge pairs always auto-route to swap mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tradeModeLockedByUser) {
      setTradeMode((hasRealOB && !isBridgePair) ? "order" : "swap");
    }
  }, [hasRealOB, isBridgePair, symbol]); // reset on symbol change too

  // When pair changes, unlock user preference so auto-routing kicks in fresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTradeModeLockedByUser(false); }, [symbol]);

  // Unified bridge rate passed to OrderBook: LE wins, SS is fallback.
  // This drives the virtual order book levels and the swap CTA.
  const ssRateData = ssVenuePrice ? {
    rate:      String(ssVenuePrice.rate),
    minAmount: ssVenuePrice.minAmount != null ? String(ssVenuePrice.minAmount) : "0",
    maxAmount: ssVenuePrice.maxAmount != null ? String(ssVenuePrice.maxAmount) : "999999",
  } : null;
  const bridgeRate     = leRateData ?? ssRateData;
  const bridgeProvider = leRateData ? "letsexchange" : ssVenuePrice ? "simpleswap" : null;

  // Build the order book data passed to the OrderBook component:
  //   - Bridge pair WITH live rate  → empty bids/asks; OrderBook renders bridge levels from leRate
  //   - Bridge pair WITHOUT rate yet → fall back to mock visual so depth isn't blank during loading
  //   - Standard pair with real orders → toEntries (raw [price,qty] tuples) or apiOrderBook
  //   - Standard pair with no orders  → generateMockOrderBook for visual depth
  const orderBook = (() => {
    if (isBridgePair && bridgeRate) return { bids: [], asks: [] };
    if (hasRealOB && Array.isArray(rawOB.bids[0])) return { bids: toEntries(rawOB.bids, true), asks: toEntries(rawOB.asks, false) };
    if (hasRealOB) return apiOrderBook;
    return generateMockOrderBook(ticker.lastPrice);
  })() as import("@workspace/api-client-react").OrderBook;

  const queryClient = useQueryClient();
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

  // Optimistic cancel: immediately mark order as cancelled in cache so the user
  // sees the change on the first click; refetch afterward to reconcile.
  const cancelOrder = useMutation({
    mutationFn: async ({ orderId, walletAddress: ownerWallet }: { orderId: string; walletAddress: string }) => {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      // Step 1: If the order has an active on-chain escrow deposit, cancel it
      // first so the user's funds are returned to their wallet before we remove
      // the order from the orderbook.
      if (escrowAvailable && walletChainId) {
        let hasDeposit = false;
        try {
          const dep = await Promise.race([
            checkEscrowDeposit(orderId, walletChainId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
          ]);
          hasDeposit = !!dep && !dep.released;
        } catch { /* RPC failure — skip on-chain cancel, let user retry */ }

        if (hasDeposit) {
          try {
            await cancelOrderOnChain(orderId);
          } catch (e: any) {
            const msg = String(e?.message ?? "").toLowerCase();
            const isMissingDeposit =
              msg.includes("no deposit") ||
              msg.includes("already settled") ||
              msg.includes("already released");
            if (!isMissingDeposit) throw e;
          }
        }
      }
      // Step 2: Tell the server to remove the order from the orderbook.
      const res = await fetch(`${baseUrl}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ownerWallet }),
      });
      // 404 = already cancelled — treat as success.
      if (res.status === 404) return { id: orderId, status: "cancelled" };
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to cancel order");
      return res.json();
    },
    onMutate: async ({ orderId }) => {
      setCancellingIds(prev => { const n = new Set(prev); n.add(orderId); return n; });
      const keys = [
        getGetOrdersQueryKey({ walletAddress: address || "" }),
        ...(altAddress ? [getGetOrdersQueryKey({ walletAddress: altAddress })] : []),
      ];
      await Promise.all(keys.map(k => queryClient.cancelQueries({ queryKey: k })));
      const snapshots = keys.map(k => [k, queryClient.getQueryData(k)] as const);
      keys.forEach(k => {
        queryClient.setQueryData(k, (old: any) =>
          Array.isArray(old)
            ? old.map((o: any) => String(o.id) === orderId ? { ...o, status: "cancelled" } : o)
            : old
        );
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
    },
    onSettled: (_d, _e, vars) => {
      setCancellingIds(prev => { const n = new Set(prev); n.delete(vars.orderId); return n; });
      // Invalidate in the background — the optimistic update already shows the
      // correct state; a hard refetch would cause an unnecessary network round-trip
      // and a visible list flicker. The 5-second polling interval will sync normally.
      queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey({ walletAddress: address || "" }), refetchType: "none" });
      if (altAddress) queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey({ walletAddress: altAddress }), refetchType: "none" });
    },
  });

  // Merge orders from both addresses, deduplicated by id, so BSV-network orders
  // remain visible even when the user's active network is EVM (and vice versa).
  const allOrders = useMemo(() => {
    const primary = (apiOrders as any[]) || [];
    const alt     = (altOrders  as any[]) || [];
    const seen    = new Set<string>();
    return [...primary, ...alt].filter(o => {
      const key = String(o.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [apiOrders, altOrders]);
  const openOrders   = allOrders.filter((o: any) => o.status === "open");
  const filledOrders = allOrders.filter((o: any) => o.status === "filled" || o.status === "cancelled");

  // Market list for pair selector — base is the full mock catalogue (all chains/quotes)
  // then API data replaces any matching pair with live data.
  // Then server-provided LetsExchange pairs are merged in (API wins over LE).
  const allMarkets = useMemo(() => {
    const apiNorm = ((apiMarkets && (apiMarkets as any[]).length > 0) ? (apiMarkets as any[]) : [])
      .map(normalise)
      .filter(m => m.type === "spot");
    const mockNorm = ALL_SPOT_MOCK.map(normalise);
    // deduplicate: API wins on price, mock fills the rest.
    // If API returns exactly 0 change (unseeded pair), prefer the mock's realistic change.
    const deduped = new Map<string, ReturnType<typeof normalise>>();
    mockNorm.forEach(m => { if (!deduped.has(m.symbol)) deduped.set(m.symbol, m); });
    apiNorm.forEach(m => {
      const mock = deduped.get(m.symbol);
      const chg = m.priceChangePercent24h !== 0
        ? m.priceChangePercent24h
        : (mock?.priceChangePercent24h ?? 0);
      deduped.set(m.symbol, { ...m, priceChangePercent24h: chg });
    });

    // Merge server-provided LE pairs — skip pairs that already exist natively
    lePairs.forEach(p => {
      if (!deduped.has(p.symbol)) {
        deduped.set(p.symbol, normalise(p as any));
      }
    });

    // Merge SimpleSwap pairs — only fills gaps not covered by native or LE
    ssPairs.forEach(p => {
      if (!deduped.has(p.symbol)) {
        deduped.set(p.symbol, normalise(p as any));
      }
    });

    // Merge all Base chain catalog tokens (CoinGecko list + DexScreener prices)
    baseTokenList.forEach(t => {
      const sym = `${t.symbol}/USDC`;
      if (!deduped.has(sym)) {
        const dp = basePrices.get(t.symbol);
        deduped.set(sym, normalise({
          symbol: sym, baseAsset: t.symbol, quoteAsset: "USDC",
          lastPrice: dp?.price ?? 0, priceChangePercent24h: dp?.chg ?? 0,
          network: "base-network", type: "spot",
        }));
      }
    });

    // Merge all Zora coins
    zoraRows.forEach(z => {
      if (!deduped.has(z.symbol)) {
        deduped.set(z.symbol, normalise({
          symbol: z.symbol, baseAsset: z.base, quoteAsset: z.quote,
          lastPrice: z.price, priceChangePercent24h: z.chg,
          network: "zora-network", type: "spot",
        }));
      }
    });

    return Array.from(deduped.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMarkets, lePairs, ssPairs, baseTokenList, basePrices, zoraRows]);

  const currentMarket = useMemo(
    () => allMarkets.find(m => m.baseAsset === base && m.quoteAsset === quote) ?? null,
    [allMarkets, base, quote]
  );

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim();
    if (q) return allMarkets.filter(m => marketMatchesQuery(m.baseAsset, m.quoteAsset, m.symbol, q));
    return allMarkets.filter(m => matchSideTab(m, sideTab));
  }, [allMarkets, sideTab, marketSearch]);

  // Single shared chain-filtered view — both quoteCounts and dropFiltered read
  // from here so the chain-matching loop runs exactly once per chain/data change.
  const chainMarkets = useMemo(() => {
    if (!dropChain) return allMarkets;
    const codes = CHAIN_NET_CODES[dropChain] ?? [];
    return allMarkets.filter(m => {
      const net = String((m as any).network ?? "").toLowerCase();
      return !net || codes.some(c => net.includes(c)); // no-network → always in
    });
  }, [allMarkets, dropChain]);

  // Count per SideTab so only non-empty tabs are shown
  const sideCounts = useMemo(() => {
    const counts: Record<SideTab, number> = {} as any;
    for (const t of SIDE_TABS) counts[t.id] = 0;
    for (const m of chainMarkets) {
      for (const t of SIDE_TABS) {
        if (t.id !== "all" && matchSideTab(m, t.id)) counts[t.id]++;
      }
    }
    counts["all"] = chainMarkets.length;
    return counts;
  }, [chainMarkets]);

  const dropFiltered = useMemo(() => {
    const q = dropSearch.trim();
    const base = q
      ? chainMarkets.filter(m => marketMatchesQuery(m.baseAsset, m.quoteAsset, m.symbol, q))
      : chainMarkets.filter(m => matchSideTab(m, sideTab));

    // Sort: native DEX first (real liquidity), then LE, then SS, all by volume → lastPrice
    return [...base].sort((a, b) => {
      const aExt = (a as any).leSource === true || (a as any).ssSource === true;
      const bExt = (b as any).leSource === true || (b as any).ssSource === true;
      if (!aExt && bExt) return -1;
      if (aExt && !bExt) return 1;
      const aLE = (a as any).leSource === true;
      const bLE = (b as any).leSource === true;
      if (aLE && !bLE) return -1;
      if (!aLE && bLE) return 1;
      const volDiff = ((b as any).volume ?? 0) - ((a as any).volume ?? 0);
      if (volDiff !== 0) return volDiff;
      return ((b as any).lastPrice ?? 0) - ((a as any).lastPrice ?? 0);
    });
  }, [chainMarkets, sideTab, dropSearch]);

  return (
    <>
    <div className="flex flex-col h-[calc(100vh-5.75rem)] bg-background overflow-hidden">
      {/* Ticker Header */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-card shrink-0">
        {/* Pair selector trigger + dropdown */}
        <div className="relative shrink-0" ref={pairDropRef}>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => { setPairDropOpen(v => { if (!v) { setDropSearch(""); } return !v; }); }}
              className="flex items-center gap-2 group"
            >
              {/* Overlapping base + quote logos */}
              <div className="flex items-center shrink-0">
                <CoinLogo symbol={base} size={26} ring />
                <CoinLogo symbol={quote} size={20} ring className="-ml-2" />
              </div>
              <h1 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                {base}/{quote}
              </h1>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground group-hover:text-primary transition-all",
                pairDropOpen && "rotate-180"
              )} />
            </button>
            <ContractAddressBadge
              baseAsset={base}
              dbAddresses={(currentMarket as any)?.contractAddresses}
              variant="full"
            />
          </div>

          {/* Dropdown panel */}
          {pairDropOpen && (
            <div className="absolute top-full left-0 mt-2 w-[340px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
                <span className="text-xs font-semibold text-foreground">Choose a trading pair</span>
                <button onClick={() => setPairDropOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Search */}
              <div className="px-3 py-2 border-b border-border shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search by coin, name or chain (e.g. APE, ethereum, ETH)…"
                    value={dropSearch}
                    onChange={e => setDropSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/60 border border-border rounded-lg outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              {/* Category tabs — same categories as Markets page */}
              {dropSearch.trim() ? (
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
                  <span className="text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                    🔍 All markets · {dropFiltered.length} result{dropFiltered.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[9px] text-muted-foreground">Searching every chain &amp; quote</span>
                </div>
              ) : (
                <div className="flex gap-0.5 px-3 py-1.5 border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
                  {SIDE_TABS.filter(t => sideCounts[t.id] > 0).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSideTab(t.id)}
                      className={cn(
                        "shrink-0 px-2.5 py-0.5 rounded text-[10px] font-bold transition-all",
                        sideTab === t.id
                          ? "bg-primary/15 text-primary"
                          : `${t.color} opacity-70 hover:opacity-100`
                      )}
                    >
                      {t.label}
                      <span className="ml-1 text-[9px] opacity-50">{sideCounts[t.id]?.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Chain filter row — EVM chains + major L1s */}
              {!dropSearch.trim() && (
                <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => setDropChain(null)}
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded text-[10px] font-bold transition-all whitespace-nowrap",
                      dropChain === null ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All chains
                  </button>
                  {/* EVM chains */}
                  {CHAIN_PILLS.filter(c => c.group === "evm").map(c => (
                    <button
                      key={c.id}
                      onClick={() => setDropChain(prev => prev === c.id ? null : c.id)}
                      className={cn(
                        "shrink-0 px-2 py-0.5 rounded text-[10px] font-bold transition-all whitespace-nowrap",
                        dropChain === c.id
                          ? "bg-primary/15 text-primary"
                          : (walletChainId === c.id ? "text-yellow-400 hover:text-foreground" : "text-muted-foreground hover:text-foreground")
                      )}
                      title={c.name}
                    >
                      {c.icon} {c.name}
                    </button>
                  ))}
                  {/* Divider between EVM and L1 groups */}
                  <span className="shrink-0 w-px h-3 bg-border/60 mx-0.5 self-center" />
                  {/* Non-EVM L1 chains */}
                  {CHAIN_PILLS.filter(c => c.group === "l1").map(c => (
                    <button
                      key={c.id}
                      onClick={() => setDropChain(prev => prev === c.id ? null : c.id)}
                      className={cn(
                        "shrink-0 px-2 py-0.5 rounded text-[10px] font-bold transition-all whitespace-nowrap",
                        dropChain === c.id
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title={c.name}
                    >
                      {c.icon} {c.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Column headers */}
              <div className="flex items-center px-3 py-1 text-[9px] font-medium text-muted-foreground border-b border-border/50 shrink-0">
                <span className="flex-1">Pair</span>
                <span className="w-20 text-right">Price</span>
                <span className="w-14 text-right">24h %</span>
              </div>
              {/* Pair list — all LE pairs rendered; container is scroll-bounded */}
              <div className="overflow-y-auto max-h-64 min-h-0">
                {dropFiltered.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">No pairs found</div>
                ) : (
                  dropFiltered.map(m => {
                    const urlSymbol = m.symbol.replace('/', '-');
                    const isActive = m.symbol === symbol;
                    const isUp = m.priceChangePercent24h >= 0;
                    const isLEPair  = (m as any).leSource  === true || (m as any).type === "letsexchange";
                    const isSsPair  = (m as any).ssSource  === true || (m as any).type === "simpleswap";
                    const isBridge  = !isLEPair && !isSsPair
                      ? false
                      : new Set(["ETH","WETH","BNB","MATIC","POL","AVAX","SEI","WBTC","ARB","OP","MNT","LINK","UNI","DAI","USDC","USDT","CRO","ZK"]).has(m.baseAsset.toUpperCase());
                    const isExternal = isLEPair || isSsPair;
                    return (
                      <Link
                        key={m.symbol}
                        href={`/trade/${urlSymbol}`}
                        onClick={() => { setPairDropOpen(false); setDropSearch(""); }}
                        className={cn(
                          "flex items-center px-3 py-2 gap-2.5 hover:bg-white/5 cursor-pointer transition-colors",
                          isActive && "bg-primary/10 border-l-2 border-l-primary"
                        )}
                      >
                        <CoinLogo symbol={m.baseAsset} size={24} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">{m.baseAsset}</span>
                            <span className="text-[10px] text-muted-foreground">/{m.quoteAsset}</span>
                            {isLEPair && (
                              <span className="text-[8px] px-1 py-px rounded bg-yellow-500/20 text-yellow-400 font-bold leading-none">⚡ LE</span>
                            )}
                            {isSsPair && (
                              <span className="text-[8px] px-1 py-px rounded bg-blue-500/20 text-blue-400 font-bold leading-none">SS</span>
                            )}
                            {isBridge && (
                              <span className="text-[8px] px-1 py-px rounded bg-purple-500/20 text-purple-400 font-bold leading-none">🌉</span>
                            )}
                          </div>
                        </div>
                        <span className="w-20 text-right text-[11px] font-mono text-foreground tabular-nums">
                          {isExternal && m.lastPrice === 0 ? "—" : formatPrice(m.lastPrice)}
                        </span>
                        <span className={cn(
                          "w-14 text-right text-[10px] font-bold tabular-nums",
                          isUp ? "text-buy" : "text-sell"
                        )}>
                          {isExternal && m.priceChangePercent24h === 0 ? "—" : `${isUp ? "+" : ""}${m.priceChangePercent24h.toFixed(2)}%`}
                        </span>
                      </Link>
                    );
                  })
                )}
                {dropFiltered.length > 0 && !dropSearch.trim() && (
                  <div className="flex items-center justify-center gap-1.5 py-2 border-t border-border/50 bg-secondary/20">
                    <span className="text-[10px] text-muted-foreground">
                      {dropFiltered.length.toLocaleString()} pairs · search to filter
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col">
          <span className={cn("text-lg font-mono font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
            {formatPrice(ticker.lastPrice)}
          </span>
          <span className="text-xs text-muted-foreground font-mono mt-1">{usdEquivalent}</span>
        </div>

        <div className="hidden sm:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Change</span>
          <span className={cn("text-sm font-mono mt-0.5", isPositive ? "text-buy" : "text-sell")}>
            {formatPercent(ticker.priceChangePercent)}
          </span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h High</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.highPrice)}</span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Low</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.lowPrice)}</span>
        </div>

        <div className="hidden lg:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Vol({symbol.split('-')[0]})</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatVolume(ticker.volume)}</span>
        </div>

        {/* BSV Settlement Badge — always visible, since all trades settle on BSV */}
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/25 rounded-xl shrink-0">
          <span className="text-sm leading-none animate-pulse">⚡</span>
          <div className="hidden sm:block">
            <p className="text-[10px] font-black text-green-400 uppercase tracking-wider leading-tight">BSV Settlement</p>
            <p className="text-[9px] text-green-300/60 leading-tight">Fastest · &lt;5s · ~$0.001</p>
          </div>
          <span className="sm:hidden text-[10px] font-bold text-green-400">BSV</span>
        </div>
      </div>

      {/* Price comparison bar — orderbook / LetsExchange / SimpleSwap */}
      <PriceCompareBar
        base={base}
        quote={quote}
        orderbookPrice={ticker.lastPrice}
        lePrice={leVenuePrice ?? null}
        ssPrice={ssVenuePrice ?? null}
        bestVenue={bestVenue ?? null}
        loading={pricesLoading}
      />

      {/* Main Trading Area — Poloniex-style: Pairs | Chart | OrderBook+Form */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Market Pairs Sidebar — same categories as Markets page */}
        <div className="hidden xl:flex w-[185px] shrink-0 border-r border-border flex-col min-h-0 bg-card">
          {/* Search */}
          <div className="px-2 py-1.5 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={marketSearch}
                onChange={e => setMarketSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-[10px] bg-secondary/60 border border-border rounded outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-border shrink-0">
            {SIDE_TABS.filter(t => sideCounts[t.id] > 0).map(t => (
              <button
                key={t.id}
                onClick={() => { setSideTab(t.id); setMarketSearch(""); }}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold transition-all whitespace-nowrap",
                  sideTab === t.id
                    ? "bg-primary/15 text-primary"
                    : `${t.color} opacity-60 hover:opacity-100`
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Column headers */}
          <div className="flex items-center px-2 py-0.5 text-[8px] font-medium text-muted-foreground border-b border-border/50 shrink-0">
            <span className="flex-1">Pair</span>
            <span className="w-16 text-right">Price</span>
            <span className="w-10 text-right">24h%</span>
          </div>
          {/* Pair list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredMarkets.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground">No pairs</div>
            ) : (
              filteredMarkets.map(m => {
                const urlSym = m.symbol.replace('/', '-');
                const isActive = m.symbol === symbol;
                const isUp = m.priceChangePercent24h >= 0;
                const isBase = String((m as any).network ?? "") === "base-network";
                const isZora = String((m as any).network ?? "") === "zora-network";
                return (
                  <Link
                    key={m.symbol}
                    href={`/trade/${urlSym}`}
                    className={cn(
                      "flex items-center px-2 py-1.5 gap-1.5 hover:bg-white/5 cursor-pointer transition-colors border-b border-border/20",
                      isActive && "bg-primary/10 border-l-2 border-l-primary"
                    )}
                  >
                    <CoinLogo symbol={m.baseAsset} size={18} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-0.5 flex-wrap">
                        <span className="text-[10px] font-semibold text-foreground truncate">{m.baseAsset}</span>
                        {isBase && <span className="text-[7px] px-0.5 rounded bg-blue-500/20 text-blue-400 font-bold leading-none">B</span>}
                        {isZora && <span className="text-[7px] px-0.5 rounded bg-pink-500/20 text-pink-400 font-bold leading-none">Z</span>}
                      </div>
                      <div className="text-[8px] text-muted-foreground">/{m.quoteAsset}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-foreground tabular-nums">
                        {m.lastPrice > 0 ? formatPrice(m.lastPrice) : "—"}
                      </div>
                      <div className={cn("text-[8px] font-bold tabular-nums", isUp ? "text-buy" : "text-sell")}>
                        {m.priceChangePercent24h !== 0
                          ? `${isUp ? "+" : ""}${m.priceChangePercent24h.toFixed(1)}%`
                          : "—"}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
            <div className="py-2 text-center text-[8px] text-muted-foreground">
              {filteredMarkets.length.toLocaleString()} pairs
            </div>
          </div>
        </div>

        {/* CENTER: Chart & Bottom Tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border-b border-border relative min-h-0" style={{ minHeight: "320px" }}>
            <Chart
              symbol={symbol}
              interval={candleInterval}
              onIntervalChange={setCandleInterval}
              data={candles}
            />
          </div>
          <div className="h-[220px] shrink-0 bg-card flex flex-col border-t border-border">
            {/* Tab bar + controls row */}
            <div className="flex items-center justify-between px-2 border-b border-border shrink-0">
              <div className="flex gap-0">
                {([
                  { key: "open",      label: `Open Orders(${openOrders.length})` },
                  { key: "history",   label: `Order History(${filledOrders.length})` },
                  { key: "trades",    label: "Trade History" },
                  { key: "liquidity", label: "Liquidity & CEX" },
                ] as { key: BottomTab; label: string }[]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setBottomTab(t.key)}
                    className={cn(
                      "py-2 px-3 border-b-2 transition-colors whitespace-nowrap text-[11px] font-medium",
                      bottomTab === t.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Right controls */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                {bottomTab === "open" && openOrders.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                    <input
                      type="checkbox"
                      checked={cancelPairOnly}
                      onChange={e => setCancelPairOnly(e.target.checked)}
                      className="w-3 h-3 accent-primary"
                    />
                    Cancel orders of the current trading pair
                  </label>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={hideOtherPairs}
                    onChange={e => setHideOtherPairs(e.target.checked)}
                    className="w-3 h-3 accent-primary"
                  />
                  Hide Other Pairs
                </label>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {/* ── Open Orders ── */}
              {bottomTab === "open" && (() => {
                const rows = hideOtherPairs
                  ? openOrders.filter((o: any) => o.symbol === symbol)
                  : openOrders;
                return rows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {address ? "No open orders." : "Log in or connect wallet to view open orders."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Date & Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium text-right">Filled</th>
                        <th className="px-3 py-1.5 font-medium text-right">Unfilled</th>
                        <th className="px-3 py-1.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((o: any, i: number) => {
                        const qty = Number(o.quantity);
                        const filled = Number(o.filledQuantity ?? 0);
                        const unfilled = Math.max(0, qty - filled);
                        const total = Number(o.price ?? 0) * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="px-3 py-1.5 text-right">{formatPrice(o.price)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{filled.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right">{unfilled.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => {
                                  const id = String(o.id);
                                  if (cancellingIds.has(id)) return;
                                  cancelOrder.mutate({ orderId: id, walletAddress: String(o.walletAddress || address || "") });
                                }}
                                disabled={cancellingIds.has(String(o.id))}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all disabled:opacity-40"
                              >
                                {cancellingIds.has(String(o.id)) ? "…" : "Cancel"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Order History ── */}
              {bottomTab === "history" && (() => {
                const rows = hideOtherPairs
                  ? filledOrders.filter((o: any) => o.symbol === symbol)
                  : filledOrders;
                return rows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {!address ? "Log in or connect wallet to view order history." : "No completed orders yet."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Date & Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium">Status</th>
                        <th className="px-3 py-1.5 font-medium">Tx / ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((o: any, i: number) => {
                        const qty = Number(o.quantity);
                        const total = Number(o.price ?? 0) * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{formatDateTime(o.updatedAt ?? o.createdAt)}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="px-3 py-1.5 text-right">{formatPrice(o.price)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5">
                              {String(o.txid ?? "").startsWith("htlc-pending-") ? (
                                <span className="capitalize font-semibold text-[10px] text-amber-400 flex items-center gap-0.5">
                                  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                  Settling
                                </span>
                              ) : (
                                <span className={cn("capitalize font-semibold text-[10px]", o.status === "filled" ? "text-buy" : "text-muted-foreground")}>{o.status}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">#{String(o.id).slice(0, 8)}</span>
                                {o.txid && getOrderExplorerUrl(o) ? (
                                  <a href={getOrderExplorerUrl(o)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="text-[10px] font-mono">{o.txid.slice(0, 12)}…</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Trade History (user's own filled orders) ── */}
              {bottomTab === "trades" && (() => {
                const myTrades = (hideOtherPairs
                  ? filledOrders.filter((o: any) => o.symbol === symbol)
                  : filledOrders
                ).filter((o: any) => o.status === "filled");
                return myTrades.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {!address ? "Log in or connect wallet to view trade history." : "No filled trades yet. Place an order to get started."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Fill Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium">Tx / ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {myTrades.slice(0, 50).map((o: any, i: number) => {
                        const qty   = Number(o.quantity);
                        const px    = Number(o.price ?? 0);
                        const total = px * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{formatDateTime(o.updatedAt ?? o.createdAt)}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className={cn("px-3 py-1.5 text-right font-mono", o.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(px)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">#{String(o.id).slice(0, 8)}</span>
                                {o.txid && getOrderExplorerUrl(o) ? (
                                  <a href={getOrderExplorerUrl(o)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="text-[10px] font-mono">{o.txid.slice(0, 12)}…</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">pending</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Liquidity & CEX Panel ── */}
              {bottomTab === "liquidity" && (() => {
                const bids = (orderBook as any).bids ?? [];
                const asks = (orderBook as any).asks ?? [];
                const bidWall = bids.reduce((s: number, b: any) => s + (b.price * b.quantity), 0);
                const askWall = asks.reduce((s: number, a: any) => s + (a.price * a.quantity), 0);
                const bestBid = bids[0]?.price ?? 0;
                // asks are sorted ascending (lowest first) — index 0 is the best (cheapest) ask
                const bestAsk = asks[0]?.price ?? 0;
                const spread = bestAsk > bestBid ? bestAsk - bestBid : 0;
                const midPrice = (bestBid + bestAsk) / 2;
                const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;
                const pool = POOL_MAP[symbol] ?? null;
                const dexVol24 = pool?.vol24 ?? (ticker.quoteVolume ?? 0);
                const dexTvl = pool?.tvl ?? (bidWall + askWall);
                const poolApr = pool ? ((pool.vol24 * (pool.fee / 100)) / pool.tvl) * 365 * 100 : 0;
                const totalCexVol = dexVol24 * 26; // DEX ~4% of total market
                return (
                  <div className="h-full overflow-y-auto">
                    <div className="p-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                      {/* Order Book Depth */}
                      <div className="col-span-2 md:col-span-4 xl:col-span-8">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <BarChart3 className="w-3 h-3" /> Live Order Book Depth
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-buy/5 border border-buy/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Buy Wall (Bids)</p>
                            <p className="text-sm font-mono font-bold text-buy">{fmtLiq(bidWall)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{bids.length} bid levels</p>
                          </div>
                          <div className="bg-sell/5 border border-sell/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Sell Wall (Asks)</p>
                            <p className="text-sm font-mono font-bold text-sell">{fmtLiq(askWall)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{asks.length} ask levels</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Bid-Ask Spread</p>
                            <p className="text-sm font-mono font-bold text-foreground">{spread > 0 ? `$${spread.toFixed(4)}` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{spreadPct.toFixed(3)}% of mid</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">24h Volume</p>
                            <p className="text-sm font-mono font-bold text-foreground">{fmtLiq(ticker.quoteVolume ?? dexVol24)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{formatVolume(ticker.volume ?? 0)} {base}</p>
                          </div>
                        </div>
                      </div>
                      {/* DEX Pool Section */}
                      <div className="col-span-2 md:col-span-2 xl:col-span-4">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 mt-2">
                          <Droplets className="w-3 h-3 text-primary" /> DEX Liquidity Pool — {symbol}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool TVL</p>
                            <p className="text-sm font-mono font-bold text-primary">{fmtLiq(dexTvl)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Total Value Locked</p>
                          </div>
                          <div className="bg-green-400/5 border border-green-400/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool APR</p>
                            <p className="text-sm font-mono font-bold text-green-400">{pool ? `${poolApr.toFixed(1)}%` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">LP fee income</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool Fee</p>
                            <p className="text-sm font-mono font-bold text-foreground">{pool ? `${pool.fee}%` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">per trade</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">24h Pool Vol</p>
                            <p className="text-sm font-mono font-bold text-foreground">{fmtLiq(dexVol24)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">LP earnings: {fmtLiq(dexVol24 * ((pool?.fee ?? 0.3) / 100) * (5 / 6))}</p>
                          </div>
                        </div>
                      </div>
                      {/* CEX Market Share */}
                      <div className="col-span-2 md:col-span-2 xl:col-span-4">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 mt-2">
                          <Building2 className="w-3 h-3 text-blue-400" /> CEX Market Liquidity
                        </p>
                        <div className="space-y-1.5">
                          {CEX_SOURCES.map(cex => {
                            const vol = totalCexVol * (cex.share / 100);
                            const isOrah = cex.name === "OrahDEX";
                            return (
                              <div key={cex.name} className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[10px] font-semibold w-20 shrink-0",
                                  isOrah ? "text-primary" : "text-foreground"
                                )}>{cex.name}</span>
                                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all", isOrah ? "bg-primary" : "bg-blue-400/60")}
                                    style={{ width: `${cex.share}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{cex.share}%</span>
                                <span className="text-[10px] font-mono text-foreground w-16 text-right">{fmtLiq(vol)}</span>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between pt-1 border-t border-border mt-2">
                            <span className="text-[10px] text-muted-foreground">Est. Total Market</span>
                            <span className="text-[10px] font-mono font-bold text-foreground">{fmtLiq(totalCexVol)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* CENTER-RIGHT: Order Book + Market Trades */}
        <div className="hidden lg:flex w-[240px] xl:w-[260px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          <OrderBook
            data={orderBook}
            lastPrice={ticker.lastPrice}
            onFill={handleOrderBookFill}
            symbol={symbol}
            trades={trades as any}
            leRate={bridgeRate ? {
              rate:      bridgeRate.rate,
              minAmount: bridgeRate.minAmount,
              maxAmount: bridgeRate.maxAmount,
            } : null}
            bridgeProvider={bridgeProvider ?? undefined}
            hasInternalLiquidity={hasRealOB}
            onLeSwap={handleLeSwap}
            externalFlash={obFlash}
          />
        </div>

        {/* FAR-RIGHT: Smart-routed Trade Panel */}
        <div className="hidden lg:flex w-[270px] xl:w-[300px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          {/* ── Mode selector ─────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border px-2 pt-2 pb-0">
            {/* Route indicator */}
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg mb-2 text-[10px]",
              hasRealOB
                ? "bg-buy/8 text-buy border border-buy/20"
                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/25"
            )}>
              {hasRealOB ? (
                <>
                  <Droplets className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">Liquidity available</span>
                  <span className="text-muted-foreground ml-auto">DEX order book</span>
                </>
              ) : leRateData ? (
                <>
                  <Zap className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">Auto-routed → Swap</span>
                  <span className="text-muted-foreground ml-auto text-[9px]">no DEX depth</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">No liquidity yet</span>
                  <span className="text-muted-foreground ml-auto">place first order</span>
                </>
              )}
            </div>
            {/* Toggle tabs */}
            <div className="flex rounded-lg overflow-hidden border border-border mb-2">
              <button
                onClick={() => { setTradeMode("order"); setTradeModeLockedByUser(true); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all",
                  tradeMode === "order"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <BookOpen className="w-3 h-3" />
                Limit / Market
              </button>
              <button
                onClick={() => { setTradeMode("swap"); setTradeModeLockedByUser(true); setLePanelKey(k => k + 1); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all border-l border-border",
                  tradeMode === "swap"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <ArrowLeftRight className="w-3 h-3" />
                Cross-chain Swap
              </button>
              <button
                onClick={() => setAtomicSwapOpen(true)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all border-l border-border",
                  "text-muted-foreground hover:text-violet-300 hover:bg-violet-500/10"
                )}
              >
                <Zap className="w-3 h-3" />
                BSV Atomic
              </button>
            </div>
          </div>

          {/* ── Trade mode content ────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tradeMode === "order" ? (
              <>
                <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} onOrderPlaced={refetchOrders} onTradeFlash={handleTradeFlash} />
                {/* Swap nudge when no internal OB liquidity */}
                {!hasRealOB && leRateData && (
                  <button
                    onClick={handleLeSwap}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-500/8 hover:bg-yellow-500/15 border-t border-yellow-500/20 transition-colors group"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-[10px] font-bold text-yellow-400 leading-tight">No DEX liquidity — switch to swap?</p>
                      <p className="text-[9px] text-yellow-400/70 leading-tight">
                        1 {base} ≈ {parseFloat(leRateData.rate).toFixed(6)} {quote}
                      </p>
                    </div>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-yellow-400/50 group-hover:text-yellow-400 transition-colors shrink-0" />
                  </button>
                )}
                <div className="p-2 border-t border-border">
                  <AiTradeAnalysis symbol={rawSymbol} baseAsset={base} />
                </div>
              </>
            ) : (
              <div ref={lePanelRef} className="flex flex-col h-full min-h-0">
                {/* Buy / Sell direction tabs */}
                <div className="shrink-0 flex border-b border-border">
                  <button
                    onClick={() => { setSwapSide("buy"); setLePanelKey(k => k + 1); }}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-bold transition-all",
                      swapSide === "buy"
                        ? "bg-green-600/15 text-green-400 border-b-2 border-green-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >Buy {base}</button>
                  <button
                    onClick={() => { setSwapSide("sell"); setLePanelKey(k => k + 1); }}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-bold transition-all border-l border-border",
                      swapSide === "sell"
                        ? "bg-red-600/15 text-red-400 border-b-2 border-red-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >Sell {base}</button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <LetsExchangePanel
                    key={`${lePanelKey}-${swapSide}`}
                    initialFrom={swapSide === "sell" ? base : quote}
                    initialTo={swapSide === "sell" ? quote : base}
                    walletAddress={address}
                    onConnectWallet={openWalletModal}
                    onExchangeCreated={handleLeExchangeCreated}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MOBILE: Smart-routed Trade Panel */}
        <div className="lg:hidden w-full shrink-0 border-t border-border bg-card">
          {/* Mobile mode selector */}
          <div className="flex border-b border-border">
            <button
              onClick={() => { setTradeMode("order"); setTradeModeLockedByUser(true); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all",
                tradeMode === "order"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {hasRealOB ? "Trade" : "Provide Liquidity"}
            </button>
            <button
              onClick={() => { setTradeMode("swap"); setTradeModeLockedByUser(true); setLePanelKey(k => k + 1); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all border-l border-border",
                tradeMode === "swap"
                  ? "border-b-2 border-yellow-400 text-yellow-400"
                  : "text-muted-foreground"
              )}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {!hasRealOB ? "Swap (Recommended)" : "Cross-chain Swap"}
            </button>
          </div>

          {/* Liquidity badge */}
          {!hasRealOB && leRateData && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px]",
              tradeMode === "swap"
                ? "bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20"
                : "bg-secondary/40 text-muted-foreground border-b border-border"
            )}>
              <Zap className="w-3 h-3 shrink-0" />
              <span>Auto-routed: no DEX liquidity — swap recommended</span>
            </div>
          )}

          {tradeMode === "order" ? (
            <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} onOrderPlaced={refetchOrders} onTradeFlash={handleTradeFlash} />
          ) : (
            <div className="flex flex-col">
              {/* Buy / Sell direction tabs — mobile */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => { setSwapSide("buy"); setLePanelKey(k => k + 1); }}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-bold transition-all",
                    swapSide === "buy"
                      ? "bg-green-600/15 text-green-400 border-b-2 border-green-500"
                      : "text-muted-foreground"
                  )}
                >Buy {base}</button>
                <button
                  onClick={() => { setSwapSide("sell"); setLePanelKey(k => k + 1); }}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-bold transition-all border-l border-border",
                    swapSide === "sell"
                      ? "bg-red-600/15 text-red-400 border-b-2 border-red-500"
                      : "text-muted-foreground"
                  )}
                >Sell {base}</button>
              </div>
              <div className="p-3">
                <LetsExchangePanel
                  key={`${lePanelKey}-${swapSide}-m`}
                  initialFrom={swapSide === "sell" ? base : quote}
                  initialTo={swapSide === "sell" ? quote : base}
                  walletAddress={address}
                  onConnectWallet={openWalletModal}
                  onExchangeCreated={handleLeExchangeCreated}
                />
              </div>
            </div>
          )}
        </div>
      </div>

    </div>

    <CrossChainSwapPanel open={atomicSwapOpen} onOpenChange={setAtomicSwapOpen} />
    </>
  );
}
