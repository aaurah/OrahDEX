import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Candle } from '@workspace/api-client-react';

/* ─── Globals ───────────────────────────────────────────────────────────── */
declare global {
  interface Window {
    TradingView?: any;
    _tvScriptLoaded?: boolean;
    _tvScriptListeners?: (() => void)[];
  }
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

/* ─── Types & constants ─────────────────────────────────────────────────── */
interface ChartProps {
  symbol?: string;
  data?: Candle[];
  interval?: string;
  onIntervalChange?: (interval: string) => void;
  hideIntervalBar?: boolean;
}

const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

const TV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
};

/* ─── Which pairs use our internal chart vs TradingView ─────────────────── */
function useInternalChart(symbol: string): boolean {
  // Use internal chart whenever BSV appears anywhere in the symbol
  // covers: BSV/USDT, BSV/BTC, AVAX/BSV, BTC/BSV, ETH/BSV, BSV/USDT-PERP, etc.
  return symbol.toUpperCase().includes('BSV');
}

/* ─── TradingView symbol mapping ────────────────────────────────────────── */
function toTvSymbol(symbol: string): string {
  const isPerp = symbol.toUpperCase().includes('PERP');
  const clean = symbol.toUpperCase().replace(/-PERP|PERP/g, '').trim();
  const [base = '', quote = ''] = clean.split(/[\/\-]/);
  const pair = `${base}${quote === 'USD' ? 'USDT' : quote}`;

  const overrides: Record<string, string> = {
    BCHUSDT:  'BINANCE:BCHUSDT',
    XRPUSDT:  'BINANCE:XRPUSDT',
    DOGEUSDT: 'BINANCE:DOGEUSDT',
    SHIBUSDT: 'BINANCE:SHIBUSDT',
    TRXUSDT:  'BINANCE:TRXUSDT',
    LTCUSDT:  'BINANCE:LTCUSDT',
    DOTUSDT:  'BINANCE:DOTUSDT',
    LINKUSDT: 'BINANCE:LINKUSDT',
    ADAUSDT:  'BINANCE:ADAUSDT',
    ATOMUSDT: 'BINANCE:ATOMUSDT',
    NEARUSDT: 'BINANCE:NEARUSDT',
    APTUSDT:  'BINANCE:APTUSDT',
    SUIUSDT:  'BINANCE:SUIUSDT',
    INJUSDT:  'BINANCE:INJUSDT',
    ARBUSDT:  'BINANCE:ARBUSDT',
    OPUSDT:   'BINANCE:OPUSDT',
    FTMUSDT:  'BINANCE:FTMUSDT',
    CROUSDT:  'CRYPTO:CROUSD',
    LDOUSDT:  'BINANCE:LDOUSDT',
    UNIUSDT:  'BINANCE:UNIUSDT',
    AAVEUSDT: 'BINANCE:AAVEUSDT',
    MKRUSDT:  'BINANCE:MKRUSDT',
    COMPUSDT: 'BINANCE:COMPUSDT',
    CRVUSDT:  'BINANCE:CRVUSDT',
    SNXUSDT:  'BINANCE:SNXUSDT',
    GMXUSDT:  'BINANCE:GMXUSDT',
    PEPEUSDT: 'BINANCE:PEPEUSDT',
    WIFUSDT:  'BINANCE:WIFUSDT',
    BONKUSDT: 'BINANCE:BONKUSDT',
    FLOKIUSDT:'BINANCE:FLOKIUSDT',
  };

  if (!isPerp && overrides[pair]) return overrides[pair];
  if (isPerp) return `BINANCE:${pair}.P`;
  return `BINANCE:${pair}`;
}

/* ─── TradingView script loader ─────────────────────────────────────────── */
let _widgetCounter = 0;

