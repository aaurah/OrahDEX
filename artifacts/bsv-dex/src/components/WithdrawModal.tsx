import { useState, useEffect, useCallback } from "react";
import {
  X, ArrowUpFromLine, Check, AlertTriangle, ChevronDown,
  Clock, Loader2, History, RefreshCw, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useExchangeBalanceStore } from "@/store/useExchangeBalanceStore";
import { API_BASE } from "@/lib/api";

const NETWORKS = [
  { id: "eth",    label: "Ethereum (ERC-20)",       fee: "~$2.40",  time: "~30 sec" },
  { id: "bsc",    label: "BNB Smart Chain (BEP-20)", fee: "~$0.10", time: "~5 sec"  },
  { id: "matic",  label: "Polygon (MATIC)",          fee: "~$0.02",  time: "~5 sec"  },
  { id: "arb",    label: "Arbitrum One",             fee: "~$0.08",  time: "~3 sec"  },
  { id: "op",     label: "Optimism",                 fee: "~$0.05",  time: "~3 sec"  },
  { id: "base",   label: "Base",                     fee: "~$0.04",  time: "~3 sec"  },
  { id: "zksync", label: "zkSync Era",               fee: "~$0.06",  time: "~10 sec" },
  { id: "bsv",    label: "BSV (on-chain)",           fee: "~$0.001", time: "~1 min"  },
];

type Step = "form" | "confirm" | "done";
type Tab  = "withdraw" | "history";

interface WithdrawalRecord {
  id:           string;
  asset:        string;
  amount:       number;
  network:      string;
  networkLabel: string;
  recipient:    string;
  fee:          string | null;
  status:       string;
  txid:         string | null;
  note:         string | null;
  createdAt:    string;
  processedAt:  string | null;
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending:    { color: "text-yellow-400", label: "Pending" },
  processing: { color: "text-blue-400",   label: "Processing" },
  completed:  { color: "text-green-400",  label: "Completed" },
  failed:     { color: "text-red-400",    label: "Failed" },
  cancelled:  { color: "text-gray-400",   label: "Cancelled" },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultAsset?: string;
}

