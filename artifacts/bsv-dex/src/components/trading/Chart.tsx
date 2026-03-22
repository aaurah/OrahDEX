import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { Candle } from '@workspace/api-client-react';

interface ChartProps {
  data: Candle[];
  interval?: string;
  onIntervalChange?: (interval: string) => void;
}

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export function Chart({ data, interval = '1h', onIntervalChange }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#848e9c',
      },
      grid: {
        vertLines: { color: '#2b3139' },
        horzLines: { color: '#2b3139' },
      },
      timeScale: {
        borderColor: '#2b3139',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#2b3139',
      },
      crosshair: {
        vertLine: { color: '#848e9c', labelBackgroundColor: '#181a20' },
        horzLine: { color: '#848e9c', labelBackgroundColor: '#181a20' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400,
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    const formattedData = data
      .map(d => ({
        time: d.time as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => a.time - b.time);

    candlestickSeries.setData(formattedData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
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
      <div ref={chartContainerRef} className="flex-1 min-h-[320px]" />
    </div>
  );
}
