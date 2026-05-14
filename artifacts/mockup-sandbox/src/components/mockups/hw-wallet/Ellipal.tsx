import { QrCode, WifiOff, Shield, ChevronRight, ArrowUpRight, ArrowDownLeft, RefreshCw, ScanLine, Cpu, CheckCircle2 } from "lucide-react";
import { useState } from "react";

const assets = [
  { name: "Bitcoin", symbol: "BTC", balance: "0.4821", usd: "31,420", pct: 60, color: "#F7931A" },
  { name: "Ethereum", symbol: "ETH", balance: "3.912", usd: "12,840", pct: 24, color: "#627EEA" },
  { name: "BSV", symbol: "BSV", balance: "142.00", usd: "4,260", pct: 8, color: "#EAB300" },
  { name: "Tron", symbol: "TRX", balance: "12,400", usd: "1,984", pct: 4, color: "#EF0027" },
  { name: "Dogecoin", symbol: "DOGE", balance: "9,200", usd: "2,016", pct: 4, color: "#C2A633" },
];

export function Ellipal() {
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#080C12] text-white font-['Inter'] overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-1">
        <span className="text-xs font-semibold text-white/40">9:41</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-500/12 border border-blue-500/20 rounded-full px-2.5 py-1">
            <WifiOff size={9} className="text-blue-400" />
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Air-Gapped</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Cpu size={12} className="text-blue-400" />
            </div>
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">OrahDEX</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/20">
            <Shield size={10} />
            <span>Titan 2.0 Mode</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mt-1">Cold Storage</h1>
      </div>

      {/* Balance panel */}
      <div className="mx-5 mb-5 rounded-3xl overflow-hidden"
        style={{ border: "1px solid rgba(59,130,246,0.15)", background: "linear-gradient(135deg, #0D1520 0%, #080C12 100%)" }}>
        <div className="p-5">
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-semibold">Portfolio value</p>
          <p className="text-4xl font-bold mb-1">$52,520<span className="text-lg text-white/25">.48</span></p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-semibold">+$1,241.20 (2.4%)</span>
            <span className="text-xs text-white/20">24h</span>
          </div>
        </div>

        {/* Mini pie chart bars */}
        <div className="px-5 pb-5">
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
            {assets.map(a => (
              <div key={a.symbol} style={{ width: `${a.pct}%`, background: a.color }} className="rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {assets.map(a => (
              <div key={a.symbol} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                <span className="text-[10px] text-white/35">{a.symbol} {a.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QR Scan action — ELLIPAL signature feature */}
      <div className="px-5 mb-5">
        <button
          onClick={handleScan}
          className={`w-full rounded-3xl border p-4 flex items-center gap-4 transition-all active:scale-[0.98] ${
            scanning
              ? "border-blue-500/40 bg-blue-500/10"
              : "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/8"
          }`}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
            scanning ? "bg-blue-500/20" : "bg-blue-500/10"
          }`}>
            {scanning ? (
              <ScanLine size={24} className="text-blue-400 animate-pulse" />
            ) : (
              <QrCode size={24} className="text-blue-400" />
            )}
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-white">
              {scanning ? "Scanning QR…" : "Scan to Sign"}
            </p>
            <p className="text-[11px] text-white/35 mt-0.5">
              {scanning ? "Hold device camera steady" : "Air-gapped transaction signing via QR code"}
            </p>
          </div>
          {scanning ? (
            <CheckCircle2 size={18} className="text-blue-400 animate-pulse shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-white/20 shrink-0" />
          )}
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2 px-5 mb-5">
        {[
          { icon: ArrowUpRight, label: "Send", sub: "QR broadcast" },
          { icon: ArrowDownLeft, label: "Receive", sub: "Show address" },
          { icon: RefreshCw, label: "Swap", sub: "Offline sign" },
        ].map(({ icon: Icon, label, sub }) => (
          <button key={label} className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border border-white/6 bg-white/3 hover:bg-white/5 transition-colors active:scale-95 text-center">
            <div className="w-9 h-9 rounded-xl bg-blue-500/12 flex items-center justify-center">
              <Icon size={15} className="text-blue-400" />
            </div>
            <span className="text-[11px] font-bold text-white/70">{label}</span>
            <span className="text-[9px] text-white/25 leading-tight">{sub}</span>
          </button>
        ))}
      </div>

      {/* Security badges */}
      <div className="flex gap-2 px-5 mb-4">
        {[
          { label: "100% Offline", icon: WifiOff },
          { label: "Anti-tamper", icon: Shield },
          { label: "No USB", icon: Cpu },
        ].map(({ label, icon: Icon }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border border-blue-500/10 bg-blue-500/5">
            <Icon size={13} className="text-blue-400/70" />
            <span className="text-[9px] font-semibold text-white/30 text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* Asset list */}
      <div className="px-5 pb-32">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2 px-1">Holdings</p>
        <div className="space-y-1.5">
          {assets.map(a => (
            <div key={a.symbol}
              className="flex items-center gap-3 py-2.5 px-3 rounded-2xl border border-white/4 bg-white/2 hover:bg-white/4 transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: `${a.color}18`, color: a.color }}>
                {a.symbol.slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-white">{a.name}</p>
                <p className="text-[10px] text-white/30">{a.balance} {a.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-semibold text-white">${a.usd}</p>
                <div className="h-1 w-12 rounded-full bg-white/8 mt-1 ml-auto overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${a.pct * 1.67}%`, background: a.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-[#080C12]/96 flex justify-around py-3 pb-8">
        {["Wallet", "Scan QR", "History", "Settings"].map((t, i) => (
          <button key={t} className={`text-[10px] font-bold ${i === 0 ? "text-blue-400" : "text-white/25"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}
