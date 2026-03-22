import { useGetPortfolio } from "@workspace/api-client-react";
import { MOCK_PORTFOLIO } from "@/lib/mock-data";
import { useWalletStore } from "@/store/useWalletStore";
import { formatPrice, formatPercent, cn, shortenAddress } from "@/lib/utils";
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import { useState } from "react";

export function Portfolio() {
  const { address } = useWalletStore();
  const { data: apiPortfolio, isLoading } = useGetPortfolio(
    { walletAddress: address || '' }, 
    { query: { enabled: !!address } }
  );

  const [hideBalances, setHideBalances] = useState(false);

  if (!address) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <History className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Portfolio Overview</h2>
          <p className="text-muted-foreground mb-8">Connect your wallet to view your balances, open orders, and transaction history on the BSV blockchain.</p>
        </div>
      </div>
    );
  }

  const portfolio = apiPortfolio || MOCK_PORTFOLIO;

  return (
    <div className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio Overview</h1>
          <p className="text-muted-foreground font-mono bg-white/5 inline-block px-3 py-1 rounded-lg border border-border">
            {address}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-secondary hover:bg-white/10 px-4 py-2 rounded-xl transition-colors font-medium text-sm">
            <ArrowDownToLine className="w-4 h-4" /> Deposit
          </button>
          <button className="flex items-center gap-2 bg-secondary hover:bg-white/10 px-4 py-2 rounded-xl transition-colors font-medium text-sm">
            <ArrowUpFromLine className="w-4 h-4" /> Withdraw
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2 bg-gradient-to-br from-card to-secondary p-8 rounded-3xl border border-border shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <span className="font-medium">Estimated Balance</span>
              <button onClick={() => setHideBalances(!hideBalances)} className="hover:text-foreground transition-colors">
                {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex items-end gap-4 mb-6">
              <span className="text-5xl font-bold font-mono tracking-tight text-foreground">
                {hideBalances ? "******" : `$${formatPrice(portfolio.totalValueUSD)}`}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-background/50 backdrop-blur px-4 py-2 rounded-xl border border-white/5">
                <div className="text-xs text-muted-foreground mb-1">Today's PnL</div>
                <div className={cn("font-mono font-bold", portfolio.totalPnlUSD >= 0 ? "text-buy" : "text-sell")}>
                  {hideBalances ? "***" : `${portfolio.totalPnlUSD >= 0 ? '+' : ''}$${formatPrice(portfolio.totalPnlUSD)} (${formatPercent(portfolio.totalPnlPercent)})`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-3xl border border-border shadow-xl flex flex-col justify-center gap-4">
           <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
             <span className="text-muted-foreground font-medium">Open Spot Orders</span>
             <span className="text-2xl font-bold font-mono text-foreground">{portfolio.openOrdersCount}</span>
           </div>
           <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
             <span className="text-muted-foreground font-medium">Futures Positions</span>
             <span className="text-2xl font-bold font-mono text-foreground">{portfolio.openPositionsCount}</span>
           </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-border bg-secondary/20">
          <h3 className="text-lg font-bold">Asset Balances</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm">
                <th className="p-4 font-medium">Asset</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium text-right">Available</th>
                <th className="p-4 font-medium text-right">In Order</th>
                <th className="p-4 font-medium text-right">Value (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {portfolio.balances.map((bal) => (
                <tr key={bal.asset} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                        {bal.asset[0]}
                      </div>
                      <span className="font-bold text-foreground">{bal.asset}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono">{hideBalances ? "***" : bal.total.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono">{hideBalances ? "***" : bal.free.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono text-muted-foreground">{hideBalances ? "***" : bal.locked.toLocaleString()}</td>
                  <td className="p-4 text-right font-mono font-medium">${hideBalances ? "***" : formatPrice(bal.valueUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
