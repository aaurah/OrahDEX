  /* ── Fetch candles ──────────────────────────────────────────────────── */
  const fetchCandles = useCallback(async () => {
    try {
      let url: string;
      if (HISTORY_INTERVALS.has(interval)) {
        /* Full history from coin inception — server resamples daily→weekly/monthly */
        const res = interval === '5Y' ? '1w' : '1M';
        url = `${BASE_URL}/api/markets/${encodeURIComponent(symbol)}/history?interval=${res}`;
      } else {
        const preset = RANGE_PRESET_MAP[interval];
        const apiInterval = preset ? preset.apiInterval : interval;
        const limit = preset
          ? preset.limit
          : ['1d','3d','1w','1M'].includes(interval) ? 300 : 500;
        url = `${BASE_URL}/api/markets/${encodeURIComponent(symbol)}/candles?interval=${apiInterval}&limit=${limit}`;
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        logger.warn({ symbol, interval, status: res.status }, "Candle fetch failed");
        return;
      }
      const raw = await res.json();
      const arr: Candle[] = Array.isArray(raw) ? raw : raw.candles ?? [];
      const MIN_TS = 1000000000; // Sep 2001 — anything older is a bad timestamp
      const sorted = arr.filter(c => c?.time && Number(c.time) > MIN_TS && c.open && c.high && c.low && c.close)
        .sort((a, b) => Number(a.time) - Number(b.time));
      if (sorted.length) setCandles(sorted);
    } catch (err) {
      logger.warn({ err, symbol, interval }, "Candle fetch error");
    }
    finally { setLoading(false); }
  }, [symbol, interval]);

  const fetchTicker = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/markets/${encodeURIComponent(symbol)}/ticker`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return;
      const t = await r.json();
      if (t.lastPrice) {
        const chg = typeof t.priceChangePercent === 'number' && isFinite(t.priceChangePercent)
          ? t.priceChangePercent
          : t.openPrice > 0 ? ((t.lastPrice - t.openPrice) / t.openPrice) * 100 : 0;
        setTicker({ last: t.lastPrice, change: chg, high: t.highPrice ?? 0, low: t.lowPrice ?? 0, vol: t.volume ?? 0 });
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Ticker fetch error");
    }
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    // Don't clear candles here — let old data persist until new data arrives
    setTicker(null);
    setHoverInfo(null);
    fetchCandles();
    fetchTicker();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { fetchCandles(); fetchTicker(); }, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchCandles, fetchTicker]);

  /* When the API fetch completes with no data, fall back to the provided candles */
  useEffect(() => {
    if (!loading && candles.length === 0 && fallbackData && fallbackData.length > 0) {
      setCandles(fallbackData);
    }
  }, [loading, candles.length, fallbackData]);