export function WithdrawModal({ isOpen, onClose, defaultAsset = "USDT" }: Props) {
  const { address } = useWalletStore();
  const { getBalances, debit } = useExchangeBalanceStore();

  const [tab, setTab]         = useState<Tab>("withdraw");
  const [step, setStep]       = useState<Step>("form");
  const [asset, setAsset]     = useState(defaultAsset);
  const [network, setNetwork] = useState(NETWORKS[0]!);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]   = useState("");
  const [addrError, setAddrError] = useState("");
  const [amtError, setAmtError]   = useState("");
  const [netOpen, setNetOpen]     = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [requestId, setRequestId]   = useState("");

  const [history, setHistory]       = useState<WithdrawalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/withdrawals/${encodeURIComponent(address)}`);
      if (res.ok) setHistory(await res.json());
    } catch { /* silently ignore */ }
    finally { setHistoryLoading(false); }
  }, [address]);

  useEffect(() => {
    if (isOpen && address) fetchHistory();
  }, [isOpen, address, fetchHistory]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  if (!isOpen) return null;

  const dexBalances    = address ? getBalances(address) : {};
  const availableAssets = Object.entries(dexBalances)
    .filter(([, bal]) => bal > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const ASSETS = availableAssets.length > 0
    ? availableAssets.map(([tok]) => tok)
    : ["USDT", "ETH", "BNB", "BSV", "SOL", "BTC"];

  const dexBalance        = dexBalances[asset] ?? 0;
  const dexBalanceDisplay = dexBalance > 0
    ? dexBalance.toLocaleString(undefined, { maximumFractionDigits: dexBalance < 0.001 ? 8 : 6 })
    : "0.000000";

  const close = () => {
    setTab("withdraw");
    setStep("form");
    setRecipient("");
    setAmount("");
    setAddrError("");
    setAmtError("");
    setSubmitError("");
    setRequestId("");
    onClose();
  };

  const validate = () => {
    let ok = true;
    if (!recipient.trim() || recipient.trim().length < 20) {
      setAddrError("Please enter a valid wallet address (at least 20 characters).");
      ok = false;
    } else setAddrError("");
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) {
      setAmtError("Enter a valid amount greater than 0.");
      ok = false;
    } else if (n > dexBalance) {
      setAmtError(`Insufficient OrahDEX balance. You have ${dexBalanceDisplay} ${asset}.`);
      ok = false;
    } else setAmtError("");
    return ok;
  };

  const handleNext = () => { if (validate()) setStep("confirm"); };

  const handleSubmit = async () => {
    if (!address) return;
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(`${API_BASE}/withdrawals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          asset,
          amount: n.toString(),
          network:      network.id,
          networkLabel: network.label,
          recipient:    recipient.trim(),
          fee:          network.fee,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to submit withdrawal");
      }

      const data = await res.json();
      setRequestId(data.id ?? "");

      // Debit from local exchange balance store so UI refreshes immediately
      debit(address, asset, n);
      setStep("done");
      fetchHistory();
    } catch (err: any) {
      setSubmitError(err.message ?? "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const net = network;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sell/15 flex items-center justify-center">
              <ArrowUpFromLine className="w-5 h-5 text-sell" />
            </div>
            <div>
              <h3 className="font-bold text-base">Withdraw Funds</h3>
              <p className="text-xs text-muted-foreground">From OrahDEX Balance → Your Wallet</p>
            </div>
          </div>
          <button onClick={close} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["withdraw", "history"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "history" ? (
                <span className="flex items-center justify-center gap-1.5"><History className="w-3.5 h-3.5" />History {history.length > 0 ? `(${history.length})` : ""}</span>
              ) : (
                <span className="flex items-center justify-center gap-1.5"><ArrowUpFromLine className="w-3.5 h-3.5" />Withdraw</span>
              )}
            </button>
          ))}
        </div>

        {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 flex items-center justify-between border-b border-border/50">
              <p className="text-xs text-muted-foreground">All withdrawal requests for your wallet</p>
              <button onClick={fetchHistory} className="p-1 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
                <RefreshCw className={cn("w-3.5 h-3.5", historyLoading && "animate-spin")} />
              </button>
            </div>
            {historyLoading && history.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
                <History className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No withdrawal history yet.</p>
                <p className="text-xs text-muted-foreground/60">Your withdrawal requests will appear here once submitted.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {history.map(w => {
                  const st = STATUS_STYLE[w.status] ?? { color: "text-muted-foreground", label: w.status };
                  return (
                    <div key={w.id} className="p-4 hover:bg-white/3 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm font-bold">{w.amount.toFixed(6)} {w.asset}</p>
                          <p className="text-xs text-muted-foreground">{w.networkLabel}</p>
                        </div>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-white/5", st.color)}>{st.label}</span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground break-all mb-1">→ {w.recipient}</p>
                      {w.txid && (
                        <a
                          href={`https://etherscan.io/tx/${w.txid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> {w.txid.slice(0, 18)}…
                        </a>
                      )}
                      {w.note && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">{w.note}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                        {new Date(w.createdAt).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── WITHDRAW TAB ────────────────────────────────────────────────── */}
        {tab === "withdraw" && (
          <div className="flex-1 overflow-y-auto">

            {/* Step: Form */}
            {step === "form" && (
              <div className="p-5 space-y-4">

                {/* Important notice */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/80 leading-relaxed">
                    Withdrawals are processed manually by OrahDEX. Your request will be reviewed and sent within 24 hours. You will see the status in <button className="underline text-yellow-300" onClick={() => setTab("history")}>History</button>.
                  </p>
                </div>

                {/* Balance summary */}
                {availableAssets.length > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">OrahDEX Balance (withdrawable)</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      {availableAssets.map(([tok, bal]) => (
                        <div key={tok} className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-foreground">
                            {bal.toLocaleString(undefined, { maximumFractionDigits: bal < 0.001 ? 8 : 6 })}
                          </span>
                          <span className="text-xs text-muted-foreground">{tok}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {availableAssets.length === 0 && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/60 border border-border">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You have no OrahDEX balance to withdraw. Deposit funds and trade first, then your earned balance will appear here.
                    </p>
                  </div>
                )}

                {/* Asset */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">Asset</label>
                  <div className="relative">
                    <button
                      onClick={() => { setAssetOpen(o => !o); setNetOpen(false); }}
                      className="w-full flex items-center justify-between bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-semibold"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{asset[0]}</div>
                        <span>{asset}</span>
                        {dexBalance > 0 && <span className="text-xs text-muted-foreground font-normal">· {dexBalanceDisplay} available</span>}
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", assetOpen && "rotate-180")} />
                    </button>
                    {assetOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden">
                        {ASSETS.map(a => {
                          const bal = dexBalances[a] ?? 0;
                          return (
                            <button key={a} onClick={() => { setAsset(a); setAssetOpen(false); setAmount(""); }}
                              className={cn("w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-colors", a === asset && "text-primary")}>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{a[0]}</div>
                                {a}
                              </div>
                              {bal > 0 && <span className="text-xs text-muted-foreground">{bal.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Network */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">Withdrawal Network</label>
                  <div className="relative">
                    <button
                      onClick={() => { setNetOpen(o => !o); setAssetOpen(false); }}
                      className="w-full flex items-center justify-between bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                    >
                      <div className="text-left">
                        <p className="font-semibold">{net.label}</p>
                        <p className="text-xs text-muted-foreground">Fee {net.fee} · {net.time}</p>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", netOpen && "rotate-180")} />
                    </button>
                    {netOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden max-h-52 overflow-y-auto">
                        {NETWORKS.map(n => (
                          <button key={n.id} onClick={() => { setNetwork(n); setNetOpen(false); }}
                            className={cn("w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-colors", n.id === net.id && "text-primary bg-primary/5")}>
                            <span className="font-medium">{n.label}</span>
                            <span className="text-xs text-muted-foreground">{n.fee}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recipient */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">Recipient Address</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={e => { setRecipient(e.target.value); setAddrError(""); }}
                    className={cn(
                      "w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-all",
                      addrError ? "border-red-500/60" : "border-border"
                    )}
                    placeholder="0x... or bc1... or BSV address"
                  />
                  {addrError && <p className="text-xs text-red-400 mt-1">{addrError}</p>}
                </div>

                {/* Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Amount</label>
                    <button
                      onClick={() => { setAmount(dexBalance > 0 ? String(dexBalance) : ""); setAmtError(""); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Max ({dexBalanceDisplay} {asset})
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); setAmtError(""); }}
                      className={cn(
                        "w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-all pr-16",
                        amtError ? "border-red-500/60" : "border-border"
                      )}
                      placeholder="0.00"
                      min="0"
                      max={dexBalance}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{asset}</span>
                  </div>
                  {amtError && <p className="text-xs text-red-400 mt-1">{amtError}</p>}
                </div>

                <div className="flex items-center gap-2 bg-secondary/60 border border-border rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Network fee {net.fee} will be deducted. Arrives in {net.time} after processing.
                  </p>
                </div>

                <button
                  onClick={handleNext}
                  disabled={availableAssets.length === 0}
                  className="w-full py-3 rounded-xl bg-sell text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-sell/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Review Withdrawal
                </button>
              </div>
            )}

            {/* Step: Confirm */}
            {step === "confirm" && (
              <div className="p-5 space-y-4">
                <div className="bg-secondary/60 rounded-2xl p-4 space-y-3">
                  <Row label="Asset"   value={asset} />
                  <Row label="Network" value={net.label} />
                  <Row label="Amount"  value={`${amount} ${asset}`} highlight />
                  <Row label="Balance After" value={`${Math.max(0, dexBalance - parseFloat(amount || "0")).toFixed(6)} ${asset}`} />
                  <Row label="Network Fee" value={net.fee} />
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground mb-1">Recipient Address</p>
                    <p className="text-xs font-mono text-foreground break-all">{recipient}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-3 py-2.5">
                  <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/80">
                    Your request will be reviewed and processed within 24 hours. Track status in the History tab.
                  </p>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300/80">{submitError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep("form")} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl bg-sell text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-sell/20 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Confirm Withdrawal"}
                  </button>
                </div>
              </div>
            )}

            {/* Step: Done */}
            {step === "done" && (
              <div className="p-8 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-1">Request Submitted</h4>
                  <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                    Your withdrawal of <span className="text-foreground font-semibold">{amount} {asset}</span> has been recorded and will be processed within 24 hours.
                  </p>
                </div>
                {requestId && (
                  <div className="w-full bg-secondary/60 rounded-xl p-3 text-left">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Request ID</p>
                    <p className="text-xs font-mono text-foreground break-all">{requestId}</p>
                  </div>
                )}
                <div className="w-full bg-secondary/60 rounded-xl p-4 text-left space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>OrahDEX balance debited</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-yellow-400">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Withdrawal queued — processing within 24 hours</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <History className="w-3.5 h-3.5 shrink-0" />
                    <span>Track status in the History tab</span>
                  </div>
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => { setTab("history"); setStep("form"); }}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    View History
                  </button>
                  <button onClick={close} className="flex-1 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold", highlight ? "text-sell" : "text-foreground")}>{value}</span>
    </div>
  );
}
