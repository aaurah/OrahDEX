import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const Chart = ({ symbol, data, interval, autoScale = true }) => {
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

    if (autoScale) {  // Check if autoScale is true
      chart.timeScale().fitContent(); // Enables auto scaling of the chart based on data
    }

    setLoading(false);

    return () => chart.remove();
  }, [data, createChartInstance, autoScale]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
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