import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import {
  ArrowUp, ArrowDown, Clock, Trophy, Wallet, Loader2,
  ChevronDown, TrendingUp, TrendingDown, Zap, History, AlertTriangle,
  Check, X, Timer, DollarSign, Shield, Target, ArrowRightLeft,
} from "lucide-react";

const Chart = lazy(() => import("@/components/trading/Chart").then(m => ({ default: m.Chart })));

const SYMBOLS = ["BSV-USDT", "BTC-USDT", "ETH-USDT", "BNB-USDT", "SOL-USDT"];
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 25, 50, 100];
const BET_AMOUNTS = [5, 10, 25, 50, 100, 250, 500];

interface Round {
  id: string;
  epoch: number;
  symbol: string;
  lockPrice: number | null;
  closePrice: number | null;
  bullAmount: number;
  bearAmount: number;
  totalAmount: number;
  status: "live" | "locked" | "closed" | "cancelled";
  startTs: number;
  lockTs: number;
  closeTs: number;
  winner: "bull" | "bear" | null;
}

interface BetRecord {
  roundId: string;
  wallet: string;
  position: "bull" | "bear";
  amount: number;
  leverage: number;
  claimed: boolean;
  payout: number;
  ts: number;
  symbol: string;
  epoch: number;
  winner: string | null;
  lockPrice: number | null;
  closePrice: number | null;
  status: string;
  won: boolean;
}

