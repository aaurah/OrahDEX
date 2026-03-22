import { useParams } from "wouter";
import { useState } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook } from "@workspace/api-client-react";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn } from "@/lib/utils";

export function FuturesTrading() {
  const { symbol: rawSymbol = "BSV-USDT-PERP" } = useParams();
  const symbol = rawSymbol.replace(/-PERP$/, '-PERP').replace(/^([^-]+)-([^-]+)(-PERP)?$/, '$1/$2$3');
  const { data: apiTicker } = useGetTicker(encodeURIComponent(symbol));
  const { data: apiCandles } = useGetCandles(encodeURIComponent(symbol), { interval: '1h', limit: 100 });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 });

  const [leverage, setLeverage] = useState(20);
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");

  const ticker = apiTicker || MOCK_TICKER[rawSymbol] || MOCK_TICKER["BSV-USDT"];
  const isPositive = ticker.priceChangePercent >= 0;
  
  const candles = apiCandles || generateMockCandles(ticker.lastPrice);
  const orderBook = apiOrderBook || generateMockOrderBook(ticker.lastPrice);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Ticker Header */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-card shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{symbol.replace('-', '')} Perpetual</h1>
            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded">125x</span>
          </div>
          <a href="#" className="text-xs text-primary hover:underline">Funding / Countdown</a>
        </div>
        
        <div className="flex flex-col border-r border-border pr-6">
          <span className={cn("text-lg font-mono font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
            {formatPrice(ticker.lastPrice)}
          </span>
          <span className="text-xs text-foreground font-mono mt-1">${formatPrice(ticker.lastPrice)}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground underline decoration-dashed">Mark Price</span>
          <span className="text-sm font-mono mt-0.5">{formatPrice(ticker.lastPrice + 0.05)}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground underline decoration-dashed">Index Price</span>
          <span className="text-sm font-mono mt-0.5">{formatPrice(ticker.lastPrice - 0.02)}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground underline decoration-dashed">Funding / 8h</span>
          <span className="text-sm font-mono mt-0.5 text-primary">0.0100%</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: OrderBook */}
        <div className="w-[320px] border-r border-border shrink-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <OrderBook data={orderBook} lastPrice={ticker.lastPrice} />
          </div>
        </div>

        {/* Center Column: Chart & Positions */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border-b border-border relative">
            <Chart data={candles} />
          </div>
          <div className="h-[300px] shrink-0 bg-card flex flex-col">
            <div className="flex gap-6 px-4 border-b border-border text-sm font-medium">
              <button className="py-3 border-b-2 border-primary text-primary">Positions (0)</button>
              <button className="py-3 border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors">Open Orders (0)</button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center text-muted-foreground text-sm">
              Connect wallet to view futures positions.
            </div>
          </div>
        </div>

        {/* Right Column: Futures Order Form */}
        <div className="w-[320px] shrink-0 flex flex-col min-h-0 border-l border-border bg-card overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <button 
              className="text-sm font-bold bg-secondary hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors"
              onClick={() => setMarginMode(m => m === "cross" ? "isolated" : "cross")}
            >
              {marginMode === "cross" ? "Cross" : "Isolated"}
            </button>
            <div className="flex items-center gap-2 bg-secondary hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors cursor-pointer group">
              <input 
                type="range" 
                min="1" max="125" 
                value={leverage} 
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-20 accent-primary"
              />
              <span className="text-sm font-bold w-8 text-right">{leverage}x</span>
            </div>
          </div>
          
          <div className="p-4 flex flex-col gap-4">
             {/* Simplified form for mock */}
             <div className="flex gap-2 text-xs font-medium bg-secondary p-1 rounded-lg">
                <button className="flex-1 py-1.5 rounded-md bg-card shadow-sm">Limit</button>
                <button className="flex-1 py-1.5 rounded-md text-muted-foreground hover:text-foreground">Market</button>
                <button className="flex-1 py-1.5 rounded-md text-muted-foreground hover:text-foreground">Stop</button>
             </div>
             
             <div className="flex justify-between text-xs text-muted-foreground">
               <span>Avail</span>
               <span className="font-mono text-foreground">0.00 USDT</span>
             </div>

             <div className="bg-secondary border border-border rounded-xl px-3 py-2.5 flex items-center">
               <span className="text-muted-foreground text-sm w-16">Price</span>
               <input type="number" className="flex-1 bg-transparent text-right font-mono outline-none" defaultValue={ticker.lastPrice} />
               <span className="text-muted-foreground text-sm ml-2">USDT</span>
             </div>
             
             <div className="bg-secondary border border-border rounded-xl px-3 py-2.5 flex items-center">
               <span className="text-muted-foreground text-sm w-16">Size</span>
               <input type="number" className="flex-1 bg-transparent text-right font-mono outline-none" placeholder="0" />
               <span className="text-muted-foreground text-sm ml-2">BSV</span>
             </div>

             <div className="flex justify-between text-xs mt-2">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-mono">0.00 USDT</span>
             </div>

             <div className="flex gap-3 mt-4">
               <button className="flex-1 bg-buy hover:bg-buy/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-buy/20 transition-all hover:-translate-y-0.5 active:translate-y-0">
                 Buy / Long
               </button>
               <button className="flex-1 bg-sell hover:bg-sell/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-sell/20 transition-all hover:-translate-y-0.5 active:translate-y-0">
                 Sell / Short
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
