import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Zap, Users, Globe, Star, Award, TrendingUp, Activity,
  CheckCircle2, Circle, Copy, ExternalLink, Wallet, RefreshCw,
  BarChart3, DollarSign, Lock, Unlock, ChevronRight, AlertCircle,
  BadgeCheck, Crown, Sword, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useSEO } from "@/hooks/useSEO";
import { RelayerEvents }   from "@/components/keeper/RelayerEvents";
import { ReputationCard }  from "@/components/keeper/ReputationCard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Role definitions (mirrors the architecture doc) ───────────────────────────
const ROLE_META: Record<string, { icon: React.ElementType; label: string; color: string; desc: string }> = {
  Trader: {
    icon: Sword,
    label: "Trader",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    desc: "Standard trading, order placement across all markets",
  },
  LiquidityKeeper: {
    icon: Layers,
    label: "Liquidity Keeper",
    color: "text-green-400 bg-green-500/10 border-green-500/30",
    desc: "Provides liquidity to AMM pools and earns fee revenue",
  },
  Relayer: {
    icon: Globe,
    label: "Relayer",
    color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
    desc: "Cross-chain bridge relaying via HTLC — earns bridge fees",
  },
  OracleKeeper: {
    icon: Activity,
    label: "Oracle Keeper",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    desc: "Price oracle contribution — Phase 4 reserved",
  },
};

// ─── Tier definitions ──────────────────────────────────────────────────────────
const TIER_META = [
  { tier: 0, name: "Standard", icon: Circle,      color: "text-muted-foreground", bg: "bg-muted/30",       feeBps: 30, discount: 0    },
  { tier: 1, name: "Guardian", icon: Shield,      color: "text-blue-400",          bg: "bg-blue-500/10",    feeBps: 25, discount: 17   },
  { tier: 2, name: "Elder",    icon: Star,         color: "text-violet-400",        bg: "bg-violet-500/10",  feeBps: 20, discount: 33   },
  { tier: 3, name: "Archon",   icon: Crown,        color: "text-amber-400",         bg: "bg-amber-500/10",   feeBps: 15, discount: 50   },
];

// ─── Types ─────────────────────────────────────────────────────────────────────
interface KeeperData {
  walletAddress: string;
  isKeeper: boolean;
  active: boolean;
  roles: string[];
  displayName?: string;
  avatarUrl?: string;
  uri?: string;
  tier: 0 | 1 | 2 | 3;
  tierName: string;
  feeBps: number;
  discountPct: number;
  lpPositionCount: number;
  totalEarningsUsdt: string;
  registeredAt?: string;
}

interface KeeperInDirectory {
  walletAddress: string;
  displayName?: string;
  roles: string[];
  tier: 0 | 1 | 2 | 3;
  tierName: string;
  registeredAt?: string;
}

