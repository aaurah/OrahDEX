import { useParams } from "wouter";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders } from "@workspace/api-client-react";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { RecentTrades } from "@/components/trading/RecentTrades";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";

export function SpotTrading() {
  const { symbol: rawSymbol = "BSV-USDT" } = useParams();
  const { address } = useWalletStore();

  const symbol = rawSymbol.replace(/-/g, '/');

  const { data: apiTicker } = useGetTicker(encodeURIComponent(symbol));
  const { data: apiCandles } = useGetCandles(encodeURIComponent(symbol), { interval: '1h', limit: 100 });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 });
  const { data: apiTrades } = useGetRecentTrades(encodeURIComponent(symbol), { limit: 50 });
  const { data: apiOrders } = useGetOrders({ walletAddress: address || '' }, { query: { enabled: !!address } });

  const ticker = apiTicker || MOCK_TICKER[rawSymbol] || MOCK_TICKER["BSV-USDT"];
  const isPositive = ticker.priceChangePercent >= 0;
  
  const candles = apiCandles || generateMockCandles(ticker.lastPrice);
  const orderBook = apiOrderBook || generateMockOrderBook(ticker.lastPrice);
  const trades = apiTrades || generateMockTrades(ticker.lastPrice);
  const orders = apiOrders || [];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Ticker Header */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-card shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">{symbol.replace('-', '/')}</h1>
          <a href="#" className="text-xs text-primary hover:underline">Market Info</a>
        </div>
        
        <div className="flex flex-col">
          <span className={cn("text-lg font-mono font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
            {formatPrice(ticker.lastPrice)}
          </span>
          <span className="text-xs text-foreground font-mono mt-1">${formatPrice(ticker.lastPrice)}</span>
        </div>

        <div className="hidden sm:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Change</span>
          <span className={cn("text-sm font-mono mt-0.5", isPositive ? "text-buy" : "text-sell")}>
            {formatPercent(ticker.priceChangePercent)}
          </span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h High</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.highPrice)}</span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Low</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.lowPrice)}</span>
        </div>

        <div className="hidden lg:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Vol({symbol.split('-')[0]})</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatVolume(ticker.volume)}</span>
        </div>
      </div>

      {/* Main Trading Area */}
      <div className="flex-1 flex overflow-hidden lg:flex-row flex-col">
        {/* Left Column: OrderBook */}
        <div className="w-full lg:w-[320px] border-r border-border shrink-0 flex flex-col min-h-0 order-2 lg:order-1">
          <div className="p-3 border-b border-border bg-secondary/50 font-semibold text-sm">Order Book</div>
          <div className="flex-1 min-h-0">
            <OrderBook data={orderBook} lastPrice={ticker.lastPrice} />
          </div>
        </div>

        {/* Center Column: Chart & Open Orders */}
        <div className="flex-1 flex flex-col min-w-0 order-1 lg:order-2">
          <div className="h-[50vh] lg:flex-1 border-b border-border relative">
            <Chart data={candles} />
          </div>
          <div className="h-[250px] lg:h-[300px] shrink-0 bg-card flex flex-col">
            <div className="flex gap-6 px-4 border-b border-border text-sm font-medium">
              <button className="py-3 border-b-2 border-primary text-primary">Open Orders ({orders.length})</button>
              <button className="py-3 border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors">Order History</button>
              <button className="py-3 border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors">Trade History</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {orders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {address ? "No open orders." : "Please connect your wallet to view orders."}
                </div>
              ) : (
                <table className="w-full text-left text-sm font-mono">
                  <thead>
                    <tr className="text-muted-foreground font-sans">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Pair</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Side</th>
                      <th className="pb-2 font-medium text-right">Price</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Render orders if they exist */}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Order Form & Trades */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col min-h-0 order-3 border-l border-border bg-card">
          <div className="flex-1 lg:flex-none">
            <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} />
          </div>
          <div className="flex-1 min-h-0 hidden lg:flex flex-col">
            <div className="p-3 border-y border-border bg-secondary/50 font-semibold text-sm">Market Trades</div>
            <RecentTrades trades={trades} />
          </div>
        </div>
      </div>
    </div>
  );
}
