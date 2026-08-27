const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
function nowUTC() { return new Date().toISOString(); }
let _lastPrice = 1.42;
function nextPrice() {
  const drift = (Math.random() - 0.5) * 0.008;
  const meanReversion = (1.42 - _lastPrice) * 0.05;
  _lastPrice = +Math.max(0.01, _lastPrice + drift + meanReversion).toFixed(6);
  return _lastPrice;
}
function getTicker(symbol = 'ORAH/USDT') {
  const price = nextPrice();
  return { symbol, price, change24h: +((Math.random() - 0.5) * 10).toFixed(2), high24h: +(price + Math.random() * 0.5).toFixed(6), low24h: +(price - Math.random() * 0.5).toFixed(6), volume24h: +(Math.random() * 1000000).toFixed(2), timestamp: Date.now(), timestampISO: nowUTC() };
}
function generateCandles(count, intervalMs) {
  const candles = [];
  let price = 1.42;
  const startTime = Date.now() - count * intervalMs;
  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalMs;
    const open = price;
    const close = +Math.max(0.01, open + (Math.random() - 0.5) * 0.03).toFixed(6);
    candles.push({ time, open, high: +Math.max(open, close, open + Math.random() * 0.02).toFixed(6), low: +Math.min(open, close, open - Math.random() * 0.02).toFixed(6), close, volume: +(Math.random() * 10000 + 1000).toFixed(2) });
    price = close;
  }
  return candles;
}
const INTERVAL_MAP = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const API_PREFIXES = ['/api', '/auth', '/ws', '/health', '/v1'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (path === '/api/health') return json({ status: 'ok', service: 'OrahDEX', version: '5.0', timestamp: nowUTC(), d1: !!env.ORAHDEX_DB, kv: !!env.ORAHDEX_KV });

    if (path === '/api/ticker') {
      const symbol = url.searchParams.get('symbol') || 'ORAH/USDT';
      const cached = await env.ORAHDEX_KV?.get('ticker:' + symbol, 'json');
      if (cached && Date.now() - cached.timestamp < 2000) return json(cached);
      const ticker = getTicker(symbol);
      if (env.ORAHDEX_KV) ctx.waitUntil(env.ORAHDEX_KV.put('ticker:' + symbol, JSON.stringify(ticker), { expirationTtl: 2 }));
      return json(ticker);
    }

    if (path === '/api/chart' || path === '/api/candles') {
      const symbol = url.searchParams.get('symbol') || 'ORAH/USDT';
      const interval = url.searchParams.get('interval') || '1m';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      const intervalMs = INTERVAL_MAP[interval] || 60000;
      return json({ symbol, interval, candles: generateCandles(limit, intervalMs), generatedAt: Date.now(), serverTimezone: 'UTC' });
    }

    if (path === '/api/orderbook') {
      const symbol = url.searchParams.get('symbol') || 'ORAH/USDT';
      const bids = [], asks = [];
      for (let i = 0; i < 20; i++) {
        bids.push({ price: +(_lastPrice - (i + 1) * 0.001).toFixed(6), amount: +(Math.random() * 1000).toFixed(2) });
        asks.push({ price: +(_lastPrice + (i + 1) * 0.001).toFixed(6), amount: +(Math.random() * 1000).toFixed(2) });
      }
      return json({ symbol, bids, asks, timestamp: nowUTC() });
    }

    if (path === '/api/trades') {
      const symbol = url.searchParams.get('symbol') || 'ORAH/USDT';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      if (env.ORAHDEX_DB) {
        try {
          const result = await env.ORAHDEX_DB.prepare('SELECT * FROM trades WHERE symbol = ? ORDER BY created_at DESC LIMIT ?').bind(symbol, limit).all();
          if (result.results.length > 0) return json({ symbol, trades: result.results });
        } catch (err) { console.error('D1 error:', err.message); }
      }
      const trades = [];
      for (let i = 0; i < limit; i++) {
        trades.push({ id: Date.now() - i * 1000, price: +(_lastPrice + (Math.random() - 0.5) * 0.02).toFixed(6), amount: +(Math.random() * 500).toFixed(2), side: Math.random() > 0.5 ? 'buy' : 'sell', time: Date.now() - i * 1000, timeISO: new Date(Date.now() - i * 1000).toISOString() });
      }
      return json({ symbol, trades });
    }

    if (path === '/api/trade' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!body.symbol || !body.side || !body.price || !body.amount) return json({ error: 'Missing fields' }, 400);
      const trade = { id: Date.now(), symbol: body.symbol, side: body.side, price: +body.price, amount: +body.amount, total: +(body.price * body.amount).toFixed(6), time: Date.now(), timeISO: nowUTC(), walletAddress: body.walletAddress || null };
      if (env.ORAHDEX_DB) {
        try { await env.ORAHDEX_DB.prepare('INSERT INTO trades (id, symbol, side, price, amount, total, created_at, wallet_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(trade.id, trade.symbol, trade.side, trade.price, trade.amount, trade.total, trade.timeISO, trade.walletAddress).run(); } catch (err) { console.error('D1 insert:', err.message); }
      }
      return json({ success: true, trade });
    }

    if (path === '/api/orders' && method === 'GET') {
      const symbol = url.searchParams.get('symbol') || 'ORAH/USDT';
      if (env.ORAHDEX_DB) {
        try {
          const result = await env.ORAHDEX_DB.prepare("SELECT * FROM orders WHERE symbol = ? AND status = 'open' ORDER BY created_at DESC LIMIT 100").bind(symbol).all();
          return json({ symbol, orders: result.results });
        } catch (err) { console.error('D1 orders:', err.message); }
      }
      return json({ symbol, orders: [] });
    }

    if (path === '/api/balance' && method === 'GET') {
      const wallet = url.searchParams.get('wallet');
      if (!wallet) return json({ error: 'Missing wallet' }, 400);
      return json({ wallet, orahBalance: 0, usdtBalance: 0, price: _lastPrice });
    }

    if (env.ASSETS && !API_PREFIXES.some(p => path.startsWith(p))) {
      return env.ASSETS.fetch(request);
    }

    return json({ error: 'Not found', path }, 404);
  },

  async scheduled(event, env) {
    console.log('Keep-alive ping at', nowUTC());
  },
};
