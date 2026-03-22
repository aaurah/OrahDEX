import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { Candle } from '@workspace/api-client-react';

interface ChartProps {
  data: Candle[];
  interval?: string;
  onIntervalChange?: (interval: string) => void;
  hideIntervalBar?: boolean;
}

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export function Chart({ data, interval = '1h', onIntervalChange, hideIntervalBar = false }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initChart = (width: number, height: number) => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(el, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#848e9c',
        },
        grid: {
          vertLines: { color: '#2b3139' },
          horzLines: { color: '#2b3139' },
        },
        timeScale: { borderColor: '#2b3139', timeVisible: true },
        rightPriceScale: { borderColor: '#2b3139' },
        crosshair: {
          vertLine: { color: '#848e9c', labelBackgroundColor: '#181a20' },
          horzLine: { color: '#848e9c', labelBackgroundColor: '#181a20' },
        },
        width,
        height,
      });

      chartRef.current = chart;

      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderVisible: false,
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
      });

      const formatted = data
        .map(d => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close }))
        .sort((a, b) => a.time - b.time);

      series.setData(formatted);
      chart.timeScale().fitContent();
    };

    // Use ResizeObserver so we always get real dimensions.
    // Wrap the callback to swallow the benign "ResizeObserver loop limit exceeded"
    // browser error that fires with an empty stack and no message.
    const ro = new ResizeObserver((entries) => {
      try {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) return;
        if (!chartRef.current) {
          initChart(width, height);
        } else {
          chartRef.current.applyOptions({ width, height });
        }
      } catch (_) {
        // ignore layout-thrash ResizeObserver errors
      }
    });

    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      {!hideIntervalBar && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => onIntervalChange?.(iv)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                interval === iv
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
