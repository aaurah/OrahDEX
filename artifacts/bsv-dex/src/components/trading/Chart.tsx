import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, BarSeries } from 'lightweight-charts';
import type { Candle } from '@workspace/api-client-react';
import { useThemeStore } from '@/store/useThemeStore';

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

type ChartType = 'candle' | 'bar' | 'line' | 'area';

const CHART_TYPES: { id: ChartType; label: string; svg: string }[] = [
  { id: 'candle', label: 'Candlestick', svg: 'M5,2 L5,5 M5,9 L5,12 M3,5 L7,5 L7,9 L3,9 Z' },
  { id: 'bar',   label: 'Bar',          svg: 'M7,2 L7,12 M7,4 L4,4 M7,9 L10,9' },
  { id: 'line',  label: 'Line',         svg: 'M1,10 L4,6 L7,8 L10,4 L13,5' },
  { id: 'area',  label: 'Area',         svg: 'M1,10 L4,6 L7,8 L10,4 L13,5 L13,12 L1,12 Z' },
];

/* ── Theme → chart colour map ───────────────────────────────────────────── */
function getChartColors(theme: string) {
  const dark   = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const eff    = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  switch (eff) {
    case 'amoled': return {
      bg:    '#000000',
      text:  '#9ca3af',
      grid:  '#111111',
      border:'#1c1c1c',
      cross: '#000000',
    };
    case 'light': return {
      bg:    '#ffffff',
      text:  '#374151',
      grid:  '#e5e7eb',
      border:'#d1d5db',
      cross: '#ffffff',
    };
    default: return {           // dark
      bg:    '#0d1117',
      text:  '#848e9c',
      grid:  '#1a2030',
      border:'#2b3139',
      cross: '#0d1117',
    };
  }
}

interface ChartProps {
  symbol?: string;
  data?: Candle[];
  interval?: string;
  onIntervalChange?: (interval: string) => void;
  hideIntervalBar?: boolean;
}

const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

const USD_QUOTES = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'TUSD', 'USDD', 'DAI', 'FDUSD']);

