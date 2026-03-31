import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Candle } from '@workspace/api-client-react';

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const chart = createChart(el, {
        layout: {
          background: { type: ColorType.Solid, color: '#0d1117' },
          textColor: '#848e9c',
          fontFamily: "'Inter', sans-serif",
          attributionLogo: false,
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
    return;
  }, [candles.length > 0]);

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

    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const priceFormat = lastClose <= 0 ? { type: 'price' as const, minMove: 0.00000001, precision: 8 }
      : lastClose < 0.000001  ? { type: 'price' as const, minMove: 0.000000000001, precision: 12 }
      : lastClose < 0.00001   ? { type: 'price' as const, minMove: 0.0000000001,   precision: 10 }
      : lastClose < 0.001     ? { type: 'price' as const, minMove: 0.00000001,     precision: 8  }
      : lastClose < 0.1       ? { type: 'price' as const, minMove: 0.000001,       precision: 6  }
      : lastClose < 1         ? { type: 'price' as const, minMove: 0.0001,         precision: 4  }
      : lastClose < 100       ? { type: 'price' as const, minMove: 0.01,           precision: 2  }
      :                         { type: 'price' as const, minMove: 0.1,            precision: 1  };
    candleSeriesRef.current.applyOptions({ priceFormat });

    candleSeriesRef.current.setData(tvCandles);
    volumeSeriesRef.current.setData(volumeBars);
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
