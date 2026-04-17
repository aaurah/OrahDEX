import {
  TrendingUp, TrendingDown,
  ArrowDownToLine,
  Copy, Check, RefreshCw, Info,
  LogOut, Zap, Droplets, ExternalLink, ArrowLeftRight, CreditCard,
  ArrowDownLeft, ArrowUpRight, History,
} from "lucide-react";

import { useWalletStore } from "@/store/useWalletStore";
import { disconnectReown } from "@/lib/reown";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReceiveModal } from "@/components/ReceiveModal";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { cn, getProviderLabel } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount, getCurrencySymbol } from "@/store/useSettingsStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useTronBalances } from "@/hooks/useTronBalances";
import { useLiquidityStore } from "@/store/useLiquidityStore";

import { EXPLORER_TX, CHAIN_NAMES } from "@/lib/onChainLiquidity";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Per-asset canonical withdrawal network (independent of connected wallet)
const ASSET_NETWORK_MAP: Record<string, { network: string; networkLabel: string; placeholder: string }> = {
  BTC:   { network: "btc",  networkLabel: "Bitcoin",            placeholder: "bc1... or 1... or 3..." },
  BSV:   { network: "bsv",  networkLabel: "Bitcoin SV",         placeholder: "1... (BSV P2PKH)" },
  BCH:   { network: "bch",  networkLabel: "Bitcoin Cash",       placeholder: "1... (P2PKH — same fork address as BTC/BSV)" },
  ETH:   { network: "evm",  networkLabel: "Ethereum Mainnet",   placeholder: "0x... (ERC-20 address)" },
  USDT:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  USDC:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  DAI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  TUSD:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  FDUSD: { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  AAVE:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  LINK:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  UNI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  BNB:   { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  BUSD:  { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  MATIC: { network: "evm",  networkLabel: "Polygon",            placeholder: "0x... (Polygon address)" },
  AVAX:  { network: "evm",  networkLabel: "Avalanche C-Chain",  placeholder: "0x... (Avalanche address)" },
  FTM:   { network: "evm",  networkLabel: "Fantom",             placeholder: "0x... (Fantom address)" },
  SOL:   { network: "sol",  networkLabel: "Solana",             placeholder: "Solana wallet address" },
  TRX:   { network: "tron", networkLabel: "TRON Network",       placeholder: "T... (TRON address)" },
  BTT:   { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  XRP:   { network: "xrp",  networkLabel: "XRP Ledger",         placeholder: "r... (XRP address)" },
  ADA:   { network: "ada",  networkLabel: "Cardano",            placeholder: "addr1... (Cardano address)" },
  DOGE:  { network: "doge", networkLabel: "Dogecoin",           placeholder: "D... (Dogecoin address)" },
  DOT:   { network: "dot",  networkLabel: "Polkadot",           placeholder: "1... (Polkadot address)" },
  LTC:   { network: "ltc",  networkLabel: "Litecoin",           placeholder: "L... or ltc1..." },
  XLM:   { network: "xlm",  networkLabel: "Stellar",            placeholder: "G... (Stellar address)" },
  ICP:   { network: "icp",  networkLabel: "Internet Computer",  placeholder: "xxxxx-xxxxx (ICP principal)" },
  SUI:   { network: "sui",  networkLabel: "Sui Network",        placeholder: "0x... (Sui address)" },
  ARB:   { network: "evm",  networkLabel: "Arbitrum One",       placeholder: "0x... (Arbitrum address)" },
  OP:    { network: "evm",  networkLabel: "Optimism",           placeholder: "0x... (Optimism address)" },
  USDD:  { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  BONK:  { network: "sol",  networkLabel: "Solana (SPL)",       placeholder: "Solana wallet address" },
};

function getAssetNetworkInfo(asset: string, connectedNetwork: string | null):
  { network: string; networkLabel: string; placeholder: string } {
  if (ASSET_NETWORK_MAP[asset]) return ASSET_NETWORK_MAP[asset];
  const net = connectedNetwork ?? "evm";
  return { network: net, networkLabel: net.toUpperCase(), placeholder: "Destination address" };
}

// Map EVM chainId → portfolio native symbol
const EVM_NATIVE: Record<number, string> = {
  1: "ETH", 10: "ETH", 42161: "ETH", 8453: "ETH",
  59144: "ETH", 324: "ETH", 534352: "ETH", 5000: "MNT",
  56: "BNB", 137: "MATIC", 43114: "AVAX", 250: "FTM", 25: "CRO",
};

function getNativeAsset(network: string | null, chainId: number | null): string {
  if (network === "bsv")  return "BSV";
  if (network === "sol")  return "SOL";
  if (network === "btc")  return "BTC";
  if (network === "tron") return "TRX";
  if (network === "evm" && chainId) return EVM_NATIVE[chainId] ?? "ETH";
  return "ETH";
}

const ASSET_COLORS: Record<string, string> = {
  ETH: "#8B5CF6", BNB: "#EAB308", MATIC: "#7C3AED", POL: "#7C3AED",
  USDT: "#22C55E", USDC: "#3B82F6", DAI: "#EAB308", WBTC: "#F97316",
  TUSD: "#1D4ED8", BUSD: "#F59E0B", FDUSD: "#64748B",
  LINK: "#2563EB", BSV: "#22C55E", BTC: "#F97316", SOL: "#9945FF",
  AVAX: "#E84142", FTM: "#1969FF", MNT: "#6B7280", ADA: "#0033AD",
  DOGE: "#C8A300", DOT: "#E6007A", LTC: "#A0A0A0", XRP: "#00A9E0",
  UNI: "#FF007A", AAVE: "#B6509E", BCH: "#8DC351",
  TRX: "#EF4444", BTT: "#9333EA", WIN: "#F59E0B", JST: "#06B6D4",
  ICP: "#F15A24", BONK: "#FF9900", SUI: "#4DA2FF", ARB: "#2D374B",
  OP:  "#FF0420", USDD: "#1B7D3A",
};

const TRON_POOL_IDS = new Set(["trx-usdt","btt-usdt","btt-trx","win-trx","jst-usdt","trx-btc"]);

const POOL_LABELS_MOBILE: Record<string, string> = {
  "btc-usdt":  "BTC / USDT",  "eth-usdt":  "ETH / USDT",
  "sol-usdt":  "SOL / USDT",  "bsv-usdt":  "BSV / USDT",
  "bnb-usdt":  "BNB / USDT",  "xrp-usdt":  "XRP / USDT",
  "ada-usdt":  "ADA / USDT",  "doge-usdt": "DOGE / USDT",
  "dot-usdt":  "DOT / USDT",  "link-usdt": "LINK / USDT",
  "bsv-btc":   "BSV / BTC",   "eth-btc":   "ETH / BTC",
  "trx-usdt":  "TRX / USDT",  "btt-usdt":  "BTT / USDT",
  "btt-trx":   "BTT / TRX",   "win-trx":   "WIN / TRX",
  "jst-usdt":  "JST / USDT",  "trx-btc":   "TRX / BTC",
};

interface MarketRow { symbol: string; baseAsset: string; lastPrice: number; priceChangePercent24h: number; }

function useLivePrices() {
  return useQuery<Record<string, MarketRow>>({
    queryKey: ["portfolio-mobile-prices"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/markets`, { cache: "no-store" });
      if (!res.ok) throw new Error("price fetch failed");
      const rows: MarketRow[] = await res.json();
      // Only use USDT-quoted pairs so non-USDT cross rates don't corrupt prices
      const usdtRows = rows.filter(r => r.quoteAsset === "USDT");
      return Object.fromEntries(usdtRows.map(r => [r.baseAsset, r]));
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

const STATUS_COLOR: Record<string, string> = { open: "#4ade80", filled: "#22c55e", cancelled: "#6b7280" };

type Tab = "assets" | "defi" | "orders" | "history";

export function MobilePortfolio() {
  const { address, network, provider, chainId, balance, disconnect, internalEvmAddress } = useWalletStore();
  // For orah-wallet, always query the ledger using the EVM address (primary account key)
  // so switching to BSV/BTC network doesn't fetch a different (empty) ledger account
  const ledgerAddress = (provider === "orah-wallet" && internalEvmAddress) ? internalEvmAddress : address;
  const { quoteCurrency } = useSettingsStore();
  const { getUserPositions, removePosition, clearWalletPositions } = useLiquidityStore();
  const lpPositions = address ? Object.entries(getUserPositions(address)) : [];
  const { open: openWallet } = useWalletModalStore();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("assets");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [buyCryptoOpen, setBuyCryptoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string | null>(null);
  const [coinHistoryOpen, setCoinHistoryOpen] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState<{ asset: string; available: number; network: string; networkLabel: string; color: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: exchangeBalances = [] } = useQuery<{ asset: string; available: string; locked: string }[]>({
    queryKey: ["mobile-exchange-balances", ledgerAddress],
    queryFn: async () => {
      if (!ledgerAddress) return [];
      const r = await fetch(`${BASE}/api/balances?walletAddress=${encodeURIComponent(ledgerAddress)}`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.balances ?? []);
    },
    enabled: !!ledgerAddress,
    refetchInterval: 10_000,
    staleTime: 0,
    refetchOnMount: true,
  });

  const exchBalancesWithValue = exchangeBalances
    .map(b => ({ ...b, free: parseFloat(b.available), locked: parseFloat(b.locked) }))
    .filter(b => b.free > 0 || b.locked > 0);

  const { data: prices, isLoading: pricesLoading, refetch } = useLivePrices();
  const { balances: evmBalances, refresh: evmRefresh } = useEvmBalances(
    network === "evm" ? address : null,
    network === "evm" ? (chainId ?? 1) : null,
  );
  const { balances: tronBalances, refresh: tronRefresh } = useTronBalances(
    network === "tron" ? address : null,
  );

  const nativeAsset = getNativeAsset(network, chainId);
  const nativeBalance = balance ? parseFloat(balance) : 0;

  const { data: ordersData } = useQuery({
    queryKey: ["portfolio-orders", ledgerAddress],
    queryFn: () => fetch(`${BASE}/api/orders?walletAddress=${encodeURIComponent(ledgerAddress || "")}`).then(r => r.json()),
    enabled: !!ledgerAddress,
    refetchInterval: 2000,
  });
  const myOrders: any[] = Array.isArray(ordersData) ? ordersData : [];

  const { data: historyData = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["trade-history", ledgerAddress],
    queryFn: () => fetch(`${BASE}/api/trades/history?walletAddress=${encodeURIComponent(ledgerAddress || "")}&limit=100`).then(r => r.json()),
    enabled: !!ledgerAddress,
    staleTime: 30_000,
  });

  // All coins that appear in history (for filter chips)
  const historyCoins: string[] = (() => {
    const seen = new Set<string>();
    for (const t of historyData) {
      const base = (t.symbol ?? "BSV/USDT").split("/")[0] ?? "BSV";
      seen.add(base);
    }
    return Array.from(seen);
  })();

  // Group history by date label (filtered by selected coin)
  const historyByDate: { label: string; trades: any[] }[] = (() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const groups: Record<string, any[]> = {};
    const filtered = historyFilter
      ? historyData.filter(t => {
          const base = (t.symbol ?? "BSV/USDT").split("/")[0];
          return base === historyFilter;
        })
      : historyData;
    for (const t of filtered) {
      const d = new Date(t.timestamp ?? t.createdAt ?? Date.now());
      d.setHours(0,0,0,0);
      const label = d.getTime() === today.getTime() ? "Today"
        : d.getTime() === yesterday.getTime() ? "Yesterday"
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    }
    return Object.entries(groups).map(([label, trades]) => ({ label, trades }));
  })();

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`${BASE}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ledgerAddress }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onMutate: async (orderId) => {
      setCancellingId(orderId);
      await queryClient.cancelQueries({ queryKey: ["portfolio-orders", ledgerAddress] });
      const prev = queryClient.getQueryData(["portfolio-orders", ledgerAddress]);
      queryClient.setQueryData(["portfolio-orders", ledgerAddress], (old: any) =>
        Array.isArray(old)
          ? old.map((o: any) => String(o.id) === orderId ? { ...o, status: "cancelled", updatedAt: new Date().toISOString() } : o)
          : old
      );
      return { prev };
    },
    onError: (_err, _id, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["portfolio-orders", ledgerAddress], context.prev);
      }
    },
    onSettled: () => {
      setCancellingId(null);
      queryClient.invalidateQueries({ queryKey: ["portfolio-orders", ledgerAddress] });
      queryClient.invalidateQueries({ queryKey: ["orders", ledgerAddress] });
    },
  });

  const handleSweepToLedger = async () => {
    if (!address || sweeping) return;
    setSweeping(true);
    setSweepMsg(null);
    try {
      const res = await fetch(`${BASE}/api/deposit/sweep-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, chainId: chainId ?? 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSweepMsg(data.error ?? "Sweep failed");
      } else {
        setSweepMsg(data.message ?? "Credited to trading account");
        queryClient.invalidateQueries({ queryKey: ["mobile-exchange-balances", address] });
      }
    } catch {
      setSweepMsg("Network error. Please try again.");
    } finally {
      setSweeping(false);
    }
  };

  // Build rows from real on-chain data where available
  const rows = (() => {
    // EVM: use all tokens returned by useEvmBalances (includes native + ERC-20)
    if (network === "evm" && evmBalances.length > 0) {
      return evmBalances.map(b => {
        const stableSymbols = ["USDT", "USDC", "DAI", "BUSD", "TUSD"];
        const isStable = stableSymbols.includes(b.symbol.toUpperCase());
        const mkt = prices?.[b.symbol];
        const price = b.price > 0 ? b.price : isStable ? 1 : (mkt?.lastPrice ?? 0);
        const change = b.change24h !== 0 ? b.change24h : isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const usdValue = b.usdValue > 0 ? b.usdValue : b.amount * price;
        const color = ASSET_COLORS[b.symbol] ?? "#6B7280";
        return { asset: b.symbol, color, amount: b.amount, price, change, value: usdValue, isNative: b.isNative };
      });
    }
    // TRON: use real balances from useTronBalances hook
    if (network === "tron" && tronBalances.length > 0) {
      return tronBalances.map(b => {
        const isStable = ["USDT","USDC"].includes(b.symbol);
        const mkt = prices?.[b.symbol];
        const price = b.price ?? (isStable ? 1 : (mkt?.lastPrice ?? 0));
        const change = isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const usdValue = b.usdValue ?? (b.amount * price);
        const color = ASSET_COLORS[b.symbol] ?? "#EF4444";
        return { asset: b.symbol, color, amount: b.amount, price, change, value: usdValue, isNative: b.isNative };
      });
    }
    // Non-EVM wallets: show native asset with stored balance
    const nativeColor = ASSET_COLORS[nativeAsset] ?? "#6B7280";
    return [{ asset: nativeAsset, color: nativeColor, amount: nativeBalance, price: 0, change: 0, value: 0, isNative: true }];
  })();

  // eslint-disable-next-line prefer-const
  let tokensTotal = rows.reduce((s, r) => s + r.value, 0);
  const lpTotalValue = lpPositions.reduce((s, [, pos]) => s + (pos.depositedValueUsd ?? 0), 0);

  // Non-custodial: wallet rows are shown as-is — no OrahDEX ledger adjustments.
  // Trades settle directly wallet-to-wallet; no internal balance tracking needed.

  // ── BUCKET 2: Busy in Trade — assets locked in open limit/stop orders ─────
  // For SELL orders: base asset is reserved (e.g. 0.003 ETH locked for a sell)
  // For BUY  orders: quote asset is reserved (price × qty USDT)
  const openOrders = myOrders.filter(o => o.status === "open" || o.status === "pending");
  const lockedByAsset: Record<string, { amount: number; orders: { id: string; symbol: string; side: string; qty: number; price: number; type: string }[] }> = {};
  for (const order of openOrders) {
    const parts = (order.symbol ?? "").split("/");
    const base  = parts[0] ?? "";
    const quote = parts[1] ?? "USDT";
    if (order.side === "sell") {
      const qty = parseFloat(order.quantity) || parseFloat(order.qty) || 0;
      if (qty > 0 && base) {
        if (!lockedByAsset[base]) lockedByAsset[base] = { amount: 0, orders: [] };
        lockedByAsset[base].amount += qty;
        lockedByAsset[base].orders.push({ id: order.id, symbol: order.symbol, side: "sell", qty, price: parseFloat(order.price) || 0, type: order.type ?? "limit" });
      }
    } else {
      const qty   = parseFloat(order.quantity) || parseFloat(order.qty) || 0;
      const price = parseFloat(order.price) || 0;
      const cost  = price > 0 ? price * qty : 0;
      if (cost > 0 && quote) {
        if (!lockedByAsset[quote]) lockedByAsset[quote] = { amount: 0, orders: [] };
        lockedByAsset[quote].amount += cost;
        lockedByAsset[quote].orders.push({ id: order.id, symbol: order.symbol, side: "buy", qty, price, type: order.type ?? "limit" });
      }
    }
  }
  const lockedEntries = Object.entries(lockedByAsset).filter(([, v]) => v.amount > 0);
  const STABLES = new Set(["USDT","USDC","DAI","BUSD","TUSD","FDUSD","USDD","oUSD"]);
  const lockedTotalUsd = lockedEntries.reduce((s, [token, v]) => {
    const p = STABLES.has(token) ? 1 : (prices?.[token]?.lastPrice ?? 0);
    return s + v.amount * p;
  }, 0);

  // ── BUCKET 1: Wallet balance (real on-chain, minus OrahDEX-consumed amounts) ──
  const total = tokensTotal;
  const nonZero = rows.filter(r => r.amount > 0);
  const totalChange = tokensTotal > 0 && nonZero.length > 0
    ? nonZero.reduce((s, r) => s + (r.value * r.change) / 100, 0) / tokensTotal * 100
    : 0;

  // ── Orah Wallet: exchange balance is the primary trading balance ───────────
  const isOrahWallet = provider === "orah-wallet";

  const exchTotalUsd = exchBalancesWithValue.reduce((sum, b) => {
    const p = STABLES.has(b.asset) ? 1 : (prices?.[b.asset]?.lastPrice ?? 0);
    return sum + (b.free + b.locked) * p;
  }, 0);

  const exchNonZero = exchBalancesWithValue.map(b => {
    const p = STABLES.has(b.asset) ? 1 : (prices?.[b.asset]?.lastPrice ?? 0);
    const change = STABLES.has(b.asset) ? 0 : (prices?.[b.asset]?.priceChangePercent24h ?? 0);
    return { ...b, price: p, value: (b.free + b.locked) * p, change };
  }).filter(b => b.free > 0 || b.locked > 0);

  // On-chain native asset price (e.g. ETH, BNB, BSV) from the live price feed
  const nativeAssetPriceUsd = (() => {
    const isStable = ["USDT","USDC","DAI","BUSD"].includes(nativeAsset);
    return isStable ? 1 : (prices?.[nativeAsset]?.lastPrice ?? 0);
  })();
  const nativeBalanceUsd = nativeBalance * nativeAssetPriceUsd;

  // Combined total: exchange ledger + on-chain native balance
  const combinedTotalUsd = exchTotalUsd + nativeBalanceUsd;

  // Show Trading Balance card if Orah/Reown wallet OR if the address has any
  // exchange ledger balances (covers edge cases where provider string differs).
  const showTradingBalance = isOrahWallet || exchNonZero.length > 0;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto pb-24">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
        </div>

        {/* Hero card */}
        <div className="mx-4 mt-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-3">
            <Zap size={28} className="text-primary" />
          </div>
          <h2 className="text-2xl font-black text-foreground tracking-tight">Login to Trade</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Connect your wallet to view live balances, track P&amp;L, receive funds, and start trading instantly.
          </p>
        </div>

        {/* Wallet options */}
        <div className="mx-4 mt-5 space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">Choose your wallet type</p>

          {/* EVM */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-blue-500/40 hover:bg-blue-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🦊
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">EVM Wallets</p>
              <p className="text-xs text-muted-foreground mt-0.5">MetaMask · Coinbase · Trust · Ledger + all L2s</p>
              <div className="flex gap-1 mt-1.5">
                {["ETH","BNB","MATIC","ARB","BASE","AVAX","MNT"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-blue-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* TRON */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🔴
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">TRON Wallet</p>
              <p className="text-xs text-muted-foreground mt-0.5">TronLink · imToken · Trust · TokenPocket · OKX</p>
              <div className="flex gap-1 mt-1.5">
                {["TRX","USDT","BTT","WIN","JST"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-red-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* BSV */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Bitcoin SV Wallet</p>
              <p className="text-xs text-muted-foreground mt-0.5">HandCash · RelayX · Panda · Sensilet · manual</p>
              <div className="flex gap-1 mt-1.5">
                {["BSV","FAST","LOW FEE"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-primary text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* SOL / BTC */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-violet-500/40 hover:bg-violet-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🌐
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Other Wallets</p>
              <p className="text-xs text-muted-foreground mt-0.5">Phantom (SOL) · UniSat · Xverse (BTC) · more</p>
              <div className="flex gap-1 mt-1.5">
                {["SOL","BTC","ORDINALS"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-violet-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        </div>

        {/* Features list */}
        <div className="mx-4 mt-5 p-4 rounded-2xl bg-secondary/40 border border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-3">After connecting you can:</p>
          <div className="space-y-2">
            {[
              { icon: "📊", text: "View live portfolio balance & P&L" },
              { icon: "💳", text: "Buy crypto with fiat (Apple Pay, Card, Bank)" },
              { icon: "💸", text: "Receive funds directly to your wallet" },
              { icon: "⚡", text: "Trade spot & futures markets" },
              { icon: "🔗", text: "Cross-chain BSV settlements via HTLC" },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span className="text-base leading-none">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <BuyCryptoModal open={buyCryptoOpen} onClose={() => setBuyCryptoOpen(false)} />
      {withdrawAsset && (() => {
        const assetNet = getAssetNetworkInfo(withdrawAsset.asset, network);
        const sameNetwork = assetNet.network === (network ?? "evm");
        return (
          <WithdrawSheet
            open={withdrawOpen}
            onClose={() => { setWithdrawOpen(false); setWithdrawAsset(null); }}
            walletAddress={address ?? ""}
            defaultRecipient={sameNetwork ? (address ?? "") : ""}
            asset={withdrawAsset.asset}
            available={withdrawAsset.available}
            network={assetNet.network}
            networkLabel={assetNet.networkLabel}
            addressPlaceholder={assetNet.placeholder}
            color={withdrawAsset.color}
          />
        );
      })()}

      <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
        {/* Header */}
        <div className="px-4 pt-safe-top pb-3 pt-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
            {network && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {provider ? getProviderLabel(provider) : network.toUpperCase()} · {network.toUpperCase()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { refetch(); if (network === "evm") evmRefresh?.(); if (network === "tron") tronRefresh?.(); }}
              className="p-2 rounded-full border border-border text-muted-foreground hover:text-foreground transition-all"
              title="Refresh"
            >
              <RefreshCw size={13} className={pricesLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={async () => {
                if (provider === "reown") await disconnectReown();
                disconnect();
              }}
              className="p-2 rounded-full border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-all"
              title="Disconnect wallet"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* ── BUCKET 1: Balance card ───────────────────────────────────────────── */}
          {showTradingBalance ? (
            /* ── Orah Wallet / any user with exchange balances: Trading Balance is primary ── */
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Zap size={12} className="text-primary" />
                  <p className="text-xs text-muted-foreground font-medium">Trading Balance</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/25">
                  Orah Wallet
                </span>
              </div>

              {pricesLoading && combinedTotalUsd === 0 ? (
                <div className="h-9 w-44 bg-muted/40 rounded-lg animate-pulse mb-2" />
              ) : (
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {formatQuoteAmount(combinedTotalUsd, quoteCurrency)}
                </p>
              )}

              <p className="text-[10px] text-muted-foreground mt-1 mb-4">
                Trading account + on-chain balance
              </p>

              {/* Exchange token rows */}
              {exchNonZero.length > 0 && (
                <div className="space-y-2.5">
                  {exchNonZero.map(b => {
                    const color = ASSET_COLORS[b.asset] ?? "#6B7280";
                    const assetNet = getAssetNetworkInfo(b.asset, network);
                    return (
                      <div key={b.asset} className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border"
                          style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
                        >
                          {b.asset[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{b.asset}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {b.free.toLocaleString(undefined, { maximumFractionDigits: b.free < 0.001 ? 8 : 4 })}
                            {b.locked > 0 && (
                              <span className="text-orange-400/70"> · {b.locked.toLocaleString(undefined, { maximumFractionDigits: 4 })} locked</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-bold text-foreground">{formatQuoteAmount(b.value, quoteCurrency)}</p>
                            {b.change !== 0 && (
                              <p className={`text-xs mt-0.5 ${b.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                                {b.change >= 0 ? "+" : ""}{b.change.toFixed(2)}%
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setWithdrawAsset({ asset: b.asset, available: b.free, network: assetNet.network, networkLabel: assetNet.networkLabel, color });
                              setWithdrawOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 border border-primary/25 text-primary active:bg-primary/20 shrink-0"
                          >
                            Withdraw
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* On-chain balance row — included in combined total above */}
              {nativeBalance > 0 && (
                <div className={cn("flex items-center gap-3", exchNonZero.length > 0 && "mt-2.5")}>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border"
                    style={{ backgroundColor: (ASSET_COLORS[nativeAsset] ?? "#6B7280") + "22", borderColor: (ASSET_COLORS[nativeAsset] ?? "#6B7280") + "44", color: ASSET_COLORS[nativeAsset] ?? "#6B7280" }}
                  >
                    {nativeAsset[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{nativeAsset} <span className="text-[10px] text-muted-foreground font-normal">(on-chain)</span></p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {nativeBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatQuoteAmount(nativeBalanceUsd, quoteCurrency)}</p>
                    </div>
                    <button
                      onClick={handleSweepToLedger}
                      disabled={sweeping}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 border border-primary/25 text-primary active:bg-primary/20 disabled:opacity-50 shrink-0"
                    >
                      {sweeping ? "…" : "Deposit"}
                    </button>
                  </div>
                </div>
              )}
              {sweepMsg && (
                <p className={cn("text-[10px] mt-1", sweepMsg.includes("+") ? "text-green-400" : "text-red-400")}>
                  {sweepMsg}
                </p>
              )}
            </div>
          ) : (
            /* ── External wallet: on-chain balance is primary ── */
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Wallet Balance</p>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                  network === "bsv" ? "bg-green-500/10 text-green-400 border-green-500/25"
                    : network === "evm" ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                    : network === "sol" ? "bg-violet-500/10 text-violet-400 border-violet-500/25"
                    : "bg-secondary text-muted-foreground border-border"
                )}>
                  {provider ? getProviderLabel(provider) : (network ?? "").toUpperCase()}
                </span>
              </div>
              {pricesLoading && total === 0 ? (
                <div className="h-9 w-44 bg-muted/40 rounded-lg animate-pulse mb-2" />
              ) : (
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {formatQuoteAmount(total, quoteCurrency)}
                </p>
              )}

              {total > 0 && (() => {
                const pnlUsd = total * totalChange / 100;
                return (
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className={cn("flex items-center gap-1.5", totalChange >= 0 ? "text-green-500" : "text-red-500")}>
                      {totalChange >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      <span className="text-sm font-bold">{totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}%</span>
                    </div>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className={cn("text-sm font-semibold", totalChange >= 0 ? "text-green-400/80" : "text-red-400/80")}>
                      {pnlUsd >= 0 ? "+" : "−"}{formatQuoteAmount(Math.abs(pnlUsd), quoteCurrency)} today
                    </span>
                  </div>
                );
              })()}

              {/* Available vs Locked breakdown */}
              {lockedTotalUsd > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Available</p>
                    <p className="text-sm font-bold text-green-400">{formatQuoteAmount(Math.max(0, total - lockedTotalUsd), quoteCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Busy in Trade</p>
                    <p className="text-sm font-bold text-orange-400">{formatQuoteAmount(lockedTotalUsd, quoteCurrency)}</p>
                  </div>
                </div>
              )}

              {/* Allocation bar */}
              {total > 0 && nonZero.length > 0 && (
                <>
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-4 gap-0.5">
                    {nonZero.map(r => (
                      <div key={r.asset} className="h-full rounded-full" style={{ flex: r.value / total, backgroundColor: r.color }} />
                    ))}
                  </div>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {nonZero.map(r => (
                      <div key={r.asset} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="text-[10px] text-muted-foreground">{r.asset}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BUCKET 2: Busy in Trade (locked in open limit/stop orders) ───── */}
          {lockedEntries.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/25 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="text-sm font-bold text-orange-300">Busy in Trade</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wide">Reserved</span>
                </div>
                <span className="text-base font-bold text-orange-300">{formatQuoteAmount(lockedTotalUsd, quoteCurrency)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3">
                Reserved for your open limit/stop orders. Released back when orders are filled or cancelled.
              </p>
              <div className="space-y-2">
                {lockedEntries.map(([token, v]) => {
                  const isStable = ["USDT","USDC","DAI","BUSD"].includes(token);
                  const p = isStable ? 1 : (prices?.[token]?.lastPrice ?? 0);
                  const usdVal = v.amount * p;
                  return (
                    <div key={token} className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-foreground">{token}</span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {v.orders.map(o => (
                            <span key={o.id} className="mr-2">
                              {o.type.toUpperCase()} {o.side.toUpperCase()} {o.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} {o.symbol?.split("/")[0]}
                              {o.price > 0 ? ` @ $${o.price.toLocaleString()}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs font-mono text-foreground">{v.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                        {usdVal > 0 && <div className="text-[10px] text-muted-foreground">≈ {formatQuoteAmount(usdVal, quoteCurrency)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Buy / Receive / Bridge */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setBuyCryptoOpen(true)} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-gradient-to-b from-green-600 to-emerald-600 text-white font-bold text-xs shadow-lg shadow-green-600/20 active:opacity-90">
              <CreditCard size={15} />
              Buy
            </button>
            <button onClick={() => setReceiveOpen(true)} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-lg shadow-primary/20 active:opacity-90">
              <ArrowDownToLine size={15} />
              Receive
            </button>
            <button onClick={() => navigate("/deposit-bsv")} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-xs active:bg-green-500/20 transition-colors">
              <ArrowLeftRight size={15} />
              Bridge
            </button>
          </div>

          {/* Fund CTAs */}
          <button onClick={() => setBuyCryptoOpen(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-green-500/5 border border-green-500/20 hover:border-green-500/40 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <CreditCard size={16} className="text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Buy Crypto with Fiat</p>
              <p className="text-xs text-muted-foreground truncate">Apple Pay · Google Pay · Card · Bank Transfer — instant</p>
            </div>
            <span className="text-green-400 text-xs font-medium shrink-0">Buy →</span>
          </button>
          <button onClick={() => setReceiveOpen(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Receive via QR Code</p>
              <p className="text-xs text-muted-foreground truncate">ETH · BNB · MATIC · ARB · BASE · AVAX · Linea · Scroll · Mantle · all EVM</p>
            </div>
            <span className="text-primary text-xs font-medium shrink-0">Scan →</span>
          </button>


          {/* ── BUCKET 4: DeFi / Liquidity (LP tokens, Uniswap, AMM) ─────────── */}
          {lpTotalValue > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Droplets size={14} className="text-primary" />
                  <span className="text-sm font-bold text-foreground">DeFi / Liquidity</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase tracking-wide">LP</span>
                </div>
                <span className="text-base font-bold text-primary">{formatQuoteAmount(lpTotalValue, quoteCurrency)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Liquidity deposited into AMM pools (Uniswap, etc.). Underlying tokens stay in your wallet — value shown here is your LP position.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {(["assets", "defi", "orders", "history"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  tab === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                {t === "assets" ? "Token"
                  : t === "defi" ? "DeFi"
                  : t === "orders" ? "Orders"
                  : <><History size={11} className="shrink-0" />History</>}
                {t === "defi" && lpPositions.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                    {lpPositions.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Assets tab */}
          {tab === "assets" && (
            <>
              {/* Note about single-chain view for EVM wallets */}
              {network === "evm" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <Info size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Showing on-chain balances for your connected network. Switch chains in your wallet to view other assets.
                  </p>
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
                {rows.map((r, i) => (
                  <div
                    key={r.asset}
                    onClick={() => setCoinHistoryOpen(r.asset)}
                    className={`flex items-center gap-3 px-4 py-3.5 active:bg-muted/40 cursor-pointer transition-colors ${i < rows.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                      style={{ backgroundColor: r.color + "22", borderColor: r.color + "44", color: r.color }}
                    >
                      {r.asset[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground">{r.asset}</p>
                        {r.isNative && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/25">
                            NATIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {r.amount > 0
                          ? r.amount.toLocaleString(undefined, { maximumFractionDigits: r.amount < 0.0001 ? 8 : 6 })
                          : "0.000000"}
                      </p>
                      {r.price > 0 && !["USDT","USDC","DAI"].includes(r.asset) && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          @ ${r.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: r.price < 1 ? 6 : 2,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">
                        {formatQuoteAmount(r.value, quoteCurrency)}
                      </p>
                      {r.change !== 0 && (
                        <p className={`text-xs font-medium mt-0.5 ${r.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* OrahDEX Exchange Balances — hidden when Trading Balance card is shown above */}
              {!showTradingBalance && exchBalancesWithValue.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <Zap size={12} className="text-primary" />
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">OrahDEX Exchange</span>
                  </div>
                  <div className="bg-card border border-primary/20 rounded-2xl overflow-hidden">
                    {exchBalancesWithValue.map((b, i) => {
                      const color = ASSET_COLORS[b.asset] ?? "#6B7280";
                      const assetNet = getAssetNetworkInfo(b.asset, network);
                      return (
                        <div
                          key={b.asset}
                          className={`flex items-center gap-3 px-4 py-3.5 ${i < exchBalancesWithValue.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <button
                            onClick={() => setCoinHistoryOpen(b.asset)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left active:bg-muted/30 transition-colors rounded-lg -ml-1 pl-1"
                          >
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                              style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
                            >
                              {b.asset[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{b.asset}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                {b.free.toLocaleString(undefined, { maximumFractionDigits: b.free < 0.0001 ? 8 : 6 })}
                                {b.locked > 0 && <span className="text-muted-foreground/50"> · {b.locked.toLocaleString(undefined, { maximumFractionDigits: 4 })} locked</span>}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setWithdrawAsset({ asset: b.asset, available: b.free, network: assetNet.network, networkLabel: assetNet.networkLabel, color });
                              setWithdrawOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors shrink-0"
                          >
                            Withdraw
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1 mt-1.5">
                    Post-trade balances credited to your OrahDEX account. Withdraw to your wallet anytime.
                  </p>
                </div>
              )}
            </>
          )}

          {/* DeFi tab */}
          {tab === "defi" && (
            lpPositions.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <Droplets className="w-8 h-8 opacity-30 mb-1" />
                <p className="text-sm font-medium">No DeFi positions yet</p>
                <p className="text-xs opacity-60 text-center">Add liquidity to a pool to get started</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-4">

                {/* DeFi summary row — only when LP positions exist */}
                {lpPositions.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground">Total LP Value</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-primary">
                      ${lpTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {address && (
                      <button
                        onClick={() => { if (window.confirm("Remove all LP positions? This only clears the local record — no on-chain change.")) clearWalletPositions(address); }}
                        className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
                )}

                {lpPositions.map(([poolId, pos]) => {
                  const display = POOL_LABELS_MOBILE[poolId] ?? poolId.toUpperCase().replace("-", " / ");
                  const explorerBase = pos.chainId ? EXPLORER_TX[pos.chainId] : null;
                  const txUrl   = explorerBase && pos.txHash ? `${explorerBase}${pos.txHash}` : null;
                  const dateStr = new Date(pos.depositedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                  const isTronPool = TRON_POOL_IDS.has(poolId);
                  const chainName = pos.chainId ? (CHAIN_NAMES[pos.chainId] ?? `Chain ${pos.chainId}`) : isTronPool ? "TRON" : null;
                  const chainColor = pos.chainId === 1 ? { bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/25" }
                    : pos.chainId === 8453 ? { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25" }
                    : isTronPool ? { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25" }
                    : { bg: "bg-secondary/50", text: "text-muted-foreground", border: "border-border" };
                  return (
                    <div key={poolId} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm">{display}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[10px] text-green-400 font-semibold">ACTIVE · EARNING FEES</span>
                          </div>
                        </div>
                        {chainName && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${chainColor.bg} ${chainColor.text} ${chainColor.border}`}>
                            {chainName}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary/30 rounded-xl p-3">
                          <div className="text-[10px] text-muted-foreground mb-0.5">LP Tokens</div>
                          <div className="font-mono font-bold text-sm">{pos.lpTokens.toFixed(4)}</div>
                        </div>
                        <div className="bg-secondary/30 rounded-xl p-3">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Est. Value</div>
                          <div className="font-mono font-bold text-sm">{formatQuoteAmount(pos.depositedValueUsd, quoteCurrency)}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{dateStr}</span>
                        <div className="flex items-center gap-2">
                          {txUrl ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold"
                            >
                              View Tx <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : pos.txHash ? (
                            <span className="font-mono text-[10px]">{pos.txHash.slice(0, 8)}…</span>
                          ) : null}
                          {address && (
                            <button
                              onClick={() => removePosition(address, poolId)}
                              className="text-[10px] px-2 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Orders tab */}
          {tab === "orders" && (
            myOrders.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <p className="text-sm font-medium">No orders yet</p>
                <p className="text-xs opacity-60 text-center">Your open and past orders will appear here</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
                {myOrders.map((o: any, i: number) => (
                  <div
                    key={o.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${i < myOrders.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{o.symbol}</span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: o.side === "buy" ? "#22c55e18" : "#ef444418",
                            color: o.side === "buy" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {o.side.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {o.type ?? "limit"} · {Number(o.quantity).toFixed(4)} @ ${Number(o.price).toLocaleString()}
                      </p>
                    </div>
                    {o.status === "open" ? (
                      <button
                        onClick={() => cancelMutation.mutate(String(o.id))}
                        disabled={cancellingId === String(o.id)}
                        className="shrink-0 px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 text-[11px] font-bold active:bg-red-500/10 disabled:opacity-40 transition-all"
                      >
                        {cancellingId === String(o.id) ? "…" : "Cancel"}
                      </button>
                    ) : (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold capitalize" style={{ color: STATUS_COLOR[o.status] ?? "#6b7280" }}>
                          {o.status}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(o.updatedAt ?? o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* History tab */}
          {tab === "history" && (
            historyLoading ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <RefreshCw size={20} className="animate-spin opacity-40" />
                <p className="text-xs">Loading history…</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <History size={28} className="opacity-20 mb-1" />
                <p className="text-sm font-medium">No transaction history yet</p>
                <p className="text-xs opacity-60 text-center">Your trades will appear here after you buy or sell</p>
              </div>
            ) : (
              <>
                {/* Coin filter chips */}
                {historyCoins.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      onClick={() => setHistoryFilter(null)}
                      className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        !historyFilter
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-card border-border text-muted-foreground"
                      }`}
                    >
                      All
                    </button>
                    {historyCoins.map(coin => (
                      <button
                        key={coin}
                        onClick={() => setHistoryFilter(historyFilter === coin ? null : coin)}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          historyFilter === coin
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-card border-border text-muted-foreground"
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold"
                          style={{ backgroundColor: (ASSET_COLORS[coin] ?? "#6B7280") + "33", color: ASSET_COLORS[coin] ?? "#6B7280" }}
                        >
                          {coin[0]}
                        </span>
                        {coin}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-4 mb-4">
                  {historyByDate.map(({ label, trades }) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1 mb-1.5">{label}</p>
                      <div className="bg-card border border-border rounded-2xl overflow-hidden">
                        {trades.map((t: any, i: number) => {
                          const isBuy  = (t.side ?? "buy") === "buy";
                          const sym    = (t.symbol ?? "BSV/USDT").split("/");
                          const base   = sym[0] ?? "BSV";
                          const quote  = sym[1] ?? "USDT";
                          const coinIn  = isBuy ? base  : quote;
                          const coinOut = isBuy ? quote : base;
                          const amtIn   = isBuy
                            ? Number(t.quantity ?? t.fillQty ?? 0)
                            : Number(t.total    ?? (Number(t.quantity) * Number(t.price)));
                          const amtOut  = isBuy
                            ? Number(t.total    ?? (Number(t.quantity) * Number(t.price)))
                            : Number(t.quantity ?? t.fillQty ?? 0);
                          const time    = new Date(t.timestamp ?? t.createdAt ?? Date.now());
                          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          const fee     = Number(t.fee ?? 0);
                          const color = ASSET_COLORS[base] ?? "#6B7280";
                        return (
                          <div
                            key={t.id ?? i}
                            className={`flex items-center gap-3 px-4 py-3.5 ${i < trades.length - 1 ? "border-b border-border" : ""}`}
                          >
                            {/* Coin avatar */}
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                              style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
                            >
                              {base[0]}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-foreground">{base}/{quote}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                                  {isBuy ? "BUY" : "SELL"}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                @ ${Number(t.price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} · {timeStr}
                                {fee > 0 && <span className="text-muted-foreground/50"> · fee {fee.toFixed(4)}</span>}
                              </p>
                            </div>

                            {/* In / Out amounts */}
                            <div className="text-right shrink-0 space-y-0.5">
                              <div className="flex items-center justify-end gap-1 text-green-400">
                                <ArrowDownLeft size={10} strokeWidth={2.5} />
                                <span className="text-xs font-bold font-mono">
                                  +{amtIn.toLocaleString(undefined, { maximumFractionDigits: amtIn < 0.01 ? 6 : 4 })} {coinIn}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-1 text-muted-foreground/70">
                                <ArrowUpRight size={10} strokeWidth={2.5} />
                                <span className="text-[11px] font-mono">
                                  -{amtOut.toLocaleString(undefined, { maximumFractionDigits: amtOut < 0.01 ? 6 : 4 })} {coinOut}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              </>
            )
          )}
        </div>

      </div>

      {/* Coin History Bottom Sheet */}
      {coinHistoryOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCoinHistoryOpen(null)}
          />
          {/* Sheet */}
          <div className="relative bg-background border-t border-border rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border"
                style={{
                  backgroundColor: (ASSET_COLORS[coinHistoryOpen] ?? "#6B7280") + "22",
                  borderColor:     (ASSET_COLORS[coinHistoryOpen] ?? "#6B7280") + "44",
                  color:            ASSET_COLORS[coinHistoryOpen] ?? "#6B7280",
                }}
              >
                {coinHistoryOpen[0]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{coinHistoryOpen}</p>
                <p className="text-[11px] text-muted-foreground">Trade history</p>
              </div>
              <button
                onClick={() => setCoinHistoryOpen(null)}
                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
              >
                ✕
              </button>
            </div>

            {/* Trade list */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1">
              {(() => {
                const coinTrades = historyData.filter(t => {
                  const base = (t.symbol ?? "BSV/USDT").split("/")[0];
                  return base === coinHistoryOpen;
                });
                if (historyLoading) return (
                  <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <RefreshCw size={16} className="animate-spin opacity-40" />
                    <span className="text-xs">Loading…</span>
                  </div>
                );
                if (coinTrades.length === 0) return (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <History size={24} className="opacity-20" />
                    <p className="text-sm">No {coinHistoryOpen} trades yet</p>
                    <p className="text-xs opacity-60 text-center">Buy or sell {coinHistoryOpen} to see your history here</p>
                  </div>
                );
                return coinTrades.map((t: any, i: number) => {
                  const isBuy   = (t.side ?? "buy") === "buy";
                  const sym     = (t.symbol ?? `${coinHistoryOpen}/USDT`).split("/");
                  const base    = sym[0] ?? coinHistoryOpen;
                  const quote   = sym[1] ?? "USDT";
                  const coinIn  = isBuy ? base  : quote;
                  const coinOut = isBuy ? quote : base;
                  const amtIn   = isBuy
                    ? Number(t.quantity ?? t.fillQty ?? 0)
                    : Number(t.total ?? (Number(t.quantity) * Number(t.price)));
                  const amtOut  = isBuy
                    ? Number(t.total ?? (Number(t.quantity) * Number(t.price)))
                    : Number(t.quantity ?? t.fillQty ?? 0);
                  const time    = new Date(t.timestamp ?? t.createdAt ?? Date.now());
                  const dateStr = time.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div
                      key={t.id ?? i}
                      className="flex items-center gap-3 py-3 border-b border-border last:border-0"
                    >
                      {/* Direction icon */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isBuy ? "bg-green-500/15" : "bg-red-500/15"}`}>
                        {isBuy
                          ? <ArrowDownLeft size={14} className="text-green-400" strokeWidth={2.5} />
                          : <ArrowUpRight  size={14} className="text-red-400"   strokeWidth={2.5} />
                        }
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            @ ${Number(t.price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{dateStr} · {timeStr}</p>
                      </div>
                      {/* Amounts */}
                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="flex items-center justify-end gap-1 text-green-400">
                          <span className="text-xs font-bold font-mono">
                            +{amtIn.toLocaleString(undefined, { maximumFractionDigits: amtIn < 0.01 ? 6 : 4 })} {coinIn}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1 text-muted-foreground/60">
                          <span className="text-[11px] font-mono">
                            -{amtOut.toLocaleString(undefined, { maximumFractionDigits: amtOut < 0.01 ? 6 : 4 })} {coinOut}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
