import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook } from "@workspace/api-client-react";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn } from "@/lib/utils";
import { X, ChevronDown, AlertTriangle } from "lucide-react";

const LEVERAGE_OPTIONS = [2, 3, 5, 10, 20, 25, 50, 75, 100, 125];

function LeverageModal({
  current,
  onSelect,
  onClose,
}: {
  current: number;
  onSelect: (v: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(current);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[340px] shadow-2xl z-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Adjust Leverage</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Leverage</span>
            <span className="text-2xl font-black text-primary">{val}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={125}
            value={val}
            onChange={(e) => setVal(Number(e.target.value))}
            className="w-full accent-primary h-1.5 rounded-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>1×</span>
            <span>125×</span>
          </div>
        </div>

        {/* Quick-select buttons */}
        <div className="grid grid-cols-5 gap-1.5 mb-5">
          {LEVERAGE_OPTIONS.map((lv) => (
            <button
              key={lv}
              onClick={() => setVal(lv)}
              className={cn(
                "py-1.5 rounded-lg text-xs font-bold border transition-all",
                val === lv
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {lv}×
            </button>
          ))}
        </div>

        {/* Risk warning */}
        {val >= 20 && (
          <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4 text-xs text-orange-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {val >= 50
                ? "Extreme leverage — positions can be liquidated instantly on small moves."
                : "High leverage — ensure you understand the liquidation risk."}
            </span>
          </div>
        )}

        <button
          onClick={() => { onSelect(val); onClose(); }}
          className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
        >
          Confirm {val}× Leverage
        </button>
      </div>
    </div>
  );
}

function useFundingCountdown() {
  const [seconds, setSeconds] = useState(() => {
    const now = new Date();
    const nextSlot = new Date(now);
    nextSlot.setMinutes(now.getMinutes() >= 30 ? 60 : 30, 0, 0);
    return Math.floor((nextSlot.getTime() - now.getTime()) / 1000);
  });
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s <= 1 ? 28800 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FuturesTrading() {
  const { symbol: rawSymbol = "BSV-USDT-PERP" } = useParams();
  const symbol = rawSymbol.replace(/-PERP$/, "-PERP").replace(/^([^-]+)-([^-]+)(-PERP)?$/, "$1/$2$3");
  const { data: apiTicker } = useGetTicker(encodeURIComponent(symbol));
  const { data: apiCandles } = useGetCandles(encodeURIComponent(symbol), { interval: "1h", limit: 100 });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 });

  const [leverage, setLeverage] = useState(20);
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [orderType, setOrderType] = useState<"limit" | "market" | "stop">("limit");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState("1h");

  const countdown = useFundingCountdown();

  const ticker = apiTicker || MOCK_TICKER[rawSymbol] || MOCK_TICKER["BSV-USDT"];
  const isPositive = ticker.priceChangePercent >= 0;
  const candles = apiCandles || generateMockCandles(ticker.lastPrice);

  function toEntries(raw: number[][], descending: boolean) {
    const sorted = [...raw].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
    let cum = 0;
    return sorted.map(([p, q]) => { cum += p * q; return { price: p, quantity: q, total: cum }; });
  }
  const rawOB = apiOrderBook as any;
  const orderBook = rawOB?.bids && Array.isArray(rawOB.bids[0])
    ? { bids: toEntries(rawOB.bids, true), asks: toEntries(rawOB.asks, false) }
    : (apiOrderBook || generateMockOrderBook(ticker.lastPrice));

  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1]?.replace("-PERP", "") ?? "USDT";

  const notional = parseFloat(size || "0") * parseFloat(price || String(ticker.lastPrice));
  const margin = notional / leverage;
  const liqPrice = parseFloat(price || String(ticker.lastPrice)) * (1 - 1 / leverage);

  const leverageColor =
    leverage >= 50 ? "text-red-400 border-red-500/40 bg-red-500/10"
    : leverage >= 20 ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
    : "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";

  return (
    <>
      {showLeverageModal && (
        <LeverageModal
          current={leverage}
          onSelect={setLeverage}
          onClose={() => setShowLeverageModal(false)}
        />
      )}

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">

        {/* ── Ticker header ── */}
        <div className="flex items-center gap-6 px-4 py-2.5 border-b border-border bg-card shrink-0 overflow-x-auto">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{base}/USDT Perpetual</h1>
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] font-black rounded">PERP</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-primary cursor-pointer hover:underline">
                Funding {countdown}
              </span>
              <span>· Rate: <span className="text-green-400 font-mono">+0.0100%</span></span>
            </div>
          </div>

          <div className="flex flex-col shrink-0 border-l border-border pl-5">
            <span className={cn("text-xl font-mono font-bold", isPositive ? "text-green-500" : "text-red-500")}>
              {formatPrice(ticker.lastPrice)}
            </span>
            <span className={cn("text-xs font-mono", isPositive ? "text-green-500" : "text-red-500")}>
              {isPositive ? "+" : ""}{formatPercent(ticker.priceChangePercent)}
            </span>
          </div>

          {[
            { label: "Mark Price", val: formatPrice(ticker.lastPrice + 0.05) },
            { label: "Index Price", val: formatPrice(ticker.lastPrice - 0.02) },
            { label: "24h High", val: formatPrice(ticker.high24h ?? ticker.lastPrice * 1.02) },
            { label: "24h Low", val: formatPrice(ticker.low24h ?? ticker.lastPrice * 0.98) },
            { label: "24h Volume", val: ticker.volume24h ? `${(ticker.volume24h / 1e6).toFixed(1)}M` : "—" },
            { label: "Open Interest", val: formatPrice(ticker.lastPrice * 4200) },
          ].map((s) => (
            <div key={s.label} className="flex flex-col shrink-0">
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
              <span className="text-sm font-mono mt-0.5">{s.val}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left: Order book ── */}
          <div className="w-[280px] border-r border-border shrink-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-0">
              <OrderBook data={orderBook} lastPrice={ticker.lastPrice} />
            </div>
          </div>

          {/* ── Center: Chart + Positions ── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 border-b border-border relative">
              <Chart
                data={candles}
                interval={interval}
                onIntervalChange={setInterval}
              />
            </div>
            <div className="h-[220px] shrink-0 bg-card flex flex-col">
              <div className="flex gap-6 px-4 border-b border-border text-sm font-medium shrink-0">
                {["Positions (0)", "Open Orders (0)", "Trade History"].map((t, i) => (
                  <button
                    key={t}
                    className={cn(
                      "py-3 border-b-2 transition-colors",
                      i === 0
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center text-muted-foreground text-sm">
                Connect wallet to view futures positions and settle PnL.
              </div>
            </div>
          </div>

          {/* ── Right: Order form ── */}
          <div className="w-[300px] shrink-0 flex flex-col min-h-0 border-l border-border bg-card overflow-y-auto">

            {/* Margin mode + Leverage */}
            <div className="p-3 border-b border-border flex items-center gap-2">
              <button
                onClick={() => setMarginMode((m) => (m === "cross" ? "isolated" : "cross"))}
                className="flex items-center gap-1 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-bold transition-colors"
              >
                {marginMode === "cross" ? "Cross" : "Isolated"}
                <ChevronDown size={12} />
              </button>
              <button
                onClick={() => setShowLeverageModal(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border transition-all",
                  leverageColor
                )}
              >
                {leverage}× <ChevronDown size={12} />
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">
                Max: 125×
              </span>
            </div>

            {/* Quick leverage buttons */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Quick Select</p>
              <div className="flex flex-wrap gap-1">
                {[2, 5, 10, 20, 50, 100].map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setLeverage(lv)}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] font-bold border transition-all",
                      leverage === lv
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {lv}×
                  </button>
                ))}
              </div>
            </div>

            {/* Order type */}
            <div className="px-3 py-3 border-b border-border">
              <div className="flex gap-1.5 bg-secondary p-1 rounded-xl text-xs font-semibold">
                {(["limit", "market", "stop"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg capitalize transition-all",
                      orderType === t
                        ? "bg-card shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 flex flex-col gap-3">
              {/* Available balance */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Available</span>
                <span className="font-mono text-foreground">0.00 USDT</span>
              </div>

              {/* Price input */}
              {orderType !== "market" && (
                <div className="bg-secondary border border-border rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-primary/50 transition-colors">
                  <span className="text-muted-foreground text-xs w-10">Price</span>
                  <input
                    type="number"
                    className="flex-1 bg-transparent text-right text-sm font-mono outline-none"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={String(ticker.lastPrice)}
                  />
                  <span className="text-muted-foreground text-xs">USDT</span>
                </div>
              )}

              {/* Size input */}
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-primary/50 transition-colors">
                <span className="text-muted-foreground text-xs w-10">Size</span>
                <input
                  type="number"
                  className="flex-1 bg-transparent text-right text-sm font-mono outline-none"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="0"
                />
                <span className="text-muted-foreground text-xs">{base}</span>
              </div>

              {/* PCT quick-fill */}
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className="flex-1 py-1 text-[10px] font-semibold bg-secondary border border-border rounded-lg text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  >
                    {p}%
                  </button>
                ))}
              </div>

              {/* Order stats */}
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "Notional Value", val: notional > 0 ? `${notional.toFixed(2)} USDT` : "—" },
                  { label: `Margin (${leverage}×)`, val: margin > 0 ? `${margin.toFixed(4)} USDT` : "—" },
                  { label: "Est. Liq. Price", val: liqPrice > 0 ? formatPrice(liqPrice) : "—", warn: leverage >= 20 },
                  { label: "Taker Fee (0.04%)", val: notional > 0 ? `${(notional * 0.0004).toFixed(4)} USDT` : "—" },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={cn("font-mono", r.warn && liqPrice > 0 ? "text-orange-400" : "text-foreground")}>
                      {r.val}
                    </span>
                  </div>
                ))}
              </div>

              {/* Buy / Sell buttons */}
              <div className="flex gap-2 pt-1">
                <button className="flex-1 bg-green-500 hover:bg-green-500/90 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-green-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0">
                  Buy / Long
                </button>
                <button className="flex-1 bg-red-500 hover:bg-red-500/90 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-red-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0">
                  Sell / Short
                </button>
              </div>

              {/* Settle note */}
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Positions settle on-chain via BSV smart contract · Funding every 8h
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
