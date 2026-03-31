import { useEffect, useRef, useState } from 'react';
import type { Candle } from '@workspace/api-client-react';

declare global {
  interface Window {
    TradingView?: any;
    _tvScriptLoaded?: boolean;
    _tvScriptListeners?: (() => void)[];
  }
}

interface ChartProps {
  symbol?: string;
  data?: Candle[];
  interval?: string;
  onIntervalChange?: (interval: string) => void;
  hideIntervalBar?: boolean;
}

const TV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
};

function toTvSymbol(symbol: string): string {
  const isPerp = symbol.toUpperCase().includes('PERP');
  const clean = symbol.toUpperCase().replace(/-PERP|PERP/g, '').trim();
  const [base = '', quote = ''] = clean.split(/[\/\-]/);
  const pair = `${base}${quote === 'USD' ? 'USDT' : quote}`;

  const overrides: Record<string, string> = {
    BSVUSDT:  'BITSTAMP:BSVUSD',
    BSVUSD:   'BITSTAMP:BSVUSD',
    BSVBTC:   'BITFINEX:BSVBTC',
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
  if (!isPerp && base === 'BSV') return 'BITSTAMP:BSVUSD';

  if (isPerp) return `BINANCE:${pair}.P`;
  return `BINANCE:${pair}`;
}

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

export function Chart({ symbol = 'BTC/USDT', interval = '1h', hideIntervalBar = false }: ChartProps) {
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

    const tvSymbol = toTvSymbol(symbol);
    const tvInterval = TV_INTERVAL_MAP[interval] ?? '60';

    widgetRef.current = new window.TradingView.widget({
      container_id: containerId.current,
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0d1117',
      backgroundColor: 'rgba(0, 0, 0, 0)',
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
    });

    return () => {
      try { widgetRef.current?.remove?.(); } catch {}
      widgetRef.current = null;
    };
  }, [scriptReady, symbol, interval]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {!hideIntervalBar && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-white/5 shrink-0 text-[11px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded text-[10px] text-green-400/70 font-mono mr-1">
            ⚡ Powered by TradingView
          </span>
        </div>
      )}
      <div id={containerId.current} className="flex-1 min-h-0 [&_iframe]:w-full [&_iframe]:h-full" />
    </div>
  );
}
