import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart, ColorType,
  Candle, CandlestickSeries, LineSeries,
  CrosshairMode,
} from 'lightweight-charts';
import { useThemeStore } from '@/store/useThemeStore';

const Chart = ({ symbol, data, interval }) => {
  const chartRef = useRef();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const createChartInstance = useCallback(() => {
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      layout: {
        backgroundColor: 'transparent',
        textColor: '#FFFFFF',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
    });
    return chart;
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) {
      setError('No data available for the selected interval.');
      setLoading(false);
      return;
    }

    const chart = createChartInstance();
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#4FFF4F',
      downColor: '#FF4976',
      borderVisible: false,
    });

    candleSeries.setData(data);
    setLoading(false);

    return () => chart.remove();
  }, [data, createChartInstance]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        // Resize chart to fit the container
        chartRef.current.resize(chartRef.current.clientWidth, chartRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div>
      <div ref={chartRef} style={{ position: 'relative', width: '100%', height: '500px' }} />
    </div>
  );
};

export default Chart;