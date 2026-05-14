import { Shield, ChevronRight, ArrowUpRight, ArrowDownLeft, RefreshCw, Eye, Layers, Lock, Zap, MoreHorizontal } from "lucide-react";
import { useState } from "react";

const assets = [
  { name: "Bitcoin", symbol: "BTC", balance: "0.4821", usd: "31,420", change: "+2.4%", up: true, color: "#F7931A", icon: "₿" },
  { name: "Ethereum", symbol: "ETH", balance: "3.912", usd: "12,840", change: "+1.1%", up: true, color: "#627EEA", icon: "Ξ" },
  { name: "BSV", symbol: "BSV", balance: "142.00", usd: "4,260", change: "-0.8%", up: false, color: "#EAB300", icon: "₿" },
  { name: "XRP Ledger", symbol: "XRP", balance: "3,200", usd: "2,016", change: "+0.9%", up: true, color: "#00AAE4", icon: "✕" },
  { name: "Litecoin", symbol: "LTC", balance: "89.5", usd: "6,980", change: "+1.3%", up: true, color: "#A0A0A0", icon: "Ł" },
];

export function Ledger() {
  const [hidden, setHidden] = useState(false);
  const [activeTab, setActiveTab] = useState("portfolio");

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-white font-['Inter'] overflow-hidden relative">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FF6B00] to-transparent" />

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-1">
        <span className="text-xs font-semibold text-white/40">9:41</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#FF6B00]/15 border border-[#FF6B00]/25 rounded-full px-2 py-0.5">
            <Lock size={9} className="text-[#FF6B00]" />
            <span className="text-[9px] font-bold text-[#FF6B00] uppercase tracking-wider">Secured</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-2 pb-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-5 h-5 rounded-md bg-[#FF6B00] flex items-center justify-center">
                <Layers size={11} className="text-white" />
              </div>
              <span className="text-xs font-bold text-white/50 uppercase tracking-widest">OrahDEX</span>
            </div>
            <h1 className="text-xl font-bold text-white">Flex Wallet</h1>
          </div>
          <button className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
            <MoreHorizontal size={16} className="text-white/50" />
          </button>
        </div>

        {/* Balance card */}
        <div className="rounded-3xl p-5 mb-1 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1A0E00 0%, #120A00 60%, #0E0E0E 100%)",
            border: "1px solid rgba(255,107,0,0.2)",
            boxShadow: "0 12px 40px rgba(255,107,0,0.1)"
          }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#FF6B00]/8 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-[#FF6B00]/5 blur-xl" />

          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Total net worth</p>
              <button onClick={() => setHidden(h => !h)}>
                <Eye size={14} className="text-white/30" />
              </button>
            </div>
            <div className="mb-3">
              <span className="text-4xl font-bold tracking-tight">{hidden ? "••••••" : "$52,520"}</span>
              <span className="text-lg text-white/30 ml-1">.48</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]" />
                <span className="text-xs font-semibold text-[#FF6B00]">+2.4% today</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-white/25">
                <Shield size={11} className="text-[#FF6B00]/60" />
                <span>Verify on device</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 mb-4">
        {["portfolio", "nfts", "activity"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-[11px] font-bold capitalize transition-all ${
              activeTab === tab
                ? "bg-[#FF6B00] text-white"
                : "bg-white/5 text-white/40 hover:bg-white/8"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2 px-5 mb-5">
        {[
          { icon: ArrowUpRight, label: "Send" },
          { icon: ArrowDownLeft, label: "Receive" },
          { icon: RefreshCw, label: "Swap" },
          { icon: Zap, label: "Stake" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-white/6 bg-white/4 hover:bg-white/8 transition-colors active:scale-95">
            <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/12 flex items-center justify-center">
              <Icon size={14} className="text-[#FF6B00]" />
            </div>
            <span className="text-[10px] font-semibold text-white/50">{label}</span>
          </button>
        ))}
      </div>

      {/* Security banner */}
      <div className="mx-5 mb-4 rounded-2xl border border-[#FF6B00]/20 bg-gradient-to-r from-[#FF6B00]/8 to-transparent p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/15 flex items-center justify-center shrink-0">
          <Shield size={15} className="text-[#FF6B00]" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-white">CC EAL5+ Secure Element</p>
          <p className="text-[10px] text-white/35">Hardware signing · Touchscreen verified</p>
        </div>
      </div>

      {/* Asset list */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Assets</p>
          <p className="text-[10px] text-white/25">{assets.length} tokens</p>
        </div>
        <div className="space-y-1.5">
          {assets.map(a => (
            <div key={a.symbol}
              className="flex items-center gap-3 py-2.5 px-3 rounded-2xl border border-white/5 bg-white/3 hover:bg-white/6 transition-colors">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-base font-bold shrink-0"
                style={{ background: `${a.color}15`, color: a.color, border: `1px solid ${a.color}25` }}>
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white leading-tight">{a.name}</p>
                <p className="text-[11px] text-white/30">{hidden ? "••••" : `${a.balance} ${a.symbol}`}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold text-white">{hidden ? "•••" : `$${a.usd}`}</p>
                <p className={`text-[10px] font-bold ${a.up ? "text-emerald-400" : "text-red-400"}`}>{a.change}</p>
              </div>
              <ChevronRight size={13} className="text-white/15" />
            </div>
          ))}
        </div>
      </div>

      <div className="h-32" />

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/6 bg-[#0E0E0E]/95 flex justify-around py-3 pb-8">
        {[
          { label: "Portfolio", active: true },
          { label: "Discover" },
          { label: "Earn" },
          { label: "Settings" },
        ].map(({ label, active }) => (
          <button key={label} className={`text-[10px] font-bold ${active ? "text-[#FF6B00]" : "text-white/25"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