function loadTvScript(cb: () => void) {
  if (window.TradingView) { cb(); return; }
  if (!window._tvScriptListeners) window._tvScriptListeners = [];
  window._tvScriptListeners.push(cb);
  if (window._tvScriptLoaded) return;
  window._tvScriptLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.async = true;
  s.onload = () => { window._tvScriptListeners?.forEach(fn => fn()); window._tvScriptListeners = []; };
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────────────────────────────
   INTERNAL ORAHDEX CHART (for BSV and fallback)
   Built with lightweight-charts + our live API candle data.
   Full OHLCV candlestick + volume bars + crosshair + timeframe selector.
───────────────────────────────────────────────────────────────────────── */
function OrahChart({ symbol, interval, onIntervalChange }: {
  symbol: string;
  interval: string;
  onIntervalChange?: (iv: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Fetch candle data from our API */
  const fetchCandles = useCallback(async () => {
    try {
      const encodedSymbol = encodeURIComponent(symbol);
      const limit = interval === '1d' || interval === '1w' ? 200 : 300;
      const url = `${BASE_URL}/api/markets/${encodedSymbol}/candles?interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const arr: Candle[] = Array.isArray(data) ? data : data.candles ?? [];
      const sorted = arr
        .filter(c => c && c.time && c.open && c.high && c.low && c.close)
        .sort((a, b) => Number(a.time) - Number(b.time));
      if (sorted.length > 0) {
        setCandles(sorted);
        const last = sorted[sorted.length - 1];
        const first = sorted[0];
        setLastPrice(last.close);
        setPriceChange(first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0);
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [symbol, interval]);

  /* Fetch ticker for live price */
  const fetchTicker = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/markets/${encodeURIComponent(symbol)}/ticker`);
      if (!res.ok) return;
      const t = await res.json();
      if (t.lastPrice) {
        setLastPrice(t.lastPrice);
        if (t.openPrice && t.lastPrice) {
          setPriceChange(((t.lastPrice - t.openPrice) / t.openPrice) * 100);
        }
      }
    } catch (_) {}
  }, [symbol]);

  /* Initial load + periodic refresh */
  useEffect(() => {
    setLoading(true);
    fetchCandles();
    fetchTicker();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { fetchCandles(); fetchTicker(); }, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchCandles, fetchTicker]);

  /* Build / update lightweight-charts */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    if (!chartRef.current) {
      const chart = createChart(el, {
        layout: {
          background: { type: ColorType.Solid, color: '#0d1117' },
          textColor: '#848e9c',
          fontFamily: "'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: '#1a2030' },
          horzLines: { color: '#1a2030' },
        },
        timeScale: {
          borderColor: '#2b3139',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        rightPriceScale: {
          borderColor: '#2b3139',
          scaleMargins: { top: 0.1, bottom: 0.25 },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: '#4ade80', labelBackgroundColor: '#0d1117', style: 2, width: 1 },
          horzLine: { color: '#4ade80', labelBackgroundColor: '#0d1117', style: 2, width: 1 },
        },
        handleScroll: true,
        handleScale: true,
        width: el.clientWidth,
        height: el.clientHeight,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderVisible: false,
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#4ade8030',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.80, bottom: 0 },
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;

      const ro = new ResizeObserver(entries => {
        try {
          const e = entries[0];
          if (!e || !chartRef.current) return;
          const { width, height } = e.contentRect;
          if (width > 0 && height > 0) chartRef.current.applyOptions({ width, height });
        } catch (_) {}
      });
      ro.observe(el);
      return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
    }
  }, [candles.length > 0]);

  /* Update series data when candles change */
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const tvCandles = candles.map(c => ({
      time: Number(c.time) as any,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    const volumeBars = candles.map(c => ({
      time: Number(c.time) as any,
      value: (c as any).volume ?? 0,
      color: c.close >= c.open ? '#0ecb8130' : '#f6465d30',
    }));

    candleSeriesRef.current.setData(tvCandles);
    volumeSeriesRef.current.setData(volumeBars);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  const isUp = priceChange >= 0;
  // Parse base and quote from symbol (e.g. "AVAX/BSV" → base=AVAX, quote=BSV)
  const parts = symbol.replace(/-PERP|PERP/gi, '').split(/[\/\-]/);
  const base  = parts[0] ?? 'BSV';
  const quote = parts[1] ?? 'USDT';
  // Price prefix: $ for USD-stable quotes, otherwise use quote symbol
  const usdQuotes = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'USD', 'DAI', 'FDUSD']);
  const pricePrefix  = usdQuotes.has(quote.toUpperCase()) ? '$' : '';
  const priceSuffix  = usdQuotes.has(quote.toUpperCase()) ? '' : ` ${quote}`;
  // Decimal places: BSV-quoted prices can be small (e.g. 0.62 BSV) — show more decimals
  const decimals = lastPrice !== null && lastPrice < 1 ? 6 : lastPrice !== null && lastPrice < 100 ? 4 : 2;

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Top stats bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-[10px]">⚡</span>
          <span className="text-sm font-bold text-white">{symbol.replace(/-PERP/i, '')}</span>
          <span className="text-[10px] text-green-400/60 bg-green-400/10 px-1.5 py-0.5 rounded font-mono">OrahDEX Live</span>
        </div>
        {lastPrice !== null && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-base font-bold text-white font-mono">
              {pricePrefix}{lastPrice.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{priceSuffix}
            </span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isUp ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
              {isUp ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Interval selector */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/5 shrink-0 overflow-x-auto scrollbar-hide">
        {INTERVALS.map(iv => (
          <button
            key={iv}
            onClick={() => onIntervalChange?.(iv)}
            className={`shrink-0 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              interval === iv
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {iv}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
          <span className="text-[10px] text-green-400/50 font-mono">BSV On-Chain</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        </div>
      </div>

      {/* Chart canvas */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1117] z-10 gap-3">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Loading {base}/{quote} chart…</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Bottom label */}
      <div className="px-3 py-1.5 border-t border-white/5 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Live data · {base}/{quote} · OrahDEX
        </span>
        <span className="text-[10px] text-green-400/60 font-mono">BSV Settlement ⚡</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TRADINGVIEW CHART (for BTC, ETH, SOL, and all major coins)
───────────────────────────────────────────────────────────────────────── */
function TradingViewChart({ symbol, interval }: { symbol: string; interval: string }) {
  const containerId = useRef(`tv_chart_${++_widgetCounter}`);
  const widgetRef = useRef<any>(null);
  const [scriptReady, setScriptReady] = useState(!!window.TradingView);

  useEffect(() => {
    if (scriptReady) return;
    loadTvScript(() => setScriptReady(true));
  }, []);

  useEffect(() => {
    if (!scriptReady) return;
    const el = document.getElementById(containerId.current);
    if (!el) return;

    if (widgetRef.current) {
      try { widgetRef.current.remove?.(); } catch {}
      widgetRef.current = null;
      el.innerHTML = '';
    }

    widgetRef.current = new window.TradingView.widget({
      container_id: containerId.current,
      autosize: true,
      symbol: toTvSymbol(symbol),
      interval: TV_INTERVAL_MAP[interval] ?? '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0d1117',
      backgroundColor: 'rgba(13, 17, 23, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      enable_publishing: false,
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: true,
      show_popup_button: true,
      popup_width: '1200',
      popup_height: '700',
      studies: [],
      no_referral_id: true,
      loading_screen: { backgroundColor: '#0d1117', foregroundColor: '#4ade80' },
    });

    return () => {
      try { widgetRef.current?.remove?.(); } catch {}
      widgetRef.current = null;
    };
  }, [scriptReady, symbol, interval]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div
        id={containerId.current}
        className="flex-1 min-h-0 [&_iframe]:w-full [&_iframe]:h-full"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN CHART EXPORT — routes to TradingView or OrahChart automatically
───────────────────────────────────────────────────────────────────────── */
export function Chart({ symbol = 'BTC/USDT', interval = '1h', onIntervalChange, hideIntervalBar = false }: ChartProps) {
  const internal = useInternalChart(symbol);

  if (internal) {
    return (
      <OrahChart
        symbol={symbol}
        interval={interval}
        onIntervalChange={onIntervalChange}
      />
    );
  }

  return (
    <TradingViewChart
      symbol={symbol}
      interval={interval}
    />
  );
}
