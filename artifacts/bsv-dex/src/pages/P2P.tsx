import { useState, useMemo } from "react";
import {
  Users2, Search, ChevronDown, Shield, Star, Clock, Plus, X, Check,
  ArrowUpDown, Filter, Globe, Zap, AlertCircle, MessageSquare, Lock,
  TrendingUp, Activity, CheckCircle2, Info, ChevronRight
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

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
    avatar: string;
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
  "from-orange-600 to-amber-600",
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
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
      <span className="text-xs text-amber-400 font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

// ─── Trade Modal ──────────────────────────────────────────────────────────────

function TradeModal({ offer, side, onClose }: { offer: Offer; side: Side; onClose: () => void }) {
  const [amountFiat, setAmountFiat] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const cryptoAmount = amountFiat ? (parseFloat(amountFiat) / offer.price).toFixed(6) : "";
  const avatarIdx = AVATARS.indexOf(offer.trader.avatar) % AVATAR_COLORS.length;

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
              <TraderAvatar avatar={offer.trader.avatar} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground">{offer.trader.name}</span>
                  {offer.trader.verified && <Shield className="w-3.5 h-3.5 text-blue-400" />}
                  {offer.trader.topTrader && <Zap className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{offer.trader.trades} trades</span>
                  <span className={offer.trader.completion >= 98 ? "text-green-400" : "text-yellow-400"}>
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
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><span className="flex items-center gap-1 text-amber-400"><Clock className="w-3.5 h-3.5" /> Awaiting payment</span></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
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
        <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={() => setPosted(true)}
            disabled={!available || !minLimit || !maxLimit || selectedPayments.length === 0}
            className="flex-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            Post Ad
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main P2P Component ───────────────────────────────────────────────────────

const COINS: Coin[] = ["BTC", "ETH", "BSV", "USDT", "BNB", "SOL"];
const FIATS: Fiat[] = ["USD", "EUR", "GBP", "AUD", "NGN", "INR", "BRL", "CAD", "JPY", "ZAR"];

export function P2P() {
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

  const filtered = useMemo(() => {
    let list = OFFERS.filter(o => o.side === side && o.coin === coin && o.fiat === fiat);
    if (payFilter !== "All methods") list = list.filter(o => o.paymentMethods.includes(payFilter));
    if (amountFilter) {
      const amt = parseFloat(amountFilter);
      list = list.filter(o => !isNaN(amt) && amt >= o.minLimit && amt <= o.maxLimit);
    }
    return list.sort((a, b) => side === "buy" ? a.price - b.price : b.price - a.price);
  }, [side, coin, fiat, payFilter, amountFilter]);

  // stats for hero
  const totalVolume24h = 48_900_000;
  const activeTraders = 12_843;
  const countries = 187;
  const completedTrades = 2_341_092;

  const allPayMethods = ["All methods", ...ALL_PAYMENT_METHODS];

  return (
    <div className="min-h-full w-full bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-gradient-to-b from-card/60 to-background px-4 lg:px-10 pt-8 pb-6">
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
              { icon: Activity, label: "Completed Trades", value: `${(completedTrades/1e6).toFixed(2)}M`, color: "text-amber-400" },
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

          {/* Buy / Sell tabs */}
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

      {/* ── Offer Table ──────────────────────────────────────────────────── */}
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
              const avatarIdx = AVATARS.indexOf(offer.trader.avatar) % AVATAR_COLORS.length;
              return (
                <div key={offer.id}
                  className="group bg-card hover:bg-card/80 border border-border hover:border-primary/30 rounded-2xl p-4 transition-all duration-150">
                  {/* Mobile layout */}
                  <div className="lg:hidden">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <TraderAvatar avatar={offer.trader.avatar} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm">{offer.trader.name}</span>
                            {offer.trader.verified && <Shield className="w-3.5 h-3.5 text-blue-400" />}
                            {offer.trader.topTrader && <Zap className="w-3.5 h-3.5 text-amber-400" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{offer.trader.trades} trades</span>
                            <span className={offer.trader.completion >= 98 ? "text-green-400" : "text-yellow-400"}>{offer.trader.completion}%</span>
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
                      <TraderAvatar avatar={offer.trader.avatar} color={AVATAR_COLORS[avatarIdx]} online={offer.trader.online} />
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
                              <Zap className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{offer.trader.trades.toLocaleString()} trades</span>
                          <span className={cn("font-medium", offer.trader.completion >= 98 ? "text-green-400" : "text-yellow-400")}>
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