export function KeeperProfile() {
  useSEO({ title: "Keeper Registry — Orah" });

  const { address: walletAddress } = useWalletStore();
  const [registerName, setRegisterName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["Trader"]);
  const [activeTab, setActiveTab] = useState<"profile" | "registry" | "economics" | "relayer" | "reputation">("profile");
  const [copiedAddr, setCopiedAddr] = useState(false);
  const qc = useQueryClient();

  // ── Fetch my Keeper profile ─────────────────────────────────────────────────
  const profileQ = useQuery<KeeperData>({
    queryKey: ["keeper-profile", walletAddress],
    enabled: !!walletAddress,
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/keeper/${walletAddress}`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // ── Fetch public Keeper directory ───────────────────────────────────────────
  const directoryQ = useQuery<{ keepers: KeeperInDirectory[]; total: number }>({
    queryKey: ["keeper-directory"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/keepers?limit=50`);
      if (!r.ok) throw new Error("Failed to fetch directory");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  // ── Register / update mutation ──────────────────────────────────────────────
  const registerMut = useMutation({
    mutationFn: async () => {
      if (!walletAddress) throw new Error("No wallet connected");
      const r = await fetch(`${BASE}/api/keeper/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          roles:       selectedRoles,
          displayName: registerName.trim() || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Registration failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keeper-profile", walletAddress] });
      qc.invalidateQueries({ queryKey: ["keeper-directory"] });
    },
  });

  // ── Deactivate mutation ─────────────────────────────────────────────────────
  const deactivateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/keeper/${walletAddress}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Deactivation failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keeper-profile", walletAddress] });
      qc.invalidateQueries({ queryKey: ["keeper-directory"] });
    },
  });

  const keeper       = profileQ.data;
  const tier         = TIER_META[keeper?.tier ?? 0];
  const TierIcon     = tier.icon;
  const isRegistered = keeper?.isKeeper && keeper?.active;

  function copyAddr() {
    if (walletAddress) { navigator.clipboard.writeText(walletAddress); setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000); }
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? (prev.length > 1 ? prev.filter(r => r !== role) : prev) : [...prev, role]
    );
  }

  // Pre-fill from existing profile
  useEffect(() => {
    if (keeper?.isKeeper) {
      setRegisterName(keeper.displayName ?? "");
      setSelectedRoles((keeper.roles ?? ["Trader"]) as string[]);
    }
  }, [keeper?.isKeeper]);

  const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Keeper Registry
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Identity is primitive. Keepers are the core actors of Orah.
          </p>
        </div>
        {keeper && (
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium", tier.bg, tier.color)}>
            <TierIcon className="w-4 h-4" />
            {tier.name} Keeper
          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border flex-wrap">
        {(["profile", "registry", "economics"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "economics" ? "Economics" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        {/* Relayer tab — visible to all, contextually useful for Relayer role keepers */}
        <button
          onClick={() => setActiveTab("relayer")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "relayer"
              ? "border-purple-400 text-purple-400"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="w-3.5 h-3.5" />
          Relayer
        </button>
        {/* Reputation tab */}
        <button
          onClick={() => setActiveTab("reputation")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "reputation"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <BadgeCheck className="w-3.5 h-3.5" />
          Reputation
        </button>
      </div>

      {/* ── Profile Tab ────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: identity card */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
              {/* Avatar + address */}
              <div className="flex flex-col items-center text-center gap-3">
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center text-2xl border-2", tier.bg, `border-${tier.color.split("-")[1]}-500/40`)}>
                  {isRegistered
                    ? keeper?.displayName?.[0]?.toUpperCase() ?? "K"
                    : <Wallet className="w-7 h-7 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-semibold">
                    {keeper?.displayName || (walletAddress ? shortAddr(walletAddress) : "Not connected")}
                  </p>
                  {walletAddress && (
                    <button onClick={copyAddr} className="text-xs text-muted-foreground flex items-center gap-1 mx-auto hover:text-foreground transition-colors">
                      {shortAddr(walletAddress)}
                      {copiedAddr ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Tier badge */}
              <div className={cn("flex items-center gap-2 rounded-lg p-3 border", tier.bg, `border-current/20`)}>
                <TierIcon className={cn("w-5 h-5", tier.color)} />
                <div className="flex-1">
                  <p className={cn("text-sm font-semibold", tier.color)}>{tier.name} Tier</p>
                  <p className="text-xs text-muted-foreground">{tier.feeBps / 100}% fee · {tier.discount}% discount</p>
                </div>
              </div>

              {/* Stats */}
              {keeper && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-muted/20 p-3">
                    <p className="text-lg font-bold">{keeper.lpPositionCount}</p>
                    <p className="text-xs text-muted-foreground">LP Positions</p>
                  </div>
                  <div className="rounded-lg bg-muted/20 p-3">
                    <p className="text-lg font-bold">${parseFloat(keeper.totalEarningsUsdt).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Earnings</p>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-lg p-2",
                isRegistered ? "text-green-400 bg-green-500/10" : "text-muted-foreground bg-muted/20",
              )}>
                {isRegistered
                  ? <><CheckCircle2 className="w-4 h-4" /> Registered Keeper</>
                  : <><Circle className="w-4 h-4" /> Not registered</>}
              </div>
            </div>
          </div>

          {/* Right: registration form */}
          <div className="lg:col-span-2 space-y-4">
            {!walletAddress ? (
              <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
                <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Connect your wallet</p>
                <p className="text-sm text-muted-foreground mt-1">Connect to register as a Keeper and unlock fee discounts and role-based access.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card/50 p-5 space-y-5">
                <h2 className="font-semibold text-base">
                  {isRegistered ? "Update your Keeper Profile" : "Register as a Keeper"}
                </h2>

                {/* Display name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Display Name (optional)</label>
                  <input
                    value={registerName}
                    onChange={e => setRegisterName(e.target.value)}
                    placeholder="e.g. SatoshiRelayer"
                    maxLength={40}
                    className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Role selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Select Roles</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(ROLE_META).map(([role, meta]) => {
                      const Icon = meta.icon;
                      const selected = selectedRoles.includes(role);
                      return (
                        <button
                          key={role}
                          onClick={() => toggleRole(role)}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                            selected
                              ? cn("border-primary/50", meta.color)
                              : "border-border bg-card/30 hover:border-border/80",
                          )}
                        >
                          <div className={cn("mt-0.5 rounded-md p-1.5 border", selected ? meta.color : "text-muted-foreground border-border")}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{meta.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{meta.desc}</p>
                          </div>
                          {selected && <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Role benefits notice */}
                {selectedRoles.includes("LiquidityKeeper") && (
                  <div className="flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <BadgeCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    LiquidityKeeper registration grants +1 Keeper Tier — you'll receive a fee discount even before reaching the volume threshold.
                  </div>
                )}
                {selectedRoles.includes("Relayer") && (
                  <div className="flex items-start gap-2 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                    Relayer role enables you to earn bridge fees from HTLC cross-chain transactions you relay.
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => registerMut.mutate()}
                    disabled={registerMut.isPending || selectedRoles.length === 0}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {registerMut.isPending
                      ? "Registering…"
                      : isRegistered ? "Update Profile" : "Register as Keeper"}
                  </button>
                  {isRegistered && (
                    <button
                      onClick={() => { if (confirm("Deactivate your Keeper profile?")) deactivateMut.mutate(); }}
                      disabled={deactivateMut.isPending}
                      className="rounded-lg border border-red-500/30 text-red-400 px-4 py-2.5 text-sm font-medium hover:bg-red-500/10 transition-colors"
                    >
                      {deactivateMut.isPending ? "Deactivating…" : "Deactivate"}
                    </button>
                  )}
                </div>

                {registerMut.isSuccess && (
                  <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <CheckCircle2 className="w-4 h-4" />
                    {isRegistered ? "Profile updated successfully!" : "Registered as Keeper!"}
                    {(registerMut.data?.discountPct ?? 0) > 0 && (
                      <span className="ml-1">Your fee is now {registerMut.data?.feeBps / 100}% ({registerMut.data?.discountPct}% discount).</span>
                    )}
                  </div>
                )}
                {registerMut.isError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4" />
                    {registerMut.error?.message ?? "Registration failed"}
                  </div>
                )}
              </div>
            )}

            {/* Tier benefits overview */}
            <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tier Benefits</h3>
              <div className="space-y-2">
                {TIER_META.map(t => {
                  const Icon = t.icon;
                  const isCurrent = keeper?.tier === t.tier;
                  return (
                    <div key={t.tier} className={cn(
                      "flex items-center gap-3 rounded-lg p-2.5 border transition-all",
                      isCurrent ? cn("border-primary/40", t.bg) : "border-transparent bg-muted/10",
                    )}>
                      <Icon className={cn("w-4 h-4 shrink-0", isCurrent ? t.color : "text-muted-foreground")} />
                      <div className="flex-1">
                        <span className={cn("text-sm font-medium", isCurrent ? t.color : "text-muted-foreground")}>
                          {t.name}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">{t.feeBps / 100}% fee</span>
                      </div>
                      <span className={cn("text-xs font-medium", t.discount > 0 ? "text-green-400" : "text-muted-foreground")}>
                        {t.discount > 0 ? `-${t.discount}%` : "—"}
                      </span>
                      {isCurrent && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Tiers are earned via trading volume or by registering as a LiquidityKeeper.
                Tier 3 Archon requires 500+ BSV equivalent in volume.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Registry Tab ───────────────────────────────────────────────────── */}
      {activeTab === "registry" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {directoryQ.data?.total ?? 0} registered Keepers
            </p>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["keeper-directory"] })}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {directoryQ.isLoading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/20 animate-pulse" />
              ))}
            </div>
          )}

          {directoryQ.data?.keepers.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No Keepers registered yet.</p>
              <p className="text-xs mt-1">Be the first — register on the Profile tab.</p>
            </div>
          )}

          <div className="space-y-2">
            {directoryQ.data?.keepers.map(k => {
              const t = TIER_META[k.tier ?? 0];
              const TIcon = t.icon;
              return (
                <div key={k.walletAddress} className="flex items-center gap-3 rounded-xl border border-border bg-card/30 px-4 py-3 hover:bg-card/50 transition-colors">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border", t.bg, `border-current/20`, t.color)}>
                    {k.displayName?.[0]?.toUpperCase() ?? k.walletAddress.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {k.displayName || shortAddr(k.walletAddress)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(k.roles as string[]).slice(0, 3).map(role => {
                        const rm = ROLE_META[role];
                        if (!rm) return null;
                        return (
                          <span key={role} className={cn("text-xs px-1.5 py-0.5 rounded-md border font-medium", rm.color)}>
                            {rm.label.split(" ")[0]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className={cn("flex items-center gap-1 text-xs font-medium", t.color)}>
                    <TIcon className="w-3.5 h-3.5" />
                    {t.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Relayer Tab ────────────────────────────────────────────────────── */}
      {activeTab === "relayer" && (
        <div className="space-y-4">
          {/* Context banner for non-Relayer keepers */}
          {profileQ.data && !profileQ.data.roles?.includes("Relayer") && (
            <div className="flex items-start gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-sm text-purple-300">
              <Globe className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
              <div>
                <p className="font-semibold text-purple-200">Relayer role not registered</p>
                <p className="text-xs mt-1 text-purple-400">
                  Register as a Relayer Keeper on the Profile tab to receive push notifications
                  when HTLC settlements change status and start earning bridge fees.
                </p>
              </div>
            </div>
          )}

          {/* HTLC watcher — works for everyone, auto-registers Relayer keepers */}
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <RelayerEvents keeperAddress={walletAddress ?? undefined} />
          </div>

          {/* Relayer protocol reference */}
          <div className="rounded-xl border border-border bg-card/30 p-5 space-y-4">
            <h3 className="text-sm font-semibold">Keeper Action Reference</h3>
            <div className="space-y-3">
              {[
                {
                  status: "LOCKED",
                  color:  "bg-purple-500/10 border-purple-500/30 text-purple-300",
                  badge:  "text-purple-400",
                  action: "Monitor counterparty chain for deposit confirmation. Prepare claim transaction with preimage once confirmed.",
                },
                {
                  status: "CLAIMED",
                  color:  "bg-green-500/10 border-green-500/30 text-green-300",
                  badge:  "text-green-400",
                  action: "Swap complete. Bridge fee credited. No further action required.",
                },
                {
                  status: "EXPIRED",
                  color:  "bg-amber-500/10 border-amber-500/30 text-amber-300",
                  badge:  "text-amber-400",
                  action: "Locktime reached without claim. Alert user — they can now broadcast the CLTV refund transaction.",
                },
                {
                  status: "REFUNDED",
                  color:  "bg-red-500/10 border-red-500/30 text-red-300",
                  badge:  "text-red-400",
                  action: "User swept via CLTV refund path. Trade is unwound on-chain. Initiate re-match or manual resolution as needed.",
                },
              ].map(({ status, color, badge, action }) => (
                <div key={status} className={`flex items-start gap-3 rounded-lg border p-3 ${color}`}>
                  <span className={`text-xs font-bold font-mono mt-0.5 ${badge}`}>{status}</span>
                  <p className="text-xs flex-1">{action}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Economics Tab ──────────────────────────────────────────────────── */}
      {activeTab === "economics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: DollarSign,
                label: "Swap Fees",
                value: "0.15%–0.30%",
                sub: "Per trade, based on Keeper tier",
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                icon: Globe,
                label: "Bridge Fees",
                value: "0.1%",
                sub: "Per cross-chain HTLC transfer",
                color: "text-purple-400",
                bg: "bg-purple-500/10",
              },
              {
                icon: BarChart3,
                label: "LP Fee Share",
                value: "83%",
                sub: "Of swap fees to Liquidity Keepers",
                color: "text-green-400",
                bg: "bg-green-500/10",
              },
            ].map(c => (
              <div key={c.label} className={cn("rounded-xl border border-border p-5 space-y-2", c.bg)}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", c.bg)}>
                  <c.icon className={cn("w-4 h-4", c.color)} />
                </div>
                <p className={cn("text-xl font-bold", c.color)}>{c.value}</p>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Fee distribution model */}
          <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
            <h3 className="font-semibold">Fee Distribution Model</h3>
            <div className="space-y-3">
              {[
                { label: "Liquidity Keepers", pct: 83, desc: "Proportional to LP share in the pool", color: "bg-green-500" },
                { label: "Protocol Treasury", pct: 17, desc: "Long-term sustainability and development", color: "bg-blue-500" },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Roadmap phases */}
          <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
            <h3 className="font-semibold">Protocol Roadmap</h3>
            <div className="space-y-3">
              {[
                { phase: "Phase 1", title: "Genesis Liquidity Engine", done: true, desc: "Virtual AMM for core pairs, Keeper Registry, basic swap UI" },
                { phase: "Phase 2", title: "Bridge & wBSV", done: false, desc: "HTLC bridge, wBSV wrapped assets, Relayer Keeper roles" },
                { phase: "Phase 3", title: "P2P & Intents", done: false, desc: "P2P settlement, off-chain intent relays, Keeper reputation" },
                { phase: "Phase 4", title: "Perps & Oracle Keepers", done: false, desc: "Perpetuals on the VAMM, OracleKeeper roles, advanced Keeper rituals" },
              ].map(p => (
                <div key={p.phase} className={cn(
                  "flex items-start gap-3 rounded-lg p-3 border",
                  p.done ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/10",
                )}>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    p.done ? "bg-green-500 text-white" : "bg-muted text-muted-foreground",
                  )}>
                    {p.done ? "✓" : "○"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground mr-2">{p.phase} —</span>
                      {p.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Reputation Tab ─────────────────────────────────────────────────── */}
      {activeTab === "reputation" && (
        <div className="max-w-2xl space-y-4">
          {/* ── Covenant card ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-300">
              <BadgeCheck className="w-4 h-4 shrink-0" />
              How reputation works
            </h2>
            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                <span className="text-foreground font-medium">Reputation is earned, never declared.</span>{" "}
                Every point comes from a concrete action recorded against an on-chain HTLC —
                claiming a swap, assisting a refund, or being present to observe a transition.
                There are no admin grants, no manual overrides.
              </p>
              <p>
                <span className="text-foreground font-medium">Timing is part of the craft.</span>{" "}
                Acting within six blocks of a locktime expiry earns a larger timeliness bonus than
                acting with hours to spare. The protocol rewards Keepers who show up when it matters
                most — not just when it's convenient.
              </p>
              <p>
                <span className="text-foreground font-medium">Consistency compounds.</span>{" "}
                Sustained observation — staying online, watching the watcher — accumulates a
                consistency bonus over time. A Keeper who never misses an event is recognised even
                before they close their first swap.
              </p>
              <p>
                <span className="text-foreground font-medium">Tiers tell a story.</span>{" "}
                Dormant → Watcher → Dawn Relayer → Relayer → Locksmith → Grandmaster Relayer.
                Each step is a threshold you cross through behavior, not through application.
              </p>
            </div>
          </div>

          <ReputationCard keeperAddress={walletAddress ?? undefined} />
        </div>
      )}
    </div>
  );
}