/* ─────────────────────────────────────────────────────────────────────────
   ORAHDEX CHART — powered by OrahDEX sovereign price engine
   Lightweight-charts v5 · OHLCV candles + volume bars · live ticker
───────────────────────────────────────────────────────────────────────── */
function OrahChart({ symbol, interval, onIntervalChange }: {
  symbol: string;
  interval: string;
  onIntervalChange?: (iv: string) => void;
}) {
  const containerRef     = useRef<HTMLDivElement>(null);
  const chartRef         = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef  = useRef<any>(null);
  const volumeSeriesRef  = useRef<any>(null);
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastPrice, setLastPrice]   = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [chartType, setChartType]   = useState<ChartType>('candle');
  const [chartReady, setChartReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { theme } = useThemeStore();

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
        setLastPrice(prev => prev ?? last.close);
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [symbol, interval]);

  const fetchTicker = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/markets/${encodeURIComponent(symbol)}/ticker`);
      if (!res.ok) return;
      const t = await res.json();
      if (t.lastPrice) {
        setLastPrice(t.lastPrice);
        if (typeof t.priceChangePercent === 'number' && isFinite(t.priceChangePercent)) {
          setPriceChange(t.priceChangePercent);
        } else if (t.openPrice > 0 && t.lastPrice > 0) {
          setPriceChange(((t.lastPrice - t.openPrice) / t.openPrice) * 100);
        }
      }
    } catch (_) {}
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    setCandles([]);
    setLastPrice(null);
    setPriceChange(0);
    fetchCandles();
    fetchTicker();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { fetchCandles(); fetchTicker(); }, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchCandles, fetchTicker]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    if (!chartRef.current) {
      const c = getChartColors(theme);
      const chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: c.bg },
          textColor: c.text,
          fontFamily: "'Inter', sans-serif",
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: c.grid },
          horzLines: { color: c.grid },
        },
        timeScale: {
          borderColor: c.border,
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        rightPriceScale: {
          borderColor: c.border,
          scaleMargins: { top: 0.08, bottom: 0.22 },
          minimumWidth: 58,
        },
        crosshair: {
          mode: 1,
          vertLine: { color: '#4ade80', labelBackgroundColor: c.cross, style: 2, width: 1 },
          horzLine: { color: '#4ade80', labelBackgroundColor: c.cross, style: 2, width: 1 },
        },
        handleScroll: true,
        handleScale: true,
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
      volumeSeriesRef.current = volumeSeries;
      setChartReady(true);

      return () => { chart.remove(); chartRef.current = null; setChartReady(false); };
    }
    return;
  }, [candles.length > 0]);

  /* ── Rebuild price series when chartType changes ──────────────────────── */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try { if (candleSeriesRef.current) chart.removeSeries(candleSeriesRef.current); } catch (_) {}
    candleSeriesRef.current = null;

    let series: any;
    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#0ecb81', downColor: '#f6465d',
        borderVisible: false,
        wickUpColor: '#0ecb81', wickDownColor: '#f6465d',
      });
    } else if (chartType === 'bar') {
      series = chart.addSeries(BarSeries, {
        upColor: '#0ecb81', downColor: '#f6465d',
      });
    } else if (chartType === 'line') {
      series = chart.addSeries(LineSeries, {
        color: '#4ade80', lineWidth: 2,
      });
    } else {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#4ade80', topColor: '#4ade8040', bottomColor: '#4ade8004', lineWidth: 2,
      });
    }
    candleSeriesRef.current = series;

    if (candles.length > 0) {
      const lastClose = candles[candles.length - 1]?.close ?? 0;
      const priceFormat = lastClose < 0.001 ? { type: 'price' as const, minMove: 0.00000001, precision: 8 }
        : lastClose < 0.1  ? { type: 'price' as const, minMove: 0.000001, precision: 6 }
        : lastClose < 1    ? { type: 'price' as const, minMove: 0.0001,   precision: 4 }
        : lastClose < 100  ? { type: 'price' as const, minMove: 0.01,     precision: 2 }
        :                    { type: 'price' as const, minMove: 0.1,      precision: 1 };
      series.applyOptions({ priceFormat });

      if (chartType === 'candle' || chartType === 'bar') {
        series.setData(candles.map(c => ({ time: Number(c.time) as any, open: c.open, high: c.high, low: c.low, close: c.close })));
      } else {
        series.setData(candles.map(c => ({ time: Number(c.time) as any, value: c.close })));
      }
      chart.timeScale().fitContent();
    }
  }, [chartReady, chartType]);

  /* ── Re-apply colours when theme changes ─────────────────────────────── */
  useEffect(() => {
    if (!chartRef.current) return;
    const c = getChartColors(theme);
    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      timeScale:      { borderColor: c.border },
      rightPriceScale:{ borderColor: c.border },
      crosshair: {
        vertLine: { color: '#4ade80', labelBackgroundColor: c.cross },
        horzLine: { color: '#4ade80', labelBackgroundColor: c.cross },
      },
    });
  }, [theme]);

  /* ── Push new candle data to existing series ──────────────────────────── */
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const volumeBars = candles.map(c => ({
      time: Number(c.time) as any,
      value: (c as any).volume ?? 0,
      color: c.close >= c.open ? '#0ecb8130' : '#f6465d30',
    }));
    volumeSeriesRef.current.setData(volumeBars);

    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const priceFormat = lastClose < 0.001 ? { type: 'price' as const, minMove: 0.00000001, precision: 8 }
      : lastClose < 0.1  ? { type: 'price' as const, minMove: 0.000001, precision: 6 }
      : lastClose < 1    ? { type: 'price' as const, minMove: 0.0001,   precision: 4 }
      : lastClose < 100  ? { type: 'price' as const, minMove: 0.01,     precision: 2 }
      :                    { type: 'price' as const, minMove: 0.1,      precision: 1 };
    candleSeriesRef.current.applyOptions({ priceFormat });

    if (chartType === 'candle' || chartType === 'bar') {
      candleSeriesRef.current.setData(candles.map(c => ({ time: Number(c.time) as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      candleSeriesRef.current.setData(candles.map(c => ({ time: Number(c.time) as any, value: c.close })));
    }
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  const isUp = priceChange >= 0;
  const parts = symbol.replace(/-PERP|PERP/gi, '').split(/[\/\-]/);
  const base  = parts[0] ?? 'BSV';
  const quote = parts[1] ?? 'USDT';
  const pricePrefix = USD_QUOTES.has(quote.toUpperCase()) ? '$' : '';
  const priceSuffix = USD_QUOTES.has(quote.toUpperCase()) ? '' : ` ${quote}`;
  const decimals = lastPrice === null ? 4
    : lastPrice < 0.000001 ? 12
    : lastPrice < 0.0001   ? 10
    : lastPrice < 0.01     ? 8
    : lastPrice < 1        ? 6
    : lastPrice < 100      ? 4
    : 2;

  const col = getChartColors(theme);
  const isLight = col.bg === '#ffffff';

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: col.bg, color: col.text }}>
      {/* Top stats bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 overflow-hidden" style={{ borderColor: col.grid }}>
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] shrink-0">⚡</span>
          <span className="text-sm font-bold truncate" style={{ color: col.text }}>{symbol.replace(/-PERP/i, '')}</span>
          <span className="text-[10px] text-green-400/60 bg-green-400/10 px-1.5 py-0.5 rounded font-mono shrink-0">OrahDEX Live</span>
        </div>
        {lastPrice !== null && (
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="text-sm font-bold font-mono" style={{ color: col.text }}>
              {pricePrefix}{lastPrice.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{priceSuffix}
            </span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${isUp ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
              {isUp ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Interval selector — scrollable intervals | chart type icons | BSV On-Chain badge */}
      <div className="flex items-center border-b shrink-0" style={{ borderColor: col.grid }}>
        {/* Scrollable interval buttons */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto scrollbar-hide min-w-0 flex-1">
          {INTERVALS.map(iv => (
            <button
              key={iv}
              onClick={() => onIntervalChange?.(iv)}
              className={`shrink-0 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                interval === iv
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : isLight
                    ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
        {/* Chart type icons */}
        <div className="flex items-center gap-0.5 shrink-0 px-1.5 border-l py-1" style={{ borderColor: col.grid }}>
          {CHART_TYPES.map(ct => (
            <button
              key={ct.id}
              title={ct.label}
              onClick={() => setChartType(ct.id)}
              className={`p-1 rounded transition-all ${
                chartType === ct.id
                  ? 'text-green-400 bg-green-500/15'
                  : isLight ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100' : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={ct.svg} fill={ct.id === 'area' ? 'currentColor' : 'none'} fillOpacity={ct.id === 'area' ? 0.2 : 0} />
              </svg>
            </button>
          ))}
        </div>
        {/* BSV On-Chain badge */}
        <div className="flex items-center gap-1 shrink-0 px-2 border-l" style={{ borderColor: col.grid }}>
          <span className="text-[10px] text-green-400/70 font-mono whitespace-nowrap">BSV On-Chain</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
        </div>
      </div>

      {/* Chart canvas */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3" style={{ backgroundColor: col.bg }}>
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
      <div className="px-3 py-1.5 border-t shrink-0 flex items-center justify-between" style={{ borderColor: col.grid }}>
        <span className="text-[10px] text-muted-foreground">
          Live data · {base}/{quote} · OrahDEX
        </span>
        <span className="text-[10px] text-green-400/60 font-mono">BSV Settlement ⚡</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN CHART EXPORT — always uses OrahChart (sovereign price engine)
───────────────────────────────────────────────────────────────────────── */
export function Chart({ symbol = 'BTC/USDT', interval = '1h', onIntervalChange }: ChartProps) {
  return (
    <OrahChart
      symbol={symbol}
      interval={interval}
      onIntervalChange={onIntervalChange}
    />
  );
}
