import { Shield, ChevronRight, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, Grid3x3, List, BookOpen, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";

const assets = [
  { name: "Bitcoin", symbol: "BTC", balance: "0.4821", usd: "31,420", change: 2.4, color: "#F7931A", gradient: ["#F7931A", "#E87B0A"] },
  { name: "Ethereum", symbol: "ETH", balance: "3.912", usd: "12,840", change: 1.1, color: "#627EEA", gradient: ["#627EEA", "#4A5BD4"] },
  { name: "Bitcoin SV", symbol: "BSV", balance: "142.00", usd: "4,260", change: -0.8, color: "#EAB300", gradient: ["#EAB300", "#D4A100"] },
  { name: "Litecoin", symbol: "LTC", balance: "89.5", usd: "6,980", change: 1.3, color: "#B0B0B0", gradient: ["#B0B0B0", "#909090"] },
  { name: "Dogecoin", symbol: "DOGE", balance: "9,200", usd: "2,016", change: 4.5, color: "#C2A633", gradient: ["#C2A633", "#A8901F"] },
  { name: "XRP", symbol: "XRP", balance: "3,200", usd: "2,016", change: 0.9, color: "#00AAE4", gradient: ["#00AAE4", "#0090C8"] },
];

export function Trezor() {
  const [view, setView] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const total = assets.reduce((s, a) => s + parseFloat(a.usd.replace(",", "")), 0);

  return (
    <div className="min-h-screen font-['Inter'] overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0F1117 0%, #090B10 100%)" }}>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-2">
        <span className="text-xs font-semibold text-white/40">9:41</span>
        <div className="flex items-center gap-1.5 bg-violet-500/12 border border-violet-500/20 rounded-full px-2.5 py-1">
          <BookOpen size={9} className="text-violet-400" />
          <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider">Open Source</span>
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-1 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">OrahDEX · Safe 5</p>
            <h1 className="text-xl font-bold text-white">Portfolio</h1>
          </div>
          <div className="w-9 h-9 rounded-xl bg-violet-500/12 border border-violet-500/20 flex items-center justify-center">
            <Shield size={15} className="text-violet-400" />
          </div>
        </div>

        {/* Balance hero */}
        <div className="rounded-3xl p-5 relative overflow-hidden mb-1"
          style={{
            background: "linear-gradient(135deg, #14101E 0%, #0F0D18 100%)",
            border: "1px solid rgba(139,92,246,0.15)",
            boxShadow: "0 8px 32px rgba(139,92,246,0.08)"
          }}>
          <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full bg-violet-600/10 blur-2xl" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-violet-800/8 blur-xl" />

          <div className="relative">
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Total value</p>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-4xl font-bold text-white tracking-tight">
                ${(total / 1000).toFixed(1)}k
              </span>
              <span className="text-sm text-white/30 mb-1">USD</span>
            </div>

            {/* Mini sparkline-style bars */}
            <div className="flex items-end gap-0.5 h-8 mb-3">
              {[40, 55, 48, 62, 58, 70, 65, 80, 72, 88, 75, 92, 85, 95].map((h, i) => (
                <div key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background: i >= 10 ? "rgba(139,92,246,0.7)" : "rgba(255,255,255,0.08)"
                  }} />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">+2.4% this week</span>
              </div>
              <span className="text-[10px] text-white/20">{assets.length} assets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2 px-5 mb-5">
        {[
          { icon: ArrowUpRight, label: "Send", color: "violet" },
          { icon: ArrowDownLeft, label: "Receive", color: "violet" },
          { icon: RefreshCw, label: "Swap", color: "violet" },
          { icon: Zap, label: "Stake", color: "violet" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-violet-500/15 bg-violet-500/6 hover:bg-violet-500/10 transition-colors active:scale-95">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Icon size={14} className="text-violet-400" />
            </div>
            <span className="text-[10px] font-semibold text-white/50">{label}</span>
          </button>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-2 px-5 mb-3">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="w-full bg-white/5 border border-white/8 rounded-xl py-2 pl-8 pr-3 text-xs text-white placeholder-white/20 outline-none focus:border-violet-500/40"
          />
        </div>
        <button
          onClick={() => setView(v => v === "list" ? "grid" : "list")}
          className="w-9 h-9 rounded-xl border border-white/8 bg-white/4 flex items-center justify-center"
        >
          {view === "list" ? <Grid3x3 size={14} className="text-white/40" /> : <List size={14} className="text-white/40" />}
        </button>
      </div>

      {/* Asset list */}
      <div className="px-5 pb-32">
        {view === "list" ? (
          <div className="space-y-1.5">
            {filtered.map(a => (
              <div key={a.symbol}
                className="flex items-center gap-3 py-2.5 px-3 rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 transition-colors">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 text-white"
                  style={{ background: `linear-gradient(135deg, ${a.gradient[0]}, ${a.gradient[1]})` }}>
                  {a.symbol.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white">{a.name}</p>
                  <p className="text-[10px] text-white/30">{a.balance} {a.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-white">${a.usd}</p>
                  <div className="flex items-center justify-end gap-0.5">
                    {a.change >= 0
                      ? <TrendingUp size={9} className="text-emerald-400" />
                      : <TrendingDown size={9} className="text-red-400" />
                    }
                    <p className={`text-[10px] font-bold ${a.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {a.change >= 0 ? "+" : ""}{a.change}%
                    </p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-white/12" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(a => (
              <div key={a.symbol}
                className="p-3.5 rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white"
                    style={{ background: `linear-gradient(135deg, ${a.gradient[0]}, ${a.gradient[1]})` }}>
                    {a.symbol.charAt(0)}
                  </div>
                  <p className={`text-[10px] font-bold ${a.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {a.change >= 0 ? "+" : ""}{a.change}%
                  </p>
                </div>
                <p className="text-xs font-bold text-white mb-0.5">{a.symbol}</p>
                <p className="text-[11px] text-white/40">{a.balance}</p>
                <p className="text-sm font-semibold text-white mt-1">${a.usd}</p>
              </div>
            ))}
          </div>
        )}

        {/* Open source badge */}
        <div className="mt-4 rounded-2xl border border-violet-500/12 bg-violet-500/5 p-3 flex items-center gap-3">
          <BookOpen size={14} className="text-violet-400 shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-white/70">100% Open Source · Community Audited</p>
            <p className="text-[10px] text-white/25">Trezor-model security · SafePal QR interface</p>
          </div>
          <Shield size={13} className="text-violet-400/50" />
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-[#090B10]/96 flex justify-around py-3 pb-8">
        {[
          { label: "Portfolio", active: true },
          { label: "Discover" },
          { label: "Staking" },
          { label: "Settings" },
        ].map(({ label, active }) => (
          <button key={label} className={`text-[10px] font-bold ${active ? "text-violet-400" : "text-white/25"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
