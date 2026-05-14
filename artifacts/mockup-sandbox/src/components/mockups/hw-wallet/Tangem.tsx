import { Wifi, Shield, ChevronRight, ArrowUpRight, ArrowDownLeft, RefreshCw, Eye, EyeOff, Nfc, CheckCircle2, Star } from "lucide-react";
import { useState } from "react";

const assets = [
  { name: "Bitcoin", symbol: "BTC", balance: "0.4821", usd: "31,420.00", change: "+2.4%", up: true, color: "#F7931A" },
  { name: "Ethereum", symbol: "ETH", balance: "3.912", usd: "12,840.00", change: "+1.1%", up: true, color: "#627EEA" },
  { name: "BSV", symbol: "BSV", balance: "142.00", usd: "4,260.00", change: "-0.8%", up: false, color: "#EAB300" },
  { name: "Tron", symbol: "TRX", balance: "12,400", usd: "1,984.00", change: "+3.2%", up: true, color: "#EF0027" },
  { name: "XRP", symbol: "XRP", balance: "3,200", usd: "2,016.00", change: "+0.9%", up: true, color: "#00AAE4" },
];

export function Tangem() {
  const [hidden, setHidden] = useState(false);
  const [tapped, setTapped] = useState(false);

  const handleTap = () => {
    setTapped(true);
    setTimeout(() => setTapped(false), 1800);
  };

  return (
    <div className="min-h-screen bg-[#0A0F0D] text-white font-['Inter'] overflow-hidden relative select-none">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#00E676]/8 blur-3xl pointer-events-none" />

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-2">
        <span className="text-xs font-semibold text-white/50">9:41</span>
        <div className="flex items-center gap-1.5">
          <Wifi size={12} className="text-white/50" />
          <div className="w-6 h-3 rounded-sm border border-white/30 relative">
            <div className="absolute inset-0.5 right-1 bg-white/60 rounded-xs" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-2 pb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/40 font-medium uppercase tracking-widest">OrahDEX Wallet</p>
          <h1 className="text-lg font-bold text-white">My Card</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-[#00E676]/12 border border-[#00E676]/25 rounded-full px-3 py-1.5">
          <CheckCircle2 size={11} className="text-[#00E676]" />
          <span className="text-[10px] font-bold text-[#00E676] uppercase tracking-wider">Seedless</span>
        </div>
      </div>

      {/* NFC Card visual */}
      <div className="px-5 mb-5">
        <button
          onClick={handleTap}
          className={`w-full rounded-3xl p-5 relative overflow-hidden transition-all duration-300 active:scale-[0.97] ${
            tapped ? "ring-2 ring-[#00E676]/60" : ""
          }`}
          style={{
            background: "linear-gradient(135deg, #0D2318 0%, #0A1A10 50%, #071309 100%)",
            border: "1px solid rgba(0,230,118,0.18)",
            boxShadow: tapped
              ? "0 0 40px rgba(0,230,118,0.25), 0 8px 32px rgba(0,0,0,0.5)"
              : "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* Card chip */}
          <div className="absolute top-5 right-5 w-10 h-7 rounded-md border border-[#00E676]/20 bg-[#00E676]/8 flex items-center justify-center">
            <div className="w-6 h-4 rounded-sm border border-[#00E676]/30 grid grid-cols-2 gap-0.5 p-0.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xs bg-[#00E676]/25" />
              ))}
            </div>
          </div>

          {/* NFC waves */}
          <div className="absolute bottom-5 right-5 flex items-center justify-center">
            {tapped ? (
              <CheckCircle2 size={28} className="text-[#00E676] animate-pulse" />
            ) : (
              <Nfc size={24} className="text-[#00E676]/50" />
            )}
          </div>

          {/* Balance */}
          <div className="mb-6">
            <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-1">Total balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">
                {hidden ? "••••••" : "$52,520"}
              </span>
              <span className="text-sm text-white/40">.48</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs font-semibold text-[#00E676]">+$1,241.20</span>
              <span className="text-xs text-white/30">today</span>
            </div>
          </div>

          {/* Card number style */}
          <div className="font-mono text-xs text-white/25 tracking-widest">
            •••• •••• •••• 4F2A
          </div>

          {tapped && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#00E676]/8 rounded-3xl">
              <div className="text-center">
                <CheckCircle2 size={36} className="text-[#00E676] mx-auto mb-1" />
                <p className="text-sm font-bold text-[#00E676]">Card verified</p>
              </div>
            </div>
          )}
        </button>
        <p className="text-center text-[10px] text-white/25 mt-2 flex items-center justify-center gap-1">
          <Nfc size={10} /> Tap card to verify &amp; sign
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2 px-5 mb-5">
        {[
          { icon: ArrowUpRight, label: "Send", color: "#00E676" },
          { icon: ArrowDownLeft, label: "Receive", color: "#00E676" },
          { icon: RefreshCw, label: "Swap", color: "#00E676" },
        ].map(({ icon: Icon, label, color }) => (
          <button key={label} className="flex flex-col items-center gap-2 py-3 rounded-2xl border border-white/8 bg-white/4 hover:bg-white/8 transition-colors active:scale-95">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
              <Icon size={16} style={{ color }} />
            </div>
            <span className="text-[11px] font-semibold text-white/60">{label}</span>
          </button>
        ))}
      </div>

      {/* Security row */}
      <div className="mx-5 mb-4 rounded-2xl border border-[#00E676]/15 bg-[#00E676]/5 p-3 flex items-center gap-3">
        <Shield size={16} className="text-[#00E676] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white/80">EAL6+ Secure Element</p>
          <p className="text-[10px] text-white/35">No seed phrase · Private key never leaves card</p>
        </div>
        <div className="flex">
          {[...Array(5)].map((_, i) => <Star key={i} size={9} fill="#00E676" className="text-[#00E676]" />)}
        </div>
      </div>

      {/* Asset list */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] font-semibold text-white/35 uppercase tracking-widest">Assets</p>
          <button onClick={() => setHidden(h => !h)} className="text-white/30 hover:text-white/60">
            {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </div>
        <div className="space-y-1">
          {assets.map(a => (
            <div key={a.symbol} className="flex items-center gap-3 py-2.5 px-3 rounded-2xl hover:bg-white/4 transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold shrink-0"
                style={{ background: `${a.color}18`, color: a.color }}>
                {a.symbol.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white">{a.name}</p>
                <p className="text-[11px] text-white/35">{hidden ? "••••" : a.balance} {a.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold text-white">{hidden ? "••••" : `$${a.usd}`}</p>
                <p className={`text-[11px] font-semibold ${a.up ? "text-[#00E676]" : "text-red-400"}`}>{a.change}</p>
              </div>
              <ChevronRight size={14} className="text-white/15" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0F0D]/95 border-t border-white/6 flex justify-around py-3 pb-7">
        {["Wallet", "Markets", "Settings"].map((tab, i) => (
          <button key={tab} className={`text-[11px] font-semibold ${i === 0 ? "text-[#00E676]" : "text-white/30"}`}>
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
