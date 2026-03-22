import { useParams } from "wouter";
import { useState } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders } from "@workspace/api-client-react";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { RecentTrades } from "@/components/trading/RecentTrades";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";

type BottomTab = "open" | "history" | "trades";

export function SpotTrading() {
  const { symbol: rawSymbol = "BSV-USDT" } = useParams();
  const { address } = useWalletStore();
  const [bottomTab, setBottomTab] = useState<BottomTab>("open");

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
            {/* Tab bar */}
            <div className="flex gap-0 px-4 border-b border-border text-sm font-medium shrink-0">
              {([
                { key: "open",    label: `Open Orders (${orders.length})` },
                { key: "history", label: "Order History" },
                { key: "trades",  label: "Trade History" },
              ] as { key: BottomTab; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setBottomTab(t.key)}
                  className={cn(
                    "py-3 px-4 border-b-2 transition-colors whitespace-nowrap",
                    bottomTab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {/* ── Open Orders ── */}
              {bottomTab === "open" && (
                orders.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    {address ? "No open orders." : "Connect your wallet to view open orders."}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 font-medium">Pair</th>
                        <th className="p-3 font-medium">Type</th>
                        <th className="p-3 font-medium">Side</th>
                        <th className="p-3 font-medium text-right">Price</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                        <th className="p-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(orders as any[]).map((o: any, i: number) => (
                        <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</td>
                          <td className="p-3">{o.symbol}</td>
                          <td className="p-3 capitalize">{o.type}</td>
                          <td className={cn("p-3 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                          <td className="p-3 text-right">{formatPrice(o.price)}</td>
                          <td className="p-3 text-right">{o.quantity}</td>
                          <td className="p-3 text-right">
                            <button className="text-xs text-sell hover:underline">Cancel</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Order History ── */}
              {bottomTab === "history" && (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                  {!address
                    ? "Connect your wallet to view order history."
                    : (
                      <>
                        <span>No past orders found for this session.</span>
                        <span className="text-xs opacity-60">Completed and cancelled orders will appear here.</span>
                      </>
                    )
                  }
                </div>
              )}

              {/* ── Trade History ── */}
              {bottomTab === "trades" && (
                trades.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No trades to show.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="p-3 font-medium">Time</th>
                        <th className="p-3 font-medium">Side</th>
                        <th className="p-3 font-medium text-right">Price</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                        <th className="p-3 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(trades as any[]).slice(0, 30).map((t: any, i: number) => (
                        <tr key={t.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString()}</td>
                          <td className={cn("p-3 font-semibold capitalize", t.side === "buy" ? "text-buy" : "text-sell")}>{t.side}</td>
                          <td className={cn("p-3 text-right", t.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(t.price)}</td>
                          <td className="p-3 text-right">{Number(t.quantity).toFixed(4)}</td>
                          <td className="p-3 text-right text-muted-foreground">{formatPrice(t.price * t.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
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
