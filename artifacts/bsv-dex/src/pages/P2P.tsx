import { useState, useMemo } from "react";
import { useSEO } from "@/hooks/useSEO";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import {
  Users2, Search, ChevronDown, Shield, Star, Clock, Plus, X, Check,
  ArrowUpDown, Filter, Globe, Zap, AlertCircle, MessageSquare, Lock,
  TrendingUp, Activity, CheckCircle2, Info, ChevronRight,
  ArrowLeftRight, Link2, Unlock, RefreshCw, AlertTriangle, Timer,
  Copy, Send, Wallet, ArrowRight, SlidersHorizontal, Trash2,
} from "lucide-react";
import { CoinLogo } from "@/components/CoinLogo";
import { cn, formatPrice } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

type Side = "buy" | "sell";

type Coin = "BTC" | "ETH" | "BSV" | "USDT" | "BNB" | "SOL";
type Fiat = "USD" | "EUR" | "GBP" | "AUD" | "NGN" | "INR" | "BRL" | "CAD" | "JPY" | "ZAR";

interface Offer {
  id: string;
  side: Side;
  coin: Coin;
  fiat: Fiat;
  trader: {
    name: string;
    avatar?: string;
    trades: number;
    completion: number;
    rating: number;
    verified: boolean;
    topTrader: boolean;
    online: boolean;
    responseTime: string;
    joinedYear: number;
  };
  price: number;
  available: number;
  minLimit: number;
  maxLimit: number;
  paymentMethods: string[];
  terms: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const COIN_PRICES: Record<Coin, number> = {
  BTC: 67_420,
  ETH: 3_510,
  BSV: 68.4,
  USDT: 1.0,
  BNB: 598,
  SOL: 172,
};

const ALL_PAYMENT_METHODS = [
  "Bank Transfer", "PayPal", "Wise", "Revolut", "Zelle", "Venmo",
  "Cash App", "M-Pesa", "Apple Pay", "Google Pay", "Cash in Person",
  "SEPA", "Strike", "Interac e-Transfer",
];

const AVATARS = [
  "CK", "FT", "AH", "SD", "MR", "LV", "PB", "KJ", "RN", "OM",
  "DW", "YT", "BE", "CF", "QM",
];

const AVATAR_COLORS = [
  "from-violet-600 to-purple-700",
  "from-blue-600 to-cyan-600",
  "from-green-600 to-emerald-600",
  "from-green-600 to-emerald-500",
  "from-pink-600 to-rose-600",
  "from-teal-600 to-cyan-700",
  "from-indigo-600 to-violet-600",
];

function makeOffer(
  id: string, side: Side, coin: Coin, fiat: Fiat,
  pricePct: number, availMult: number, payments: string[],
  trader: Partial<Offer["trader"]> & { name: string },
  terms: string
): Offer {
  const base = COIN_PRICES[coin];
  const price = parseFloat((base * pricePct).toFixed(fiat === "USD" ? 2 : 0));
  const available = parseFloat((availMult).toFixed(4));
  return {
    id, side, coin, fiat, price, available,
    minLimit: Math.round(price * available * 0.02),
    maxLimit: Math.round(price * available * 0.8),
    paymentMethods: payments,
    terms,
    trader: {
      trades: 0, completion: 0, rating: 0, verified: false,
      topTrader: false, online: true, responseTime: "< 5 min",
      joinedYear: 2020,
      ...trader,
    },
  };
}

const OFFERS: Offer[] = [
  // ── BTC / USD Buy offers ──
  makeOffer("b1","buy","BTC","USD",1.002,1.25,["Bank Transfer","PayPal"],
    {name:"CryptoKing99",avatar:"CK",trades:1234,completion:98.2,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 2 min",joinedYear:2019},
    "I trade fast. Send payment within 15 minutes of starting a trade. Include your name in the reference. No chargebacks accepted."),
  makeOffer("b2","buy","BTC","USD",0.999,2.10,["Wise","Revolut","SEPA"],
    {name:"FastSwapper",avatar:"FT",trades:567,completion:96.8,rating:4.7,verified:true,topTrader:false,online:true,responseTime:"< 5 min",joinedYear:2021},
    "Wise transfers preferred. Please initiate payment within 30 minutes. I'll release crypto as soon as payment is confirmed."),
  makeOffer("b3","buy","BTC","USD",1.005,0.85,["Zelle","Cash App","Venmo"],
    {name:"AlphaHodler",avatar:"AH",trades:342,completion:97.5,rating:4.8,verified:true,topTrader:false,online:false,responseTime:"< 15 min",joinedYear:2020},
    "US buyers only. Zelle preferred. Must be verified user with at least 5 completed trades on the platform."),
  makeOffer("b4","buy","BTC","USD",0.997,3.40,["Bank Transfer"],
    {name:"SatoshiDealer",avatar:"SD",trades:2891,completion:99.1,rating:5.0,verified:true,topTrader:true,online:true,responseTime:"< 1 min",joinedYear:2018},
    "Bank transfer only. I have been trading since 2018. Very fast, very reliable. Release within seconds of payment confirmation."),
  makeOffer("b5","buy","BTC","USD",1.001,0.62,["Apple Pay","Google Pay"],
    {name:"MoonRider",avatar:"MR",trades:189,completion:95.2,rating:4.5,verified:false,topTrader:false,online:true,responseTime:"< 10 min",joinedYear:2022},
    "Apple Pay and Google Pay accepted. Trade during business hours EST. Maximum $2000 per trade."),
  makeOffer("b6","buy","BTC","USD",1.003,1.90,["PayPal","Venmo"],
    {name:"LegacyVault",avatar:"LV",trades:743,completion:98.0,rating:4.8,verified:true,topTrader:false,online:false,responseTime:"< 20 min",joinedYear:2020},
    "PayPal Friends & Family only (no goods & services). Trades under $500 welcome. Fast and reliable since 2020."),
  makeOffer("b7","buy","BTC","USD",0.998,4.50,["Interac e-Transfer","Bank Transfer"],
    {name:"PolarBTC",avatar:"PB",trades:1102,completion:97.8,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 3 min",joinedYear:2019},
    "Canadian trades welcome. Interac e-Transfer preferred. I trade CAD/USD both. Auto-release enabled for verified traders."),
  // ── ETH / USD Buy offers ──
  makeOffer("be1","buy","ETH","USD",1.001,12.5,["Bank Transfer","SEPA","Wise"],
    {name:"EthWhale",avatar:"KJ",trades:876,completion:98.5,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 3 min",joinedYear:2020},
    "Large ETH volumes available. SEPA preferred for EU traders. Speak English or Spanish."),
  makeOffer("be2","buy","ETH","USD",0.998,5.8,["PayPal","Revolut"],
    {name:"RapidNode",avatar:"RN",trades:423,completion:96.0,rating:4.6,verified:true,topTrader:false,online:true,responseTime:"< 8 min",joinedYear:2021},
    "Revolut instant transfers preferred. EU and UK buyers welcome. I respond quickly."),
  // ── BSV / USD Buy offers ──
  makeOffer("bb1","buy","BSV","USD",1.015,500.0,["PayPal","Wise","Bank Transfer"],
    {name:"OnChainOm",avatar:"OM",trades:312,completion:97.1,rating:4.7,verified:true,topTrader:false,online:true,responseTime:"< 5 min",joinedYear:2021},
    "BSV specialist. I support the BSV ecosystem. Fair prices, fast trades. Happy to explain BSV to new users."),
  makeOffer("bb2","buy","BSV","USD",1.008,1200.0,["Bank Transfer","Strike"],
    {name:"DataChain",avatar:"DW",trades:654,completion:98.9,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 2 min",joinedYear:2019},
    "Large BSV volumes. Strike payments instant. Bank transfer same day. Serious buyers only."),
  // ── USDT / USD Buy offers ──
  makeOffer("bt1","buy","USDT","USD",1.001,25000.0,["Bank Transfer","Zelle","SEPA"],
    {name:"StablePro",avatar:"YT",trades:3421,completion:99.5,rating:5.0,verified:true,topTrader:true,online:true,responseTime:"< 1 min",joinedYear:2018},
    "USDT volume trader. Instant bank releases. Best rates in town. 5000+ satisfied customers."),
  // ── BTC / USD Sell offers ──
  makeOffer("s1","sell","BTC","USD",0.998,0.95,["Bank Transfer","PayPal"],
    {name:"BlockVendor",avatar:"BE",trades:987,completion:97.4,rating:4.8,verified:true,topTrader:true,online:true,responseTime:"< 3 min",joinedYear:2019},
    "I buy BTC fast. Send payment proof and I'll mark complete instantly. Reliable since 2019."),
  makeOffer("s2","sell","BTC","USD",0.995,2.30,["Wise","Revolut"],
    {name:"CoinFlex",avatar:"CF",trades:445,completion:95.8,rating:4.6,verified:true,topTrader:false,online:true,responseTime:"< 10 min",joinedYear:2021},
    "EU buyers preferred. Wise instant. No chargebacks. Please don't open disputes without messaging first."),
  makeOffer("s3","sell","BTC","USD",0.999,1.60,["Zelle","Cash App"],
    {name:"QuickMerchant",avatar:"QM",trades:1567,completion:98.7,rating:4.9,verified:true,topTrader:true,online:false,responseTime:"< 5 min",joinedYear:2020},
    "US only. I pay immediately. Large trades split into multiple if needed. Message before starting."),
  makeOffer("s4","sell","BTC","USD",0.993,5.00,["Bank Transfer"],
    {name:"CryptoKing99",avatar:"CK",trades:1234,completion:98.2,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 2 min",joinedYear:2019},
    "Selling my BTC holdings. Bank wire only for trades over $10k. Fastest releases guaranteed."),
  makeOffer("s5","sell","BTC","USD",0.996,0.75,["PayPal","Venmo","Cash App"],
    {name:"FastSwapper",avatar:"FT",trades:567,completion:96.8,rating:4.7,verified:true,topTrader:false,online:true,responseTime:"< 5 min",joinedYear:2021},
    "Quick buys welcome. Friends & family PayPal only. Max $1,500 per trade."),
  // ── ETH / USD Sell offers ──
  makeOffer("se1","sell","ETH","USD",0.997,18.0,["Bank Transfer","SEPA"],
    {name:"EthWhale",avatar:"KJ",trades:876,completion:98.5,rating:4.9,verified:true,topTrader:true,online:true,responseTime:"< 3 min",joinedYear:2020},
    "Large ETH buy orders. SEPA preferred. EUR or USD accepted."),
  // ── BSV Sell offers ──
  makeOffer("bs1","sell","BSV","USD",0.99,2000.0,["PayPal","Bank Transfer"],
    {name:"OnChainOm",avatar:"OM",trades:312,completion:97.1,rating:4.7,verified:true,topTrader:false,online:true,responseTime:"< 5 min",joinedYear:2021},
    "BSV buy orders welcome. Message me before starting. I respond within 5 min during business hours."),
  // ── USDT Sell offers ──
  makeOffer("st1","sell","USDT","USD",0.999,50000.0,["Bank Transfer","Zelle","SEPA"],
    {name:"StablePro",avatar:"YT",trades:3421,completion:99.5,rating:5.0,verified:true,topTrader:true,online:true,responseTime:"< 1 min",joinedYear:2018},
    "Largest USDT volume on the platform. Verified top trader. Guaranteed fastest release."),
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TraderAvatar({ avatar, color, online }: { avatar: string; color: string; online: boolean }) {
  return (
    <div className="relative shrink-0">
      <div className={cn("w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow", color)}>
        {avatar}
      </div>
      <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background", online ? "bg-green-500" : "bg-muted-foreground/50")} />
    </div>
  );
}

function PaymentBadge({ method }: { method: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary border border-border text-muted-foreground whitespace-nowrap">
      {method}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      <Star className="w-3 h-3 fill-green-400 text-green-400" />
      <span className="text-xs text-green-400 font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

// ─── Trade Modal ──────────────────────────────────────────────────────────────

function TradeModal({ offer, side, onClose }: { offer: Offer; side: Side; onClose: () => void }) {
  const [amountFiat, setAmountFiat] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const cryptoAmount = amountFiat ? (parseFloat(amountFiat) / offer.price).toFixed(6) : "";
  const avatarIdx = AVATARS.indexOf(offer.trader.avatar ?? "") % AVATAR_COLORS.length;

  const handleConfirm = () => setStep("confirm");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-6 py-4 border-b border-border",
          side === "buy" ? "bg-green-500/5" : "bg-red-500/5"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold",
              side === "buy" ? "bg-green-600" : "bg-red-600"
            )}>
              {side === "buy" ? "B" : "S"}
            </div>
            <div>
              <div className="font-semibold text-foreground">
                {side === "buy" ? `Buy ${offer.coin}` : `Sell ${offer.coin}`}
              </div>
              <div className="text-xs text-muted-foreground">from {offer.trader.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "form" ? (
          <div className="p-6 space-y-5">
            {/* Trader info */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
              <TraderAvatar avatar={offer.trader.avatar ?? ""} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground">{offer.trader.name}</span>
                  {offer.trader.verified && <Shield className="w-3.5 h-3.5 text-blue-400" />}
                  {offer.trader.topTrader && <Zap className="w-3.5 h-3.5 text-green-400" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{offer.trader.trades} trades</span>
                  <span className={offer.trader.completion >= 98 ? "text-green-400" : "text-green-400"}>
                    {offer.trader.completion}% completion
                  </span>
                  <StarRating rating={offer.trader.rating} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Rate</div>
                <div className="font-bold text-foreground">${offer.price.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">per {offer.coin}</div>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                How much do you want to {side === "buy" ? "spend" : "receive"}?
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amountFiat}
                  onChange={e => setAmountFiat(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground font-semibold text-lg pr-16 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">{offer.fiat}</span>
              </div>
              {cryptoAmount && (
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-muted-foreground">You {side === "buy" ? "receive" : "send"}</span>
                  <span className="font-semibold text-foreground">{cryptoAmount} {offer.coin}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>Limit: ${offer.minLimit.toLocaleString()} – ${offer.maxLimit.toLocaleString()}</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-green-500" /> Escrow protected</span>
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Payment method</label>
              <div className="flex flex-wrap gap-1.5">
                {offer.paymentMethods.map(m => (
                  <button key={m} className="px-3 py-1.5 rounded-lg border border-primary/60 bg-primary/10 text-primary text-xs font-medium">
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade terms */}
            <div className="p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-center gap-1.5 mb-1 text-foreground font-medium text-xs">
                <Info className="w-3.5 h-3.5" /> Trade terms
              </div>
              {offer.terms}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!amountFiat || parseFloat(amountFiat) < offer.minLimit || parseFloat(amountFiat) > offer.maxLimit}
                className={cn(
                  "flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all",
                  side === "buy"
                    ? "bg-green-600 hover:bg-green-500 disabled:bg-green-900/40 disabled:text-green-900"
                    : "bg-red-600 hover:bg-red-500 disabled:bg-red-900/40 disabled:text-red-900"
                )}
              >
                {side === "buy" ? `Buy ${offer.coin}` : `Sell ${offer.coin}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">Trade Initiated!</h3>
              <p className="text-sm text-muted-foreground">Your escrow is locked. {offer.trader.name} has been notified.</p>
            </div>
            <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Trade ID</span><span className="font-mono font-bold text-foreground">#ORH{Math.floor(Math.random()*900000+100000)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount ({offer.fiat})</span><span className="font-semibold">${parseFloat(amountFiat||"0").toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount ({offer.coin})</span><span className="font-semibold">{cryptoAmount} {offer.coin}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>${offer.price.toLocaleString()} / {offer.coin}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payment method</span><span>{offer.paymentMethods[0]}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><span className="flex items-center gap-1 text-green-400"><Clock className="w-3.5 h-3.5" /> Awaiting payment</span></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Send your payment within <strong>30 minutes</strong> and mark it as paid. The seller will release {offer.coin} from escrow after confirming receipt.</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                Close
              </button>
              <button className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" /> Open Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Ad Modal ────────────────────────────────────────────────────────────

function PostAdModal({ onClose }: { onClose: () => void }) {
  const [adSide, setAdSide] = useState<Side>("buy");
  const [coin, setCoin] = useState<Coin>("BTC");
  const [fiat, setFiat] = useState<Fiat>("USD");
  const [priceType, setPriceType] = useState<"fixed" | "market">("market");
  const [pricePct, setPricePct] = useState("1");
  const [fixedPrice, setFixedPrice] = useState("");
  const [available, setAvailable] = useState("");
  const [minLimit, setMinLimit] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [selectedPayments, setSelectedPayments] = useState<string[]>(["Bank Transfer"]);
  const [terms, setTerms] = useState("");
  const [posted, setPosted] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const { address: walletAddress } = useWalletStore();
  const qc = useQueryClient();

  const togglePayment = (m: string) =>
    setSelectedPayments(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]);

  const effectivePrice = priceType === "market"
    ? (COIN_PRICES[coin] * (1 + parseFloat(pricePct || "0") / 100)).toFixed(2)
    : fixedPrice;

  if (posted) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-xl font-bold mb-2">Ad Posted!</h3>
        <p className="text-muted-foreground text-sm mb-6">Your {adSide} ad for {coin} is now live on the marketplace.</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold">Done</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Post a Trade</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Side toggle */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">I want to</label>
            <div className="flex gap-2">
              {(["buy","sell"] as Side[]).map(s => (
                <button key={s} onClick={() => setAdSide(s)}
                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all capitalize",
                    adSide === s
                      ? s === "buy" ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {s} Crypto
                </button>
              ))}
            </div>
          </div>

          {/* Coin & Fiat */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Cryptocurrency</label>
              <select value={coin} onChange={e => setCoin(e.target.value as Coin)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {(["BTC","ETH","BSV","USDT","BNB","SOL"] as Coin[]).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Fiat currency</label>
              <select value={fiat} onChange={e => setFiat(e.target.value as Fiat)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {(["USD","EUR","GBP","AUD","NGN","INR","BRL","CAD","JPY","ZAR"] as Fiat[]).map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Pricing type</label>
            <div className="flex gap-2 mb-3">
              {(["market","fixed"] as const).map(t => (
                <button key={t} onClick={() => setPriceType(t)}
                  className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all capitalize",
                    priceType === t ? "bg-primary border-primary text-primary-foreground" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {t} {t === "market" ? "price" : "price"}
                </button>
              ))}
            </div>
            {priceType === "market" ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Market price</span>
                <div className="relative">
                  <input type="number" value={pricePct} onChange={e => setPricePct(e.target.value)}
                    className="w-24 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  = <strong className="text-foreground">${Number(effectivePrice).toLocaleString()}</strong> / {coin}
                </span>
              </div>
            ) : (
              <div className="relative">
                <input type="number" value={fixedPrice} onChange={e => setFixedPrice(e.target.value)}
                  placeholder={COIN_PRICES[coin].toString()}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-foreground text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{fiat} / {coin}</span>
              </div>
            )}
          </div>

          {/* Available, limits */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Available ({coin})</label>
              <input type="number" value={available} onChange={e => setAvailable(e.target.value)}
                placeholder="0.00"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Min limit ({fiat})</label>
              <input type="number" value={minLimit} onChange={e => setMinLimit(e.target.value)}
                placeholder="100"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Max limit ({fiat})</label>
              <input type="number" value={maxLimit} onChange={e => setMaxLimit(e.target.value)}
                placeholder="10000"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          {/* Payment methods */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Payment methods</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => togglePayment(m)}
                  className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    selectedPayments.includes(m)
                      ? "bg-primary/20 border-primary/60 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {selectedPayments.includes(m) && <Check className="w-3 h-3 inline mr-1" />}{m}
                </button>
              ))}
            </div>
          </div>

          {/* Trade terms */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Trade terms <span className="text-xs">(optional)</span></label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)}
              rows={3} placeholder="Describe your trade requirements, accepted locations, response time..."
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex flex-col gap-2 shrink-0">
          {postError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {postError}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              Cancel
            </button>
            <button
              onClick={async () => {
                setPostError(null);
                setIsPosting(true);
                try {
                  const coinPrice = COIN_PRICES[coin] ?? 1;
                  const price = priceType === "market"
                    ? coinPrice * (1 + parseFloat(pricePct || "0") / 100)
                    : parseFloat(fixedPrice || String(coinPrice));
                  const availAmt = parseFloat(available);
                  const minAmtOut = adSide === "buy"
                    ? (availAmt * 0.9)   // buyer intents: willing to give FIAT, get coin
                    : (availAmt * 0.9);  // seller intents: willing to give coin

                  const makerAddr = walletAddress ?? `anon-${Math.random().toString(36).slice(2,8)}`;
                  const r = await fetch(`${BASE}/api/p2p/intents`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      makerAddress:  makerAddr,
                      tokenIn:       adSide === "buy" ? fiat  : coin,
                      tokenOut:      adSide === "buy" ? coin  : fiat,
                      amountIn:      String(adSide === "buy" ? parseFloat(maxLimit || "1000") : availAmt),
                      minAmountOut:  String(minAmtOut),
                      price:         String(price),
                      fiat,
                      paymentMethods: selectedPayments.join(","),
                      terms,
                      expiresInMs: 24 * 60 * 60 * 1000,
                    }),
                  });
                  if (!r.ok) {
                    const e = await r.json();
                    throw new Error(e.error ?? "Failed to post");
                  }
                  qc.invalidateQueries({ queryKey: ["p2p-intents"] });
                  setPosted(true);
                } catch (e: any) {
                  setPostError(e?.message ?? "Failed to post ad");
                } finally {
                  setIsPosting(false);
                }
              }}
              disabled={!available || !minLimit || !maxLimit || selectedPayments.length === 0 || isPosting}
              className="flex-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {isPosting ? "Posting…" : "Post Ad"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main P2P Component ───────────────────────────────────────────────────────

const COINS: Coin[] = ["BTC", "ETH", "BSV", "USDT", "BNB", "SOL"];
const FIATS: Fiat[] = ["USD", "EUR", "GBP", "AUD", "NGN", "INR", "BRL", "CAD", "JPY", "ZAR"];

export function P2P() {
  useSEO({
    title: "P2P Trading — Buy & Sell Crypto Peer-to-Peer",
    description: "Buy and sell Bitcoin, Ethereum, BSV and more with 0 fees on OrahDEX P2P. Escrow-secured trades, 100+ payment methods, global merchants.",
    keywords: "P2P crypto, peer to peer bitcoin, buy BTC, sell ETH, crypto OTC, escrow trading, zero fee P2P, OrahDEX P2P",
    url: "/p2p",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX P2P Trading",
      "description": "Peer-to-peer cryptocurrency marketplace with escrow-protected trades",
      "url": "https://orahdex.replit.app/p2p"
    }
  });

  const [mainTab, setMainTab] = useState<"p2p" | "atomic" | "direct">("p2p");
  const [side, setSide] = useState<Side>("buy");
  const [coin, setCoin] = useState<Coin>("BTC");
  const [fiat, setFiat] = useState<Fiat>("USD");
  const [payFilter, setPayFilter] = useState("All methods");
  const [amountFilter, setAmountFilter] = useState("");
  const [showPostAd, setShowPostAd] = useState(false);
  const [tradeOffer, setTradeOffer] = useState<Offer | null>(null);
  const [tradeSide, setTradeSide] = useState<Side>("buy");
  const [showFiatDropdown, setShowFiatDropdown] = useState(false);
  const [showPayDropdown, setShowPayDropdown] = useState(false);

  // Atomic swap state
  const [atomicFrom, setAtomicFrom] = useState<Coin>("BTC");
  const [atomicTo, setAtomicTo]     = useState<Coin>("BSV");
  const [atomicAmt, setAtomicAmt]   = useState("");
  const [atomicStep, setAtomicStep] = useState<0|1|2|3|4>(0);
  const [htlcHash]                  = useState(() => Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join("").toUpperCase());
  const [htlcRunning, setHtlcRunning] = useState(false);

  const atomicFromPrice = COIN_PRICES[atomicFrom] ?? 1;
  const atomicToPrice   = COIN_PRICES[atomicTo]   ?? 1;
  const atomicOutput    = atomicAmt ? ((parseFloat(atomicAmt) * atomicFromPrice) / atomicToPrice) : 0;

  const startHtlc = () => {
    if (htlcRunning || !atomicAmt || parseFloat(atomicAmt) <= 0) return;
    setHtlcRunning(true);
    setAtomicStep(1);
    const advance = (step: 1|2|3|4, delay: number) =>
      setTimeout(() => { setAtomicStep(step); if (step === 4) setHtlcRunning(false); }, delay);
    advance(2, 1200); advance(3, 2800); advance(4, 4200);
  };

  // ── Direct Trade state ──────────────────────────────────────────────────────
  const ALL_COINS = ["ETH","BTC","BSV","USDT","USDC","BNB","SOL","AVAX","ARB","OP","POL","MATIC","DAI","LINK","UNI","AAVE","WBTC","CAKE","GMX","DEGEN","BRETT"] as const;
  type DirectCoin = typeof ALL_COINS[number];

  const [dtGiveCoin,  setDtGiveCoin]  = useState<DirectCoin>("ETH");
  const [dtWantCoin,  setDtWantCoin]  = useState<DirectCoin>("USDC");
  const [dtGiveAmt,   setDtGiveAmt]   = useState("");
  const [dtWantAmt,   setDtWantAmt]   = useState("");
  const [dtCounterparty, setDtCounterparty] = useState("");
  const [dtExpiry,    setDtExpiry]    = useState<number>(24 * 60 * 60 * 1000);
  const [dtPosting,   setDtPosting]   = useState(false);
  const [dtPostedId,  setDtPostedId]  = useState<string | null>(null);
  const [dtCopyDone,  setDtCopyDone]  = useState(false);
  const [dtFillId,    setDtFillId]    = useState<string | null>(null);
  const [dtFilling,   setDtFilling]   = useState(false);
  const [dtCancelId,  setDtCancelId]  = useState<string | null>(null);
  const [dtFilterCoin, setDtFilterCoin] = useState<DirectCoin | "ALL">("ALL");

  const { address: walletAddress } = useWalletStore();
  const { open: openWalletModal }  = useWalletModalStore();
  const qcDirect = useQueryClient();

  const directIntentsQ = useQuery<{ intents: Array<{
    intentId: string; makerAddress: string; tokenIn: string; tokenOut: string;
    amountIn: string; minAmountOut: string; price: string;
    status: string; createdAt: string; expiresAt: string;
    takerAddress?: string; filledAmountOut?: string; terms?: string;
  }> }>({
    queryKey: ["direct-intents", dtFilterCoin],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "open", limit: "50" });
      if (dtFilterCoin !== "ALL") params.set("tokenIn", dtFilterCoin);
      const r = await fetch(`${BASE}/api/p2p/intents?${params}`);
      if (!r.ok) return { intents: [] };
      return r.json();
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
    enabled: mainTab === "direct",
  });

  const myDirectIntentsQ = useQuery<{ intents: Array<{
    intentId: string; makerAddress: string; tokenIn: string; tokenOut: string;
    amountIn: string; minAmountOut: string; price: string;
    status: string; createdAt: string; expiresAt: string;
  }> }>({
    queryKey: ["my-direct-intents", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { intents: [] };
      const r = await fetch(`${BASE}/api/p2p/intents?maker=${walletAddress}&limit=20`);
      if (!r.ok) return { intents: [] };
      return r.json();
    },
    enabled: !!walletAddress && mainTab === "direct",
    refetchInterval: 20_000,
  });

  async function postDirectTrade() {
    if (!walletAddress) { openWalletModal(); return; }
    if (!dtGiveAmt || !dtWantAmt || parseFloat(dtGiveAmt) <= 0 || parseFloat(dtWantAmt) <= 0) return;
    setDtPosting(true);
    try {
      const body = {
        makerAddress: walletAddress,
        tokenIn:  dtGiveCoin,
        tokenOut: dtWantCoin,
        amountIn: dtGiveAmt,
        minAmountOut: dtWantAmt,
        expiresInMs: dtExpiry,
        terms: dtCounterparty ? `private:${dtCounterparty.toLowerCase()}` : "",
      };
      const r = await fetch(`${BASE}/api/p2p/intents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setDtPostedId(data.intentId);
      qcDirect.invalidateQueries({ queryKey: ["direct-intents"] });
      qcDirect.invalidateQueries({ queryKey: ["my-direct-intents"] });
    } catch (e: any) {
      alert(e.message ?? "Failed to post trade");
    } finally {
      setDtPosting(false);
    }
  }

  async function fillDirectTrade(intentId: string, wantAmt: string) {
    if (!walletAddress) { openWalletModal(); return; }
    setDtFilling(true);
    setDtFillId(intentId);
    try {
      const r = await fetch(`${BASE}/api/p2p/intents/${intentId}/fill`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takerAddress: walletAddress, amountOut: wantAmt }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Fill failed");
      qcDirect.invalidateQueries({ queryKey: ["direct-intents"] });
      qcDirect.invalidateQueries({ queryKey: ["my-direct-intents"] });
      alert("Trade filled! Both parties' balances have been updated.");
    } catch (e: any) {
      alert(e.message ?? "Fill failed");
    } finally {
      setDtFilling(false);
      setDtFillId(null);
    }
  }

  async function cancelDirectTrade(intentId: string) {
    if (!walletAddress) return;
    setDtCancelId(intentId);
    try {
      const r = await fetch(`${BASE}/api/p2p/intents/${intentId}?walletAddress=${walletAddress}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Cancel failed");
      qcDirect.invalidateQueries({ queryKey: ["direct-intents"] });
      qcDirect.invalidateQueries({ queryKey: ["my-direct-intents"] });
    } catch (e: any) {
      alert(e.message ?? "Cancel failed");
    } finally {
      setDtCancelId(null);
    }
  }

  function copyTradeLink(id: string) {
    const link = `${window.location.origin}${BASE}/p2p?trade=${id}`;
    navigator.clipboard.writeText(link).then(() => {
      setDtCopyDone(true);
      setTimeout(() => setDtCopyDone(false), 2000);
    });
  }

  const openDirectIntents = directIntentsQ.data?.intents ?? [];
  const myIntents = myDirectIntentsQ.data?.intents ?? [];

  // ── Live intents from real API ─────────────────────────────────────────────
  const intentsQ = useQuery<{ intents: Array<{
    intentId: string; makerAddress: string; tokenIn: string; tokenOut: string;
    amountIn: string; minAmountOut: string; price: string; fiat: string;
    paymentMethods: string; terms: string; status: string; createdAt: string;
  }> }>({
    queryKey: ["p2p-intents", side, coin, fiat],
    queryFn: async () => {
      const tokenIn  = side === "buy" ? fiat  : coin;
      const tokenOut = side === "buy" ? coin  : fiat;
      const r = await fetch(`${BASE}/api/p2p/intents?status=open&tokenIn=${tokenIn}&tokenOut=${tokenOut}&limit=20`);
      if (!r.ok) return { intents: [] };
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Convert live intents to Offer-compatible objects for display
  const liveOffers: (Offer & { isLive?: boolean })[] = useMemo(() => {
    if (!intentsQ.data?.intents) return [];
    const coinPrice = COIN_PRICES[coin] ?? 1;
    return intentsQ.data.intents.map((intent, idx) => {
      const price = parseFloat(intent.price ?? "0") || coinPrice;
      const amtIn = parseFloat(intent.amountIn);
      const available = side === "buy"
        ? parseFloat(intent.minAmountOut)
        : amtIn;
      const shortAddr = intent.makerAddress.length > 10
        ? `${intent.makerAddress.slice(0, 6)}…${intent.makerAddress.slice(-4)}`
        : intent.makerAddress;
      return {
        id: intent.intentId,
        side,
        coin,
        fiat,
        price,
        available,
        minLimit: Math.max(10, Math.round(price * available * 0.02)),
        maxLimit: Math.round(price * available * 0.9),
        paymentMethods: intent.paymentMethods ? intent.paymentMethods.split(",").map(s => s.trim()).filter(Boolean) : ["Any"],
        terms: intent.terms || "",
        isLive: true,
        trader: {
          name: shortAddr,
          trades: 0,
          completion: 100,
          rating: 5.0,
          verified: false,
          topTrader: false,
          online: true,
          responseTime: "< 10 min",
          joinedYear: 2024,
        },
      } as Offer & { isLive?: boolean };
    });
  }, [intentsQ.data, side, coin, fiat]);

  const filtered = useMemo(() => {
    let mockList = OFFERS.filter(o => o.side === side && o.coin === coin && o.fiat === fiat);
    if (payFilter !== "All methods") mockList = mockList.filter(o => o.paymentMethods.includes(payFilter));
    if (amountFilter) {
      const amt = parseFloat(amountFilter);
      mockList = mockList.filter(o => !isNaN(amt) && amt >= o.minLimit && amt <= o.maxLimit);
    }
    // Live intents go first, then mock offers
    const combined: (Offer & { isLive?: boolean })[] = [
      ...liveOffers,
      ...mockList.map(o => ({ ...o, isLive: false as const })),
    ];
    return combined.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return side === "buy" ? a.price - b.price : b.price - a.price;
    });
  }, [side, coin, fiat, payFilter, amountFilter, liveOffers]);

  // stats for hero
  const totalVolume24h = 48_900_000;
  const activeTraders = 12_843;
  const countries = 187;
  const completedTrades = 2_341_092;

  const allPayMethods = ["All methods", ...ALL_PAYMENT_METHODS];

  return (
    <div className="min-h-full w-full bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-gradient-to-b from-card/60 to-background px-4 lg:px-10 pt-0 pb-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users2 className="w-5 h-5 text-primary" />
                <span className="text-primary font-semibold text-sm uppercase tracking-widest">P2P Trading</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-1">
                Trade Crypto Peer-to-Peer
              </h1>
              <p className="text-muted-foreground text-sm lg:text-base">
                Buy and sell directly with verified traders. Funds secured by OrahDEX escrow.
              </p>
            </div>
            <button
              onClick={() => setShowPostAd(true)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Post a Trade
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: TrendingUp, label: "Volume 24h", value: `$${(totalVolume24h/1e6).toFixed(1)}M`, color: "text-green-400" },
              { icon: Users2, label: "Active Traders", value: activeTraders.toLocaleString(), color: "text-blue-400" },
              { icon: Globe, label: "Countries", value: countries.toString(), color: "text-violet-400" },
              { icon: Activity, label: "Completed Trades", value: `${(completedTrades/1e6).toFixed(2)}M`, color: "text-green-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-3 lg:p-4 flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg bg-secondary flex items-center justify-center", color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className={cn("font-bold text-base", color)}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border px-4 lg:px-10 py-3">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-3">

          {/* Main mode tabs */}
          <div className="flex bg-secondary rounded-xl p-1 border border-border">
            <button onClick={() => setMainTab("p2p")}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all",
                mainTab === "p2p" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              )}>
              <Users2 className="w-3.5 h-3.5" /> P2P Trades
            </button>
            <button onClick={() => setMainTab("direct")}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all",
                mainTab === "direct" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              )}>
              <Send className="w-3.5 h-3.5" /> Direct Trade
            </button>
            <button onClick={() => setMainTab("atomic")}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all",
                mainTab === "atomic" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              )}>
              <Link2 className="w-3.5 h-3.5" /> Atomic Swap
            </button>
          </div>

          {/* Buy / Sell tabs — only show for P2P mode */}
          {mainTab === "p2p" && (
          <div className="flex bg-secondary rounded-xl p-1 border border-border">
            {(["buy","sell"] as Side[]).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className={cn("px-5 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all",
                  side === s
                    ? s === "buy" ? "bg-green-600 text-white shadow" : "bg-red-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                {s}
              </button>
            ))}
          </div>
          )}

          {/* Coin selector */}
          <div className="flex gap-1.5 bg-secondary border border-border rounded-xl p-1">
            {COINS.map(c => (
              <button key={c} onClick={() => setCoin(c)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  coin === c ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}>
                {c}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="relative flex-1 min-w-[120px] max-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="number"
              value={amountFilter}
              onChange={e => setAmountFilter(e.target.value)}
              placeholder={`Amount (${fiat})`}
              className="w-full bg-secondary border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Fiat dropdown */}
          <div className="relative">
            <button onClick={() => { setShowFiatDropdown(p => !p); setShowPayDropdown(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors min-w-[80px]">
              {fiat} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showFiatDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-xl shadow-2xl z-30 py-1 min-w-[120px] max-h-60 overflow-y-auto">
                {FIATS.map(f => (
                  <button key={f} onClick={() => { setFiat(f); setShowFiatDropdown(false); }}
                    className={cn("w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors flex items-center justify-between",
                      fiat === f ? "text-primary font-semibold" : "text-foreground"
                    )}>
                    {f} {fiat === f && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment method dropdown */}
          <div className="relative">
            <button onClick={() => { setShowPayDropdown(p => !p); setShowFiatDropdown(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors max-w-[180px] truncate">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{payFilter}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
            {showPayDropdown && (
              <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-xl shadow-2xl z-30 py-1 min-w-[180px] max-h-60 overflow-y-auto">
                {allPayMethods.map(m => (
                  <button key={m} onClick={() => { setPayFilter(m); setShowPayDropdown(false); }}
                    className={cn("w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors flex items-center justify-between",
                      payFilter === m ? "text-primary font-semibold" : "text-foreground"
                    )}>
                    {m} {payFilter === m && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Direct Trade View ────────────────────────────────────────────── */}
      {mainTab === "direct" && (
        <div className="px-4 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-8">

          {/* ── Create offer ────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Send className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Create Direct Trade</div>
                  <div className="text-xs text-muted-foreground">Offer crypto, set your rate, share the link</div>
                </div>
              </div>

              {/* Posted success */}
              {dtPostedId ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7 text-green-500" />
                    </div>
                    <div className="font-bold text-foreground">Trade Offer Created!</div>
                    <div className="text-xs text-muted-foreground text-center">Share this link with your counterparty so they can fill the trade.</div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary border border-border">
                    <div className="flex-1 font-mono text-xs text-foreground truncate">
                      {`${window.location.origin}${BASE}/p2p?trade=${dtPostedId}`}
                    </div>
                    <button
                      onClick={() => copyTradeLink(dtPostedId)}
                      className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        dtCopyDone ? "bg-green-500/20 text-green-400" : "bg-primary/15 text-primary hover:bg-primary/25"
                      )}>
                      {dtCopyDone ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                  <button onClick={() => { setDtPostedId(null); setDtGiveAmt(""); setDtWantAmt(""); setDtCounterparty(""); }}
                    className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Create Another Trade
                  </button>
                </div>
              ) : (
              <div className="space-y-4">
                {/* You give */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">You Give</div>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl p-3 border border-border">
                    <div className="relative">
                      <select
                        value={dtGiveCoin}
                        onChange={e => setDtGiveCoin(e.target.value as any)}
                        className="appearance-none bg-transparent text-sm font-bold text-foreground pr-5 cursor-pointer focus:outline-none"
                      >
                        {ALL_COINS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    </div>
                    <input
                      type="number" value={dtGiveAmt} onChange={e => setDtGiveAmt(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 text-right bg-transparent font-mono font-semibold text-lg text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <button onClick={() => { const g=dtGiveCoin,w=dtWantCoin,ga=dtGiveAmt,wa=dtWantAmt; setDtGiveCoin(w); setDtWantCoin(g); setDtGiveAmt(wa); setDtWantAmt(ga); }}
                    className="w-9 h-9 rounded-full border border-border bg-secondary hover:border-primary/50 hover:bg-primary/10 flex items-center justify-center transition-all">
                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* You want */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">You Want</div>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl p-3 border border-border">
                    <div className="relative">
                      <select
                        value={dtWantCoin}
                        onChange={e => setDtWantCoin(e.target.value as any)}
                        className="appearance-none bg-transparent text-sm font-bold text-foreground pr-5 cursor-pointer focus:outline-none"
                      >
                        {ALL_COINS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    </div>
                    <input
                      type="number" value={dtWantAmt} onChange={e => setDtWantAmt(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 text-right bg-transparent font-mono font-semibold text-lg text-foreground focus:outline-none"
                    />
                  </div>
                  {dtGiveAmt && dtWantAmt && parseFloat(dtGiveAmt) > 0 && parseFloat(dtWantAmt) > 0 && (
                    <div className="text-xs text-muted-foreground mt-1.5 text-right">
                      Rate: 1 {dtGiveCoin} = {(parseFloat(dtWantAmt) / parseFloat(dtGiveAmt)).toFixed(6)} {dtWantCoin}
                    </div>
                  )}
                </div>

                {/* Counterparty (optional) */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Counterparty Address <span className="text-muted-foreground/50 normal-case font-normal">(optional — leave blank for public)</span>
                  </div>
                  <input
                    type="text" value={dtCounterparty} onChange={e => setDtCounterparty(e.target.value)}
                    placeholder="0x... or leave blank for anyone to fill"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* Expiry */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <Timer className="w-3 h-3" /> Offer Expires In
                  </div>
                  <div className="flex gap-2">
                    {([
                      [1 * 60 * 60 * 1000, "1h"],
                      [6 * 60 * 60 * 1000, "6h"],
                      [24 * 60 * 60 * 1000, "24h"],
                      [7 * 24 * 60 * 60 * 1000, "7d"],
                    ] as [number, string][]).map(([ms, label]) => (
                      <button key={label} onClick={() => setDtExpiry(ms)}
                        className={cn("flex-1 py-2 rounded-xl border text-xs font-semibold transition-all",
                          dtExpiry === ms ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                        )}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={postDirectTrade}
                  disabled={dtPosting || !dtGiveAmt || !dtWantAmt || parseFloat(dtGiveAmt) <= 0 || parseFloat(dtWantAmt) <= 0}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-primary-foreground flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {dtPosting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating…</> : walletAddress ? <><Send className="w-4 h-4" /> Create Trade Offer</> : <><Wallet className="w-4 h-4" /> Connect Wallet to Trade</>}
                </button>
              </div>
              )}
            </div>

            {/* My open offers */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground">My Offers</div>
                    <div className="text-xs text-muted-foreground">Your active direct trade offers</div>
                  </div>
                </div>
                <button onClick={() => qcDirect.invalidateQueries({ queryKey: ["my-direct-intents"] })}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {!walletAddress ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                  <Wallet className="w-8 h-8 text-muted-foreground/40" />
                  <div className="text-sm text-muted-foreground">Connect your wallet to see your offers</div>
                  <button onClick={openWalletModal} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Connect Wallet</button>
                </div>
              ) : myIntents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                  <Send className="w-8 h-8 text-muted-foreground/30" />
                  <div className="text-sm text-muted-foreground">No active offers yet</div>
                  <div className="text-xs text-muted-foreground/60">Create a trade on the left to get started</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {myIntents.map(intent => (
                    <div key={intent.intentId} className={cn(
                      "rounded-xl border p-3 space-y-2",
                      intent.status === "open" ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/20 opacity-60"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                            intent.status === "open" ? "bg-primary/20 text-primary" :
                            intent.status === "filled" ? "bg-green-500/20 text-green-400" :
                            "bg-muted/40 text-muted-foreground"
                          )}>{intent.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {intent.status === "open" && (
                            <button onClick={() => copyTradeLink(intent.intentId)}
                              className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary transition-colors" title="Copy link">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {intent.status === "open" && (
                            <button onClick={() => cancelDirectTrade(intent.intentId)}
                              disabled={dtCancelId === intent.intentId}
                              className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors" title="Cancel offer">
                              {dtCancelId === intent.intentId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-foreground">{parseFloat(intent.amountIn).toLocaleString()} {intent.tokenIn}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-bold text-foreground">{parseFloat(intent.minAmountOut).toLocaleString()} {intent.tokenOut}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">ID: {intent.intentId.slice(0, 18)}…</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Open market ──────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-foreground text-lg">Open Trade Offers</div>
                <div className="text-sm text-muted-foreground">Browse and fill open direct trades from other wallets</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 flex-wrap">
                  {(["ALL", "ETH", "BTC", "BSV", "USDT", "USDC", "BNB"] as const).map(c => (
                    <button key={c} onClick={() => setDtFilterCoin(c as any)}
                      className={cn("px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                        dtFilterCoin === c ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      )}>
                      {c}
                    </button>
                  ))}
                </div>
                <button onClick={() => qcDirect.invalidateQueries({ queryKey: ["direct-intents"] })}
                  className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <RefreshCw className={cn("w-4 h-4", directIntentsQ.isFetching && "animate-spin")} />
                </button>
              </div>
            </div>

            {openDirectIntents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-card border border-border rounded-2xl">
                <Send className="w-10 h-10 text-muted-foreground/30" />
                <div className="font-semibold text-foreground">No open offers yet</div>
                <div className="text-sm text-muted-foreground">Be the first to create a direct trade offer above.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                  <span>Maker</span>
                  <span>Offer</span>
                  <span>Rate</span>
                  <span>Expires</span>
                  <span className="text-right">Action</span>
                </div>
                {openDirectIntents.map(intent => {
                  const isOwnOffer = walletAddress && intent.makerAddress.toLowerCase() === walletAddress.toLowerCase();
                  const isPrivate = intent.terms?.startsWith("private:");
                  const privateTarget = isPrivate ? intent.terms!.replace("private:", "") : null;
                  const canFill = !isOwnOffer && (!isPrivate || (walletAddress && privateTarget === walletAddress.toLowerCase()));
                  const expiresAt = new Date(intent.expiresAt);
                  const minsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000));
                  const timeLabel = minsLeft > 60 * 24 ? `${Math.floor(minsLeft/1440)}d` : minsLeft > 60 ? `${Math.floor(minsLeft/60)}h` : `${minsLeft}m`;
                  const rate = parseFloat(intent.minAmountOut) / parseFloat(intent.amountIn);
                  const shortAddr = `${intent.makerAddress.slice(0,6)}…${intent.makerAddress.slice(-4)}`;
                  return (
                    <div key={intent.intentId}
                      className={cn(
                        "bg-card hover:bg-card/80 border rounded-2xl p-4 transition-all",
                        isOwnOffer ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/30",
                        isPrivate && !canFill && "opacity-60"
                      )}>
                      {/* Mobile layout */}
                      <div className="lg:hidden space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white text-[10px] font-bold">{shortAddr.slice(0,2).toUpperCase()}</div>
                            <div>
                              <div className="text-sm font-semibold text-foreground font-mono">{shortAddr}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {isOwnOffer && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">You</span>}
                                {isPrivate && <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Private</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Timer className="w-3 h-3" /> {timeLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 p-2.5 rounded-xl bg-secondary text-center">
                            <div className="text-[10px] text-muted-foreground">Give</div>
                            <div className="font-bold text-sm text-foreground">{parseFloat(intent.amountIn).toLocaleString()} {intent.tokenIn}</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 p-2.5 rounded-xl bg-secondary text-center">
                            <div className="text-[10px] text-muted-foreground">Want</div>
                            <div className="font-bold text-sm text-foreground">{parseFloat(intent.minAmountOut).toLocaleString()} {intent.tokenOut}</div>
                          </div>
                        </div>
                        {canFill && (
                          <button onClick={() => fillDirectTrade(intent.intentId, intent.minAmountOut)}
                            disabled={dtFilling && dtFillId === intent.intentId}
                            className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                            {dtFilling && dtFillId === intent.intentId ? <><RefreshCw className="w-4 h-4 animate-spin" /> Filling…</> : <><Check className="w-4 h-4" /> Accept Trade</>}
                          </button>
                        )}
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-4 items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{shortAddr.slice(0,2).toUpperCase()}</div>
                          <div>
                            <div className="text-sm font-mono text-foreground">{shortAddr}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isOwnOffer && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">You</span>}
                              {isPrivate && <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Private</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          <span className="text-foreground">{parseFloat(intent.amountIn).toLocaleString()} {intent.tokenIn}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground">{parseFloat(intent.minAmountOut).toLocaleString()} {intent.tokenOut}</span>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {rate.toFixed(rate < 0.01 ? 6 : 4)}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Timer className="w-3.5 h-3.5" /> {timeLabel}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => copyTradeLink(intent.intentId)}
                            className="w-8 h-8 rounded-xl hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Copy trade link">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {canFill ? (
                            <button onClick={() => fillDirectTrade(intent.intentId, intent.minAmountOut)}
                              disabled={dtFilling && dtFillId === intent.intentId}
                              className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
                              {dtFilling && dtFillId === intent.intentId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Accept
                            </button>
                          ) : isOwnOffer ? (
                            <button onClick={() => cancelDirectTrade(intent.intentId)}
                              disabled={dtCancelId === intent.intentId}
                              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
                              {dtCancelId === intent.intentId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              Cancel
                            </button>
                          ) : (
                            <div className="px-4 py-2 text-xs text-muted-foreground/50">Private</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { icon: Send,         title: "Create an Offer",    desc: "Choose what you give and what you want. Set your own rate. Optionally restrict to a specific wallet address for a private trade." },
              { icon: Copy,         title: "Share the Link",     desc: "Copy the unique trade link and send it to your counterparty — or leave the offer open for anyone in the market to fill." },
              { icon: CheckCircle2, title: "Instant Settlement", desc: "When filled, both sides settle atomically on OrahDEX internal ledger. No slippage, no gas, instant confirmation." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-5 bg-card border border-border rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground mb-1">{title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Atomic Swap View ─────────────────────────────────────────────── */}
      {mainTab === "atomic" && (
        <div className="px-4 lg:px-10 py-8 max-w-[1400px] mx-auto">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-foreground">HTLC Atomic Swap</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 font-bold">Trustless</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Swap crypto directly with a counterparty using Hash Time-Locked Contracts — no custodian, no wrapped tokens. Both sides lock funds simultaneously; revealing the secret preimage unlocks both.
              </p>
            </div>

            {/* Swap form */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              {/* From */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">You send</div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {(["BTC","ETH","BSV","SOL"] as Coin[]).map(c => (
                      <button key={c} onClick={() => setAtomicFrom(c)}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all",
                          atomicFrom === c ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}>{c}</button>
                    ))}
                  </div>
                  <input type="number" value={atomicAmt} onChange={e => { setAtomicAmt(e.target.value); setAtomicStep(0); }}
                    placeholder="0.00"
                    className="flex-1 text-right bg-secondary border border-border rounded-xl px-3 py-2 font-mono font-semibold text-lg text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                {atomicAmt && <div className="text-xs text-muted-foreground text-right mt-1">≈ ${(parseFloat(atomicAmt||"0") * atomicFromPrice).toLocaleString(undefined,{maximumFractionDigits:2})}</div>}
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <button onClick={() => { const f=atomicFrom,t=atomicTo; setAtomicFrom(t); setAtomicTo(f); setAtomicStep(0); }}
                  className="w-9 h-9 rounded-full border border-border bg-secondary hover:border-primary/50 hover:bg-primary/10 flex items-center justify-center transition-all">
                  <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* To */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">You receive</div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {(["BTC","ETH","BSV","SOL"] as Coin[]).map(c => (
                      <button key={c} onClick={() => setAtomicTo(c)}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all",
                          atomicTo === c ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}>{c}</button>
                    ))}
                  </div>
                  <div className="flex-1 text-right bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 font-mono font-semibold text-lg text-foreground">
                    {atomicOutput > 0 ? atomicOutput.toFixed(6) : "0.00"}
                  </div>
                </div>
                {atomicOutput > 0 && <div className="text-xs text-muted-foreground text-right mt-1">≈ ${(atomicOutput * atomicToPrice).toLocaleString(undefined,{maximumFractionDigits:2})}</div>}
              </div>

              {/* Rate summary */}
              {atomicOutput > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Exchange rate</span>
                    <span className="font-mono text-foreground">1 {atomicFrom} = {(atomicFromPrice/atomicToPrice).toFixed(6)} {atomicTo}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">HTLC timeout</span>
                    <span className="text-foreground flex items-center gap-1"><Timer className="w-3 h-3" /> 24 h refund window</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Settlement</span>
                    <span className="text-green-400 font-semibold flex items-center gap-1"><Zap className="w-3 h-3" /> BSV on-chain</span>
                  </div>
                </div>
              )}
            </div>

            {/* HTLC step-by-step */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="text-sm font-bold text-foreground mb-3">HTLC Protocol Steps</div>
              <div className="space-y-2">
                {[
                  { icon: <Lock className="w-3.5 h-3.5"/>,    label: `You lock ${atomicAmt||"0"} ${atomicFrom}`, detail: `HTLC script with hash H = ${htlcHash.slice(0,8)}…` },
                  { icon: <Link2 className="w-3.5 h-3.5"/>,   label: `Counterparty locks ${atomicOutput.toFixed(6)||"0"} ${atomicTo}`, detail: "Same hash H used — funds are mirrored on both chains" },
                  { icon: <Unlock className="w-3.5 h-3.5"/>,  label: "You reveal preimage S → unlock their funds", detail: "Revealing S on destination triggers your side" },
                  { icon: <CheckCircle2 className="w-3.5 h-3.5"/>, label: "Swap complete — BSV Settlement recorded", detail: "OP_RETURN on BSV chain confirms the atomic swap" },
                ].map((step, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all",
                    atomicStep > i ? "border-green-500/30 bg-green-500/5" :
                    atomicStep === i + 1 ? "border-primary/40 bg-primary/5" :
                    "border-border bg-secondary/20"
                  )}>
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-xs font-black",
                      atomicStep > i ? "bg-green-500/20 text-green-400" :
                      atomicStep === i + 1 ? "bg-primary/20 text-primary" :
                      "bg-muted/40 text-muted-foreground"
                    )}>
                      {atomicStep > i ? <CheckCircle2 className="w-3.5 h-3.5"/> : step.icon}
                    </div>
                    <div>
                      <div className={cn("text-xs font-semibold", atomicStep > i ? "text-green-400" : atomicStep === i+1 ? "text-foreground" : "text-muted-foreground")}>{step.label}</div>
                      <div className="text-[10px] text-muted-foreground">{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/8 text-xs text-amber-400/90">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Never share your HTLC preimage before confirming your counterparty's funds are locked. If no match is found before timeout, your funds are automatically refunded.</span>
            </div>

            {/* Submit */}
            <button
              onClick={startHtlc}
              disabled={!atomicAmt || parseFloat(atomicAmt) <= 0 || atomicFrom === atomicTo || htlcRunning}
              className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-orange-600 to-primary text-white flex items-center justify-center gap-2.5 shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {htlcRunning
                ? <><RefreshCw className="w-5 h-5 animate-spin" /> Executing HTLC…</>
                : <><Lock className="w-5 h-5" /> Initiate HTLC Swap</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Offer Table ──────────────────────────────────────────────────── */}
      {mainTab === "p2p" && (
      <div className="px-4 lg:px-10 py-4 max-w-[1400px] mx-auto">
        {/* Table header */}
        <div className="hidden lg:grid grid-cols-[2fr_1.2fr_1fr_1fr_2fr_auto] gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
          <span>Advertiser</span>
          <span className="flex items-center gap-1 cursor-pointer hover:text-foreground"><ArrowUpDown className="w-3 h-3" /> Price / {coin}</span>
          <span>Available</span>
          <span>Limit ({fiat})</span>
          <span>Payment</span>
          <span className="text-right">Action</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <div className="font-semibold text-foreground mb-1">No offers found</div>
            <div className="text-sm text-muted-foreground mb-4">Try adjusting your filters or post your own trade.</div>
            <button onClick={() => setShowPostAd(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              <Plus className="w-4 h-4" /> Post a Trade
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((offer, idx) => {
              const offerWithLive = offer as Offer & { isLive?: boolean };
              const avatarIdx = AVATARS.indexOf(offer.trader.avatar ?? "") % AVATAR_COLORS.length;
              return (
                <div key={offer.id}
                  className={cn(
                    "group bg-card hover:bg-card/80 border rounded-2xl p-4 transition-all duration-150",
                    offerWithLive.isLive
                      ? "border-primary/40 hover:border-primary/60 bg-primary/5"
                      : "border-border hover:border-primary/30",
                  )}>
                  {offerWithLive.isLive && (
                    <div className="flex items-center gap-1 mb-2 -mt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Live Intent
                      </span>
                    </div>
                  )}
                  {/* Mobile layout */}
                  <div className="lg:hidden">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <TraderAvatar avatar={offer.trader.avatar ?? ""} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm">{offer.trader.name}</span>
                            {offer.trader.verified && <Shield className="w-3.5 h-3.5 text-blue-400" />}
                            {offer.trader.topTrader && <Zap className="w-3.5 h-3.5 text-green-400" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{offer.trader.trades} trades</span>
                            <span className={offer.trader.completion >= 98 ? "text-green-400" : "text-green-400"}>{offer.trader.completion}%</span>
                            <StarRating rating={offer.trader.rating} />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-foreground">${offer.price.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">per {offer.coin}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {offer.paymentMethods.map(m => <PaymentBadge key={m} method={m} />)}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Limit: <span className="text-foreground">${offer.minLimit.toLocaleString()} – ${offer.maxLimit.toLocaleString()}</span>
                        <span className="ml-3">Avail: <span className="text-foreground">{offer.available} {offer.coin}</span></span>
                      </div>
                      <button
                        onClick={() => { setTradeOffer(offer); setTradeSide(side); }}
                        className={cn("px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all",
                          side === "buy" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"
                        )}>
                        {side === "buy" ? "Buy" : "Sell"} {offer.coin}
                      </button>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden lg:grid grid-cols-[2fr_1.2fr_1fr_1fr_2fr_auto] gap-4 items-center">
                    {/* Advertiser */}
                    <div className="flex items-center gap-3">
                      <TraderAvatar avatar={offer.trader.avatar ?? ""} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-foreground">{offer.trader.name}</span>
                          {offer.trader.verified && (
                            <span title="Verified" className="flex items-center">
                              <Shield className="w-3.5 h-3.5 text-blue-400" />
                            </span>
                          )}
                          {offer.trader.topTrader && (
                            <span title="Top Trader" className="flex items-center">
                              <Zap className="w-3.5 h-3.5 text-green-400" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{offer.trader.trades.toLocaleString()} trades</span>
                          <span className={cn("font-medium", offer.trader.completion >= 98 ? "text-green-400" : "text-green-400")}>
                            {offer.trader.completion}% completion
                          </span>
                          <StarRating rating={offer.trader.rating} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3" /> {offer.trader.responseTime}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div>
                      <div className="font-bold text-lg text-foreground">${offer.price.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{offer.fiat} per {offer.coin}</div>
                    </div>

                    {/* Available */}
                    <div>
                      <div className="font-semibold text-sm text-foreground">{offer.available} {offer.coin}</div>
                      <div className="text-xs text-muted-foreground">${(offer.available * offer.price).toLocaleString()}</div>
                    </div>

                    {/* Limits */}
                    <div>
                      <div className="text-sm font-semibold text-foreground">${offer.minLimit.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">– ${offer.maxLimit.toLocaleString()}</div>
                    </div>

                    {/* Payment */}
                    <div className="flex flex-wrap gap-1">
                      {offer.paymentMethods.slice(0, 3).map(m => <PaymentBadge key={m} method={m} />)}
                      {offer.paymentMethods.length > 3 && (
                        <span className="text-xs text-muted-foreground self-center">+{offer.paymentMethods.length - 3}</span>
                      )}
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => { setTradeOffer(offer); setTradeSide(side); }}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all whitespace-nowrap shadow-sm",
                        side === "buy"
                          ? "bg-green-600 hover:bg-green-500 hover:shadow-green-500/25 hover:shadow-lg"
                          : "bg-red-600 hover:bg-red-500 hover:shadow-red-500/25 hover:shadow-lg"
                      )}>
                      {side === "buy" ? "Buy" : "Sell"} {offer.coin}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Trust badges */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { icon: Lock, title: "Escrow Protection", desc: "All crypto is held in OrahDEX smart-contract escrow until payment is confirmed by both parties." },
            { icon: Shield, title: "Verified Traders", desc: "Our verification system ensures you trade with trustworthy counterparties with proven track records." },
            { icon: MessageSquare, title: "Real-time Chat", desc: "Built-in encrypted chat for every trade. Resolve disputes quickly with our moderation team." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 p-5 bg-card border border-border rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">{title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Modals */}
      {tradeOffer && (
        <TradeModal offer={tradeOffer} side={tradeSide} onClose={() => setTradeOffer(null)} />
      )}
      {showPostAd && <PostAdModal onClose={() => setShowPostAd(false)} />}

      {/* Click outside to close dropdowns */}
      {(showFiatDropdown || showPayDropdown) && (
        <div className="fixed inset-0 z-10" onClick={() => { setShowFiatDropdown(false); setShowPayDropdown(false); }} />
      )}
    </div>
  );
}
