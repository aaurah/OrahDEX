import { useState } from "react";
import { Save, RefreshCw, DollarSign, Percent, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "spot" | "futures" | "withdrawal" | "vip" | "distribution";

const TABS: { id: Tab; label: string }[] = [
  { id: "spot",         label: "Spot Fees" },
  { id: "futures",      label: "Futures Fees" },
  { id: "withdrawal",   label: "Withdrawal Fees" },
  { id: "vip",          label: "VIP Tiers" },
  { id: "distribution", label: "Fee Distribution" },
];

const ASSETS = [
  { symbol: "BSV",  name: "Bitcoin SV",      defaultFee: "0.0001", minWithdraw: "0.01", maxWithdraw: "10000" },
  { symbol: "BTC",  name: "Bitcoin",         defaultFee: "0.0001", minWithdraw: "0.001", maxWithdraw: "1000" },
  { symbol: "ETH",  name: "Ethereum",        defaultFee: "0.005",  minWithdraw: "0.01", maxWithdraw: "5000" },
  { symbol: "BNB",  name: "Binance Coin",    defaultFee: "0.01",   minWithdraw: "0.1",  maxWithdraw: "50000" },
  { symbol: "USDT", name: "Tether USD",      defaultFee: "1.00",   minWithdraw: "10",   maxWithdraw: "1000000" },
  { symbol: "USDC", name: "USD Coin",        defaultFee: "1.00",   minWithdraw: "10",   maxWithdraw: "1000000" },
  { symbol: "SOL",  name: "Solana",          defaultFee: "0.01",   minWithdraw: "0.1",  maxWithdraw: "10000" },
  { symbol: "MATIC","name": "Polygon",       defaultFee: "0.5",    minWithdraw: "1",    maxWithdraw: "100000" },
  { symbol: "AVAX", name: "Avalanche",       defaultFee: "0.01",   minWithdraw: "0.1",  maxWithdraw: "10000" },
  { symbol: "ARB",  name: "Arbitrum",        defaultFee: "0.5",    minWithdraw: "1",    maxWithdraw: "100000" },
  { symbol: "OP",   name: "Optimism",        defaultFee: "0.5",    minWithdraw: "1",    maxWithdraw: "100000" },
];

const VIP_TIERS = [
  { level: 0, label: "Regular",   volumeMin: "0",      makerFee: "0.10", takerFee: "0.10", discount: "0%" },
  { level: 1, label: "VIP 1",     volumeMin: "10,000",  makerFee: "0.09", takerFee: "0.10", discount: "10%" },
  { level: 2, label: "VIP 2",     volumeMin: "50,000",  makerFee: "0.08", takerFee: "0.09", discount: "20%" },
  { level: 3, label: "VIP 3",     volumeMin: "200,000", makerFee: "0.07", takerFee: "0.08", discount: "30%" },
  { level: 4, label: "VIP 4",     volumeMin: "500,000", makerFee: "0.06", takerFee: "0.07", discount: "40%" },
  { level: 5, label: "VIP 5",     volumeMin: "1M+",     makerFee: "0.04", takerFee: "0.06", discount: "50%" },
  { level: 6, label: "VIP 6",     volumeMin: "5M+",     makerFee: "0.02", takerFee: "0.04", discount: "60%" },
  { level: 7, label: "VIP 7",     volumeMin: "20M+",    makerFee: "0.01", takerFee: "0.03", discount: "70%" },
  { level: 8, label: "VIP 8",     volumeMin: "50M+",    makerFee: "0.005","takerFee": "0.02","discount": "80%" },
  { level: 9, label: "VIP 9",     volumeMin: "100M+",   makerFee: "0.00", takerFee: "0.01", discount: "90%" },
];

const DEFAULT_FEES = {
  spotMakerFee: "0.10",
  spotTakerFee: "0.10",
  spotMakerFeeOrah: "0.05",
  spotTakerFeeOrah: "0.05",
  futuresMakerFee: "0.02",
  futuresTakerFee: "0.06",
  futuresMakerFeeOrah: "0.01",
  futuresTakerFeeOrah: "0.03",
  fundingRateInterval: "8",
  fundingRateCap: "0.75",
  referralCommission: "20",
  affiliateCommission: "30",
  feeTokenEnabled: true,
  feeTokenSymbol: "ORAH",
  feeTokenDiscount: "50",
  platformFeeWallet: "1AwPYErieoPjPekmcFkGuTpx3VfyS5oAg6",
  distributionTeam: "40",
  distributionBurn: "20",
  distributionLiquidity: "30",
  distributionBuyback: "10",
};

type Fees = typeof DEFAULT_FEES;

function FeeRow({ label, description, value, onChange, suffix = "%" }: { label: string; description?: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-24 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground w-5">{suffix}</span>
      </div>
    </div>
  );
}

export function AdminFeeConfig() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("spot");
  const [fees, setFees] = useState<Fees>(() => {
    try { return { ...DEFAULT_FEES, ...JSON.parse(localStorage.getItem("orahdex_fees") ?? "{}") }; }
    catch { return DEFAULT_FEES; }
  });
  const [saving, setSaving] = useState(false);
  const [withdrawFees, setWithdrawFees] = useState(() =>
    Object.fromEntries(ASSETS.map(a => [a.symbol, { fee: a.defaultFee, min: a.minWithdraw, max: a.maxWithdraw, depositFee: "0.00" }]))
  );

  const set = <K extends keyof Fees>(key: K) => (val: Fees[K]) => setFees(f => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.setItem("orahdex_fees", JSON.stringify(fees));
    setSaving(false);
    toast({ title: "Fee config saved", description: "All fee settings have been updated." });
  };

  const distTotal = Number(fees.distributionTeam) + Number(fees.distributionBurn) + Number(fees.distributionLiquidity) + Number(fees.distributionBuyback);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="w-6 h-6 text-primary" /> Fee Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure maker/taker fees, withdrawal fees, VIP tiers, and fee distribution</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Fees"}
        </button>
      </div>

      <div className="flex gap-1 bg-card border border-border rounded-2xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all", tab === t.id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        {tab === "spot" && (
          <>
            <FeeRow label="Spot Maker Fee" description="Fee charged to market makers (limit orders that add liquidity)" value={fees.spotMakerFee} onChange={set("spotMakerFee")} />
            <FeeRow label="Spot Taker Fee" description="Fee charged to market takers (orders that remove liquidity)" value={fees.spotTakerFee} onChange={set("spotTakerFee")} />
            <div className="my-4 p-3 rounded-xl bg-primary/5 border border-primary/15 flex items-start gap-2">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">When users pay fees in <strong className="text-primary">{fees.feeTokenSymbol}</strong>, they receive the discount below.</p>
            </div>
            <FeeRow label={`Spot Maker Fee (${fees.feeTokenSymbol} payment)`} description={`Discounted maker fee when user pays in ${fees.feeTokenSymbol}`} value={fees.spotMakerFeeOrah} onChange={set("spotMakerFeeOrah")} />
            <FeeRow label={`Spot Taker Fee (${fees.feeTokenSymbol} payment)`} description={`Discounted taker fee when user pays in ${fees.feeTokenSymbol}`} value={fees.spotTakerFeeOrah} onChange={set("spotTakerFeeOrah")} />
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Fee Token Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fee Token Symbol</label>
                  <input type="text" value={fees.feeTokenSymbol} onChange={e => set("feeTokenSymbol")(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fee Token Discount (%)</label>
                  <input type="number" value={fees.feeTokenDiscount} onChange={e => set("feeTokenDiscount")(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>
            <FeeRow label="Referral Commission Rate" description="% of trading fees shared with the referrer" value={fees.referralCommission} onChange={set("referralCommission")} />
            <FeeRow label="Affiliate Commission Rate" description="% of trading fees shared with affiliate partners" value={fees.affiliateCommission} onChange={set("affiliateCommission")} />
          </>
        )}

        {tab === "futures" && (
          <>
            <FeeRow label="Futures Maker Fee" description="Limit orders that add liquidity to the futures order book" value={fees.futuresMakerFee} onChange={set("futuresMakerFee")} />
            <FeeRow label="Futures Taker Fee" description="Market orders that remove liquidity from the futures order book" value={fees.futuresTakerFee} onChange={set("futuresTakerFee")} />
            <FeeRow label={`Futures Maker Fee (${fees.feeTokenSymbol})`} value={fees.futuresMakerFeeOrah} onChange={set("futuresMakerFeeOrah")} />
            <FeeRow label={`Futures Taker Fee (${fees.feeTokenSymbol})`} value={fees.futuresTakerFeeOrah} onChange={set("futuresTakerFeeOrah")} />
            <FeeRow label="Funding Rate Interval" description="How often funding rates are applied" value={fees.fundingRateInterval} onChange={set("fundingRateInterval")} suffix="hours" />
            <FeeRow label="Funding Rate Cap" description="Maximum funding rate per interval (absolute value)" value={fees.fundingRateCap} onChange={set("fundingRateCap")} />
          </>
        )}

        {tab === "withdrawal" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="pb-3 font-medium">Asset</th>
                  <th className="pb-3 font-medium text-right">Deposit Fee</th>
                  <th className="pb-3 font-medium text-right">Withdrawal Fee</th>
                  <th className="pb-3 font-medium text-right">Min Withdraw</th>
                  <th className="pb-3 font-medium text-right">Max Withdraw / Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ASSETS.map(asset => {
                  const row = withdrawFees[asset.symbol];
                  const update = (field: string, val: string) =>
                    setWithdrawFees(f => ({ ...f, [asset.symbol]: { ...f[asset.symbol], [field]: val } }));
                  return (
                    <tr key={asset.symbol} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{asset.symbol[0]}</div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{asset.symbol}</p>
                            <p className="text-xs text-muted-foreground">{asset.name}</p>
                          </div>
                        </div>
                      </td>
                      {[["depositFee", "deposit"], ["fee", "withdraw"], ["min", "min"], ["max", "max"]].map(([field, _]) => (
                        <td key={field} className="py-3 pl-4 text-right">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={row[field as keyof typeof row]}
                            onChange={e => update(field, e.target.value)}
                            className="w-24 bg-background border border-border rounded-xl px-2 py-1.5 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "vip" && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">VIP levels are determined by 30-day trading volume (USD equivalent). Higher VIP = lower fees.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="pb-3 font-medium">Level</th>
                    <th className="pb-3 font-medium text-right">30d Volume Min</th>
                    <th className="pb-3 font-medium text-right">Maker Fee %</th>
                    <th className="pb-3 font-medium text-right">Taker Fee %</th>
                    <th className="pb-3 font-medium text-right">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {VIP_TIERS.map(tier => (
                    <tr key={tier.level} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 pr-4">
                        <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border", tier.level === 0 ? "bg-muted/20 border-border text-muted-foreground" : "bg-primary/10 border-primary/30 text-primary")}>
                          {tier.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-mono text-muted-foreground">${tier.volumeMin}</td>
                      {(["makerFee", "takerFee"] as const).map(field => (
                        <td key={field} className="py-3 px-4 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            defaultValue={tier[field]}
                            className="w-20 bg-background border border-border rounded-xl px-2 py-1.5 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="text-xs text-muted-foreground ml-1">%</span>
                        </td>
                      ))}
                      <td className="py-3 pl-4 text-right">
                        <span className="text-sm font-semibold text-green-400">{tier.discount}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "distribution" && (
          <>
            <p className="text-sm text-muted-foreground mb-6">How collected trading fees are distributed across the platform ecosystem.</p>
            <div className="space-y-1 mb-6">
              {[
                { key: "distributionTeam",      label: "Team & Operations",    color: "#8b5cf6", desc: "Platform operating costs and team salaries" },
                { key: "distributionBurn",       label: "ORAH Token Burn",      color: "#ef4444", desc: "Permanently removed from circulation to create deflation" },
                { key: "distributionLiquidity",  label: "Liquidity Reserves",   color: "#22c55e", desc: "Added to AMM pools to deepen liquidity" },
                { key: "distributionBuyback",    label: "Buyback Program",      color: "#f97316", desc: "Used to buy back ORAH tokens on the open market" },
              ].map(item => (
                <div key={item.key} className="flex items-center gap-4 py-4 border-b border-border last:border-0">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={(fees as any)[item.key]}
                      onChange={e => setFees(f => ({ ...f, [item.key]: e.target.value }))}
                      className="w-20 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={cn("p-4 rounded-xl border text-sm font-semibold flex items-center gap-2", distTotal === 100 ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400")}>
              <Percent className="w-4 h-4" />
              Distribution Total: {distTotal}% {distTotal === 100 ? "✓ Valid" : `(must equal 100% — off by ${Math.abs(100 - distTotal)}%)`}
            </div>
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-sm font-semibold text-foreground mb-3">Platform Fee Wallet</p>
              <p className="text-xs text-muted-foreground mb-2">All collected fees are first sent to this wallet before distribution</p>
              <input
                type="text"
                value={fees.platformFeeWallet}
                onChange={e => set("platformFeeWallet")(e.target.value)}
                placeholder="BSV/EVM wallet address"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