function CountdownTimer({ targetTs, label }: { targetTs: number; label: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, targetTs - now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Timer size={12} className={remaining < 30 ? "text-red-400 animate-pulse" : "text-muted-foreground"} />
      <span className={cn("font-mono font-bold tabular-nums", remaining < 30 ? "text-red-400" : "text-foreground")}>
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function RoundCard({
  round,
  currentPrice,
  myBets,
  isActive,
  onClick,
}: {
  round: Round;
  currentPrice: number;
  myBets: BetRecord[];
  isActive: boolean;
  onClick: () => void;
}) {
  const isLive = round.status === "live";
  const isLocked = round.status === "locked";
  const isClosed = round.status === "closed";
  const isBull = isClosed && round.winner === "bull";
  const isBear = isClosed && round.winner === "bear";
  const myBet = myBets.find(b => b.roundId === round.id);
  const won = myBet && isClosed && round.winner === myBet.position;
  const lost = myBet && isClosed && round.winner && round.winner !== myBet.position;
  const priceNow = isLocked ? currentPrice : round.closePrice ?? currentPrice;
  const priceChange = round.lockPrice ? ((priceNow - round.lockPrice) / round.lockPrice) * 100 : 0;
  const bullPayout = round.bullAmount > 0 ? round.totalAmount / round.bullAmount : 0;
  const bearPayout = round.bearAmount > 0 ? round.totalAmount / round.bearAmount : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border p-3 cursor-pointer transition-all duration-200 min-w-[220px] snap-center",
        isActive && "ring-2 ring-primary/60",
        isLive && "border-primary/40 bg-primary/5",
        isLocked && "border-yellow-500/40 bg-yellow-500/5",
        isClosed && isBull && "border-green-500/30 bg-green-500/5",
        isClosed && isBear && "border-red-500/30 bg-red-500/5",
        isClosed && !round.winner && "border-border bg-card",
        !isLive && !isLocked && !isClosed && "border-border/50 bg-card/50",
      )}
    >
      {won && (
        <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
          <Trophy size={10} /> WON
        </div>
      )}
      {lost && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
          LOST
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-muted-foreground">#{round.epoch}</span>
        <div className={cn(
          "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase",
          isLive && "bg-primary/20 text-primary",
          isLocked && "bg-yellow-500/20 text-yellow-400",
          isClosed && "bg-muted text-muted-foreground",
        )}>
          {round.status}
        </div>
      </div>

      {isLive && <CountdownTimer targetTs={round.lockTs} label="to lock" />}
      {isLocked && <CountdownTimer targetTs={round.closeTs} label="to close" />}

      <div className="flex items-center justify-between mt-2">
        <div className="text-center flex-1">
          <div className="flex items-center justify-center gap-1 text-green-400 text-[10px] font-semibold mb-0.5">
            <ArrowUp size={10} /> UP
          </div>
          <div className="text-[9px] text-muted-foreground">{bullPayout.toFixed(2)}x</div>
          <div className="text-[9px] text-muted-foreground">${round.bullAmount.toLocaleString()}</div>
        </div>
        <div className="text-center px-2 border-x border-border/30">
          {round.lockPrice ? (
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground">Lock</div>
              <div className="text-[10px] font-bold">${formatPrice(round.lockPrice)}</div>
              {(isLocked || isClosed) && (
                <div className={cn("text-[10px] font-bold", priceChange > 0 ? "text-green-400" : priceChange < 0 ? "text-red-400" : "text-muted-foreground")}>
                  {priceChange > 0 ? "+" : ""}{priceChange.toFixed(2)}%
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">Accepting</div>
          )}
        </div>
        <div className="text-center flex-1">
          <div className="flex items-center justify-center gap-1 text-red-400 text-[10px] font-semibold mb-0.5">
            <ArrowDown size={10} /> DOWN
          </div>
          <div className="text-[9px] text-muted-foreground">{bearPayout.toFixed(2)}x</div>
          <div className="text-[9px] text-muted-foreground">${round.bearAmount.toLocaleString()}</div>
        </div>
      </div>

      {myBet && (
        <div className={cn(
          "mt-2 pt-1.5 border-t border-border/30 flex items-center justify-between text-[10px]",
          myBet.position === "bull" ? "text-green-400" : "text-red-400",
        )}>
          <span className="font-semibold flex items-center gap-1">
            {myBet.position === "bull" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {myBet.position.toUpperCase()} ${myBet.amount} @ {myBet.leverage}x
          </span>
          {won && <span className="text-green-400 font-bold">+${myBet.payout.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

export function PredictionTrading() {
  const [symbol, setSymbol] = useState("BSV-USDT");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [serverTime, setServerTime] = useState(0);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [position, setPosition] = useState<"bull" | "bear">("bull");
  const [betAmount, setBetAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [myBets, setMyBets] = useState<BetRecord[]>([]);
  const [tab, setTab] = useState<"chart" | "rounds" | "history">("chart");
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [candleInterval, setCandleInterval] = useState("5m");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { address, isDemo } = useWalletStore();
  const openModal = useWalletModalStore(s => s.open);
  const { toast } = useToast();

  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/prediction/rounds/${symbol}`);
      if (!res.ok) return;
      const data = await res.json();
      setRounds(data.rounds ?? []);
      setCurrentPrice(data.currentPrice ?? 0);
      setServerTime(data.serverTime ?? 0);
      if (!selectedRound) {
        const live = (data.rounds ?? []).find((r: Round) => r.status === "live");
        if (live) setSelectedRound(live);
      } else {
        const updated = (data.rounds ?? []).find((r: Round) => r.id === selectedRound.id);
        if (updated) setSelectedRound(updated);
      }
    } catch {}
  }, [symbol, selectedRound?.id]);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${API_BASE}/prediction/history/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setMyBets(data.bets ?? []);
    } catch {}
  }, [address]);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${API_BASE}/balances/USDT?walletAddress=${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsdtBalance(parseFloat(data.available ?? "0"));
    } catch {}
  }, [address]);

  useEffect(() => {
    fetchRounds();
    const id = setInterval(fetchRounds, 5000);
    return () => clearInterval(id);
  }, [fetchRounds]);

  useEffect(() => { fetchHistory(); fetchBalance(); }, [fetchHistory, fetchBalance]);

  const placeBet = async () => {
    if (!address || !selectedRound) return;
    const amt = customAmount ? parseFloat(customAmount) : betAmount;
    if (!amt || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      const res = await fetch(`${API_BASE}/prediction/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: selectedRound.id,
          symbol,
          wallet: address,
          position,
          amount: amt,
          leverage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Bet Failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        title: `${position === "bull" ? "UP" : "DOWN"} Bet Placed!`,
        description: `$${amt} @ ${leverage}x on round #${selectedRound.epoch}`,
      });
      setCustomAmount("");
      fetchRounds();
      fetchHistory();
      fetchBalance();
    } catch {
      toast({ title: "Error", description: "Failed to place bet", variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const claimWinnings = async (roundId: string) => {
    if (!address) return;
    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE}/prediction/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, symbol, wallet: address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Claim Failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Winnings Claimed!", description: `+$${data.payout.toFixed(2)} USDT` });
      fetchHistory();
      fetchBalance();
    } catch {} finally { setClaiming(false); }
  };

  const liveRound = rounds.find(r => r.status === "live");
  const lockedRound = rounds.find(r => r.status === "locked");
  const closedRounds = rounds.filter(r => r.status === "closed").reverse();
  const base = symbol.split("-")[0];
  const effectiveAmount = customAmount ? parseFloat(customAmount) || 0 : betAmount;
  const potentialPayout = selectedRound
    ? effectiveAmount * leverage * (position === "bull"
      ? (selectedRound.bullAmount > 0 ? selectedRound.totalAmount / selectedRound.bullAmount : 2)
      : (selectedRound.bearAmount > 0 ? selectedRound.totalAmount / selectedRound.bearAmount : 2))
    : 0;

  const unclaimedWins = myBets.filter(b => b.won && !b.claimed);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/30 to-red-500/30 flex items-center justify-center border border-primary/20">
              <Target className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-black mb-2">Prediction Trading</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Predict if the price will go UP or DOWN. Win up to 100x with leverage. Free to play with demo funds.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => openModal()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-md"
          >
            <Wallet className="w-4 h-4" /> Connect Wallet
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            Connect wallet to trade — demo mode available inside
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-2">
          {[
            { icon: Zap, label: "Up to 100x", sub: "Leverage" },
            { icon: Shield, label: "Free Demo", sub: "No risk" },
            { icon: ArrowRightLeft, label: "5-min Rounds", sub: "Fast trades" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex flex-col items-center gap-1 bg-card rounded-xl py-3 px-2 border border-border/50">
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold">{label}</span>
              <span className="text-[10px] text-muted-foreground">{sub}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 border-b border-border/50 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <CoinLogo symbol={base} size={24} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm lg:text-base font-black">{symbol.replace("-", "/")}</h2>
              <span className={cn(
                "text-xs lg:text-sm font-bold",
                currentPrice > 0 ? "text-foreground" : "text-muted-foreground",
              )}>
                ${formatPrice(currentPrice)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Prediction — 5-min rounds</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 lg:gap-1.5 shrink-0">
          {SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => { setSymbol(s); setSelectedRound(null); }}
              className={cn(
                "px-1.5 lg:px-2 py-1 rounded-lg text-[10px] lg:text-[11px] font-bold transition-colors",
                symbol === s ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.split("-")[0]}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 ml-3 border-l border-border/30 pl-3 shrink-0">
          <DollarSign size={12} className="text-green-400" />
          <span className="text-xs font-bold">{usdtBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-[10px] text-muted-foreground">USDT</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-auto lg:overflow-hidden">
        {/* LEFT: Chart + Rounds */}
        <div className="lg:flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/30 shrink-0">
            <button onClick={() => setTab("chart")} className={cn("px-3 py-1 rounded-lg text-xs font-bold", tab === "chart" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
              Chart
            </button>
            <button onClick={() => setTab("rounds")} className={cn("px-3 py-1 rounded-lg text-xs font-bold relative", tab === "rounds" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
              Rounds
              {liveRound && tab !== "rounds" && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            </button>
            <button onClick={() => setTab("history")} className={cn("px-3 py-1 rounded-lg text-xs font-bold relative", tab === "history" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
              History
              {unclaimedWins.length > 0 && tab !== "history" && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            </button>
            {unclaimedWins.length > 0 && (
              <span className="ml-auto text-[10px] text-green-400 font-bold animate-pulse">{unclaimedWins.length} unclaimed</span>
            )}
          </div>

          {/* Chart tab */}
          {tab === "chart" && (
            <div className="relative h-[250px] lg:h-auto lg:flex-1 lg:min-h-[360px]">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading chart...</div>}>
                <Chart
                  symbol={symbol}
                  interval={candleInterval}
                  onIntervalChange={setCandleInterval}
                />
              </Suspense>
            </div>
          )}

          {/* Rounds tab */}
          {tab === "rounds" && (
            <div className="flex-1 overflow-auto p-4">
              <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory">
                {rounds.map(r => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    currentPrice={currentPrice}
                    myBets={myBets}
                    isActive={selectedRound?.id === r.id}
                    onClick={() => { if (r.status === "live") setSelectedRound(r); }}
                  />
                ))}
              </div>

              {closedRounds.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold text-muted-foreground mb-2">Recent Results</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {closedRounds.slice(0, 6).map(r => {
                      const change = r.lockPrice && r.closePrice ? ((r.closePrice - r.lockPrice) / r.lockPrice * 100) : 0;
                      return (
                        <div key={r.id} className="flex items-center justify-between bg-card rounded-xl border border-border/50 p-3">
                          <div>
                            <div className="text-[10px] font-bold text-muted-foreground">#{r.epoch}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">${formatPrice(r.lockPrice ?? 0)}</span>
                              <span className="text-muted-foreground text-[10px]">→</span>
                              <span className="text-[10px] font-bold">${formatPrice(r.closePrice ?? 0)}</span>
                            </div>
                          </div>
                          <div className={cn(
                            "flex items-center gap-1 text-xs font-black px-2 py-1 rounded-lg",
                            r.winner === "bull" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400",
                          )}>
                            {r.winner === "bull" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            {change > 0 ? "+" : ""}{change.toFixed(2)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History tab */}
          {tab === "history" && (
            <div className="flex-1 overflow-auto p-4">
              {myBets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <History size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">No prediction bets yet</p>
                  <p className="text-xs mt-1">Place your first prediction to see history here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myBets.map((b, i) => (
                    <div key={i} className={cn(
                      "flex items-center justify-between bg-card rounded-xl border p-3",
                      b.won ? "border-green-500/30" : b.status === "closed" ? "border-red-500/20" : "border-border/50",
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          b.position === "bull" ? "bg-green-500/15" : "bg-red-500/15",
                        )}>
                          {b.position === "bull" ? <ArrowUp size={16} className="text-green-400" /> : <ArrowDown size={16} className="text-red-400" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold">
                            #{b.epoch} — {b.position.toUpperCase()} ${b.amount} @ {b.leverage}x
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {b.symbol} · Lock ${formatPrice(b.lockPrice ?? 0)} → Close ${formatPrice(b.closePrice ?? 0)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.won && !b.claimed && (
                          <button
                            onClick={() => claimWinnings(b.roundId)}
                            disabled={claiming}
                            className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors disabled:opacity-60"
                          >
                            {claiming ? <Loader2 size={12} className="animate-spin" /> : "Claim"}
                          </button>
                        )}
                        {b.won && b.claimed && (
                          <span className="text-xs text-green-400 font-bold flex items-center gap-1">
                            <Check size={12} /> +${b.payout.toFixed(2)}
                          </span>
                        )}
                        {!b.won && b.status === "closed" && (
                          <span className="text-xs text-red-400 font-semibold flex items-center gap-1">
                            <X size={12} /> -${b.amount.toFixed(2)}
                          </span>
                        )}
                        {b.status !== "closed" && (
                          <span className="text-xs text-yellow-400 font-semibold">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Bet panel */}
        <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-border/50 flex flex-col bg-card/30 shrink-0">
          {/* Active round info */}
          {selectedRound && (
            <div className="px-4 py-2 border-b border-border/30 bg-card/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Round #{selectedRound.epoch}</span>
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                    selectedRound.status === "live" && "bg-green-500/20 text-green-400",
                    selectedRound.status === "locked" && "bg-yellow-500/20 text-yellow-400",
                    selectedRound.status === "closed" && "bg-muted text-muted-foreground",
                  )}>{selectedRound.status}</span>
                </div>
                {selectedRound.status === "live" && <CountdownTimer targetTs={selectedRound.lockTs} label="" />}
                {selectedRound.status === "locked" && <CountdownTimer targetTs={selectedRound.closeTs} label="" />}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-1 text-green-400 text-[10px] font-semibold">
                  <ArrowUp size={10} /> UP {selectedRound.bullAmount > 0 ? (selectedRound.totalAmount / selectedRound.bullAmount).toFixed(2) : "—"}x
                </div>
                <div className="text-[10px] font-bold">
                  Pool: ${selectedRound.totalAmount.toLocaleString()}
                </div>
                <div className="flex items-center gap-1 text-red-400 text-[10px] font-semibold">
                  DOWN {selectedRound.bearAmount > 0 ? (selectedRound.totalAmount / selectedRound.bearAmount).toFixed(2) : "—"}x <ArrowDown size={10} />
                </div>
              </div>
            </div>
          )}

          <div className="p-4 flex-1 overflow-auto">
            <h3 className="text-sm font-bold mb-3">Place Prediction</h3>

            {selectedRound && selectedRound.status === "live" ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPosition("bull")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm transition-all",
                      position === "bull"
                        ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                        : "bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20",
                    )}
                  >
                    <ArrowUp size={14} /> UP
                  </button>
                  <button
                    onClick={() => setPosition("bear")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm transition-all",
                      position === "bear"
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                        : "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20",
                    )}
                  >
                    <ArrowDown size={14} /> DOWN
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Amount (USDT)</label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {BET_AMOUNTS.map(a => (
                      <button
                        key={a}
                        onClick={() => { setBetAmount(a); setCustomAmount(""); }}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all",
                          !customAmount && betAmount === a
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-secondary border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        ${a}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    placeholder="Custom amount..."
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-mono focus:border-primary/50 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold mb-1 block flex items-center gap-1">
                    <Zap size={10} /> Leverage
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {LEVERAGE_OPTIONS.map(lv => (
                      <button
                        key={lv}
                        onClick={() => setLeverage(lv)}
                        className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                          leverage === lv
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-secondary border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {lv}x
                      </button>
                    ))}
                  </div>
                  {leverage >= 25 && (
                    <div className="flex items-start gap-1.5 mt-1.5 text-[10px] text-orange-400">
                      <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                      <span>{leverage >= 50 ? "Extreme risk" : "High risk"}</span>
                    </div>
                  )}
                </div>

                <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Bet</span>
                    <span className="font-bold">${effectiveAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Leverage</span>
                    <span className="font-bold">{leverage}x</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Potential</span>
                    <span className="font-bold text-green-400">${potentialPayout.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={placeBet}
                  disabled={placing || effectiveAmount <= 0}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60",
                    position === "bull"
                      ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-500/20"
                      : "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/20",
                  )}
                >
                  {placing ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    <>
                      {position === "bull" ? "Predict UP" : "Predict DOWN"} — ${effectiveAmount} @ {leverage}x
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Clock size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">Select a live round</p>
                <p className="text-[10px] mt-1">Go to the "Rounds" tab and click a LIVE round</p>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border/30">
            <h4 className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">How It Works</h4>
            <div className="space-y-1.5">
              {[
                { icon: Target, title: "Predict", desc: "UP or DOWN before lock" },
                { icon: Clock, title: "Wait", desc: "5-min round resolves" },
                { icon: Trophy, title: "Win", desc: "Claim payout if correct" },
                { icon: Zap, title: "Leverage", desc: "Up to 100x multiplier" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={10} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold">{title}</span>
                    <span className="text-[9px] text-muted-foreground">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
