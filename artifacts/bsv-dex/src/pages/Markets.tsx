import { useState } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { formatPrice, formatVolume, formatPercent, cn } from "@/lib/utils";
import { Search, Star, ArrowUpRight, TrendingUp, ArrowRightLeft } from "lucide-react";
import { Link } from "wouter";

export function Markets() {
  const { data: apiMarkets, isLoading } = useGetMarkets();
  const [search, setSearch] = useState("");
  
  const markets = apiMarkets && apiMarkets.length > 0 ? apiMarkets : MOCK_MARKETS;
  
  const filteredMarkets = markets.filter(m => 
    m.symbol.toLowerCase().includes(search.toLowerCase()) || 
    m.baseAsset.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
      <div className="mb-10">
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight mb-2">Markets Overview</h1>
        <p className="text-primary/80 italic font-medium text-sm mb-3">✦ Always comes to Aura</p>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Multi-chain trading with zero trust, 100% on-chain settlement on BSV, and instant liquidity across EVM and native BSV markets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg">
          <div className="text-muted-foreground mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-buy" /> 24h Volume</div>
          <div className="text-3xl font-mono font-bold">$1.24B</div>
        </div>
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg">
          <div className="text-muted-foreground mb-2">Total Value Locked</div>
          <div className="text-3xl font-mono font-bold">$845M</div>
        </div>
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg flex flex-col justify-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search pairs..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-sm">
                <th className="p-4 font-medium w-12"></th>
                <th className="p-4 font-medium">Trading Pair</th>
                <th className="p-4 font-medium text-right">Price</th>
                <th className="p-4 font-medium text-right">24h Change</th>
                <th className="p-4 font-medium text-right">24h High</th>
                <th className="p-4 font-medium text-right">24h Low</th>
                <th className="p-4 font-medium text-right">24h Volume</th>
                <th className="p-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMarkets.map((market) => {
                const isPositive = market.priceChangePercent24h >= 0;
                return (
                  <tr key={market.symbol} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 text-center">
                      <button className="text-muted-foreground hover:text-primary transition-colors">
                        <Star className="w-5 h-5" />
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                          {market.baseAsset[0]}
                        </div>
                        <div>
                          <span className="font-bold text-foreground">{market.baseAsset}</span>
                          <span className="text-muted-foreground ml-1">/{market.quoteAsset}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-medium">
                      ${formatPrice(market.lastPrice)}
                    </td>
                    <td className={cn("p-4 text-right font-mono font-medium", isPositive ? "text-buy" : "text-sell")}>
                      {formatPercent(market.priceChangePercent24h)}
                    </td>
                    <td className="p-4 text-right font-mono text-muted-foreground">
                      ${formatPrice(market.high24h)}
                    </td>
                    <td className="p-4 text-right font-mono text-muted-foreground">
                      ${formatPrice(market.low24h)}
                    </td>
                    <td className="p-4 text-right font-mono text-foreground">
                      {formatVolume(market.volume24h)}
                    </td>
                    <td className="p-4 text-right">
                      <Link 
                        href={`/trade/${market.symbol.replace(/\//g, '-')}`}
                        className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm hover:scale-105 active:scale-95 transition-transform"
                      >
                        Trade
                        <ArrowRightLeft className="w-4 h-4 opacity-70" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              
              {filteredMarkets.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No markets found matching "{search}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
