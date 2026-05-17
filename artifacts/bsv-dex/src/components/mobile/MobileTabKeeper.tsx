/**
 * MobileTabKeeper — keep-alive tab renderer for the mobile layout.
 *
 * Problem: wouter's <Switch> unmounts the active page on every route change,
 * causing all data hooks to restart and the UI to flash a loading state.
 *
 * Solution: render each tab page exactly once (on first visit) and keep it
 * permanently mounted. Inactive tabs are hidden via `display: none` so they
 * stay in the React tree — state, queries, and scroll memory are preserved.
 * New tab chunks are only fetched on first visit (lazy loading is unchanged).
 */
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Switch, Route } from "wouter";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";

/* ── Lazy page imports ───────────────────────────────────────────────────── */
const MobileMarkets         = lazy(() => import("@/pages/mobile/MobileMarkets").then(m => ({ default: m.MobileMarkets })));
const MobileTrade           = lazy(() => import("@/pages/mobile/MobileTrade").then(m => ({ default: m.MobileTrade })));
const MobileWalletPortfolio = lazy(() => import("@/pages/mobile/MobileWalletPortfolio").then(m => ({ default: m.MobileWalletPortfolio })));
const MobileSettings        = lazy(() => import("@/pages/mobile/MobileSettings").then(m => ({ default: m.MobileSettings })));
const MobileStaking         = lazy(() => import("@/pages/mobile/MobileStaking").then(m => ({ default: m.MobileStaking })));
const MobileNFT             = lazy(() => import("@/pages/mobile/MobileNFT").then(m => ({ default: m.MobileNFT })));
const MobileLiquidity       = lazy(() => import("@/pages/mobile/MobileLiquidity").then(m => ({ default: m.MobileLiquidity })));
const MobileGenesis         = lazy(() => import("@/pages/mobile/MobileGenesis"));
const MobileQRScanner       = lazy(() => import("@/pages/mobile/MobileQRScanner").then(m => ({ default: m.MobileQRScanner })));
const MobileHandCashBridge  = lazy(() => import("@/pages/mobile/MobileHandCashBridge").then(m => ({ default: m.MobileHandCashBridge })));
const MobileCoinWallet      = lazy(() => import("@/pages/mobile/MobileCoinWallet").then(m => ({ default: m.MobileCoinWallet })));
const UserApiKeys           = lazy(() => import("@/pages/UserApiKeys").then(m => ({ default: m.UserApiKeys })));
const SwapPage              = lazy(() => import("@/pages/Swap").then(m => ({ default: m.Swap })));
const DexHub                = lazy(() => import("@/pages/DexHub").then(m => ({ default: m.DexHub })));
const P2P                   = lazy(() => import("@/pages/P2P").then(m => ({ default: m.P2P })));
const BridgePage            = lazy(() => import("@/pages/Bridge").then(m => ({ default: m.BridgePage })));
const CopyTrading           = lazy(() => import("@/pages/CopyTrading").then(m => ({ default: m.CopyTrading })));
const RevenuePage           = lazy(() => import("@/pages/Revenue"));
const KeeperProfile         = lazy(() => import("@/pages/KeeperProfile").then(m => ({ default: m.KeeperProfile })));
const PredictionTrading     = lazy(() => import("@/pages/Prediction").then(m => ({ default: m.PredictionTrading })));
const SovereignOverviewPage = lazy(() => import("@/pages/SovereignOverview").then(m => ({ default: m.SovereignOverviewPage })));
const OraAIPage             = lazy(() => import("@/pages/OraAI").then(m => ({ default: m.OraAIPage })));
const DevAIPage             = lazy(() => import("@/pages/DevAI").then(m => ({ default: m.DevAIPage })));

/* ── Tab key type ────────────────────────────────────────────────────────── */
type TabKey =
  | "markets" | "swap" | "trade" | "futures" | "wallet"
  | "settings" | "staking" | "nft" | "liquidity" | "genesis"
  | "dex" | "p2p" | "bridge" | "copy" | "fees" | "keeper"
  | "prediction" | "sovereign" | "ora-ai" | "devai";

/* Routes that need live params and are rendered normally (not kept alive) */
const PASSTHROUGH_PREFIXES = [
  "/portfolio/",
  "/settings/api-keys",
  "/deposit-bsv",
  "/qr-scan",
];

function isPassthrough(location: string) {
  return PASSTHROUGH_PREFIXES.some(p => location.startsWith(p));
}

function getTabKey(location: string): TabKey | null {
  if (location === "/" || location.startsWith("/markets"))   return "markets";
  if (location.startsWith("/swap"))                          return "swap";
  if (location.startsWith("/trade"))                         return "trade";
  if (location.startsWith("/futures"))                       return "futures";
  if (location === "/wallet" || location === "/portfolio")   return "wallet";
  if (location.startsWith("/settings"))                      return "settings";
  if (location.startsWith("/staking"))                       return "staking";
  if (location.startsWith("/nft"))                           return "nft";
  if (location.startsWith("/liquidity"))                     return "liquidity";
  if (location.startsWith("/genesis"))                       return "genesis";
  if (location.startsWith("/dex"))                           return "dex";
  if (location.startsWith("/p2p"))                           return "p2p";
  if (location.startsWith("/bridge"))                        return "bridge";
  if (location.startsWith("/copy"))                          return "copy";
  if (location.startsWith("/fees"))                          return "fees";
  if (location.startsWith("/keeper"))                        return "keeper";
  if (location.startsWith("/prediction"))                    return "prediction";
  if (location.startsWith("/sovereign"))                     return "sovereign";
  if (location.startsWith("/ora-ai"))                        return "ora-ai";
  if (location.startsWith("/admin/devai"))                   return "devai";
  return null;
}

function Skeleton() {
  return <div className="flex-1 flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, token } = useAdminAuthStore();
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (!isAuthenticated || !token) {
      const redirect = location && location !== "/admin/login" ? `?redirect=${encodeURIComponent(location)}` : "";
      navigate(`/admin/login${redirect}`);
    }
  }, [isAuthenticated, token]);
  if (!isAuthenticated || !token) return null;
  return <>{children}</>;
}

function Tab({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div style={active ? { height: "100%" } : { display: "none" }}>{children}</div>;
}

export function MobileTabKeeper() {
  const [location] = useLocation();

  /* Track visited tabs so we only mount them on first visit */
  const [visited, setVisited] = useState<Set<TabKey>>(() => {
    const k = getTabKey(location);
    return new Set(k ? [k] : ["markets"]);
  });

  /* Track the most-recently active symbol for trade/futures routes.
     We update the ref only while the route is active so the component
     receives the right symbol on first mount and keeps it across switches. */
  const tradeSymRef  = useRef("BSV-USDT");
  const futuresSymRef = useRef("BSV-USDT-PERP");

  const activeKey = isPassthrough(location) ? null : getTabKey(location);

  useEffect(() => {
    const tradeMatch = location.match(/^\/trade\/([^?/]+)/);
    if (tradeMatch) tradeSymRef.current = tradeMatch[1];

    const futMatch = location.match(/^\/futures\/([^?/]+)/);
    if (futMatch) futuresSymRef.current = futMatch[1];

    if (activeKey) {
      setVisited(prev => {
        if (prev.has(activeKey)) return prev;
        const next = new Set(prev);
        next.add(activeKey);
        return next;
      });
    }
  }, [location, activeKey]);

  /* Separate symbol state so MobileTrade re-renders when symbol changes
     while the route is still active (e.g. user navigates /trade/A → /trade/B). */
  const [tradeSymbol,   setTradeSymbol]   = useState("BSV-USDT");
  const [futuresSymbol, setFuturesSymbol] = useState("BSV-USDT-PERP");

  useEffect(() => {
    const tradeMatch = location.match(/^\/trade\/([^?/]+)/);
    if (tradeMatch) setTradeSymbol(tradeMatch[1]);

    const futMatch = location.match(/^\/futures\/([^?/]+)/);
    if (futMatch) setFuturesSymbol(futMatch[1]);
  }, [location]);

  /* ── Passthrough routes (rare / need live params) ── */
  if (isPassthrough(location)) {
    return (
      <Suspense fallback={<Skeleton />}>
        <Switch>
          <Route path="/portfolio/:coin">
            {(p) => <MobileCoinWallet coin={p.coin ?? "BTC"} />}
          </Route>
          <Route path="/settings/api-keys" component={UserApiKeys} />
          <Route path="/deposit-bsv"       component={MobileHandCashBridge} />
          <Route path="/qr-scan"           component={MobileQRScanner} />
        </Switch>
      </Suspense>
    );
  }

  /* ── Keep-alive tabs ── */
  const vis = (key: TabKey) => visited.has(key);
  const act = (key: TabKey) => activeKey === key;

  return (
    <>
      {vis("markets")    && <Tab active={act("markets")}>    <Suspense fallback={<Skeleton />}><MobileMarkets /></Suspense></Tab>}
      {vis("swap")       && <Tab active={act("swap")}>       <Suspense fallback={<Skeleton />}><SwapPage /></Suspense></Tab>}
      {vis("trade")      && <Tab active={act("trade")}>      <Suspense fallback={<Skeleton />}><MobileTrade symbol={tradeSymbol} /></Suspense></Tab>}
      {vis("futures")    && <Tab active={act("futures")}>    <Suspense fallback={<Skeleton />}><MobileTrade symbol={futuresSymbol} /></Suspense></Tab>}
      {vis("wallet")     && <Tab active={act("wallet")}>     <Suspense fallback={<Skeleton />}><MobileWalletPortfolio /></Suspense></Tab>}
      {vis("settings")   && <Tab active={act("settings")}>   <Suspense fallback={<Skeleton />}><MobileSettings /></Suspense></Tab>}
      {vis("staking")    && <Tab active={act("staking")}>    <Suspense fallback={<Skeleton />}><MobileStaking /></Suspense></Tab>}
      {vis("nft")        && <Tab active={act("nft")}>        <Suspense fallback={<Skeleton />}><MobileNFT /></Suspense></Tab>}
      {vis("liquidity")  && <Tab active={act("liquidity")}>  <Suspense fallback={<Skeleton />}><MobileLiquidity /></Suspense></Tab>}
      {vis("genesis")    && <Tab active={act("genesis")}>    <Suspense fallback={<Skeleton />}><MobileGenesis /></Suspense></Tab>}
      {vis("dex")        && <Tab active={act("dex")}>        <Suspense fallback={<Skeleton />}><DexHub /></Suspense></Tab>}
      {vis("p2p")        && <Tab active={act("p2p")}>        <Suspense fallback={<Skeleton />}><P2P /></Suspense></Tab>}
      {vis("bridge")     && <Tab active={act("bridge")}>     <Suspense fallback={<Skeleton />}><BridgePage /></Suspense></Tab>}
      {vis("copy")       && <Tab active={act("copy")}>       <Suspense fallback={<Skeleton />}><CopyTrading /></Suspense></Tab>}
      {vis("fees")       && <Tab active={act("fees")}>       <Suspense fallback={<Skeleton />}><RevenuePage /></Suspense></Tab>}
      {vis("keeper")     && <Tab active={act("keeper")}>     <Suspense fallback={<Skeleton />}><KeeperProfile /></Suspense></Tab>}
      {vis("prediction") && <Tab active={act("prediction")}> <Suspense fallback={<Skeleton />}><PredictionTrading /></Suspense></Tab>}
      {vis("sovereign")  && <Tab active={act("sovereign")}>  <Suspense fallback={<Skeleton />}><SovereignOverviewPage /></Suspense></Tab>}
      {vis("ora-ai")     && <Tab active={act("ora-ai")}>     <Suspense fallback={<Skeleton />}><OraAIPage /></Suspense></Tab>}
      {vis("devai")      && <Tab active={act("devai")}>      <AdminGuard><Suspense fallback={<Skeleton />}><DevAIPage /></Suspense></AdminGuard></Tab>}

      {/* Fallback: unrecognised route — show markets */}
      {activeKey === null && !isPassthrough(location) && (
        <Suspense fallback={<Skeleton />}><MobileMarkets /></Suspense>
      )}
    </>
  );
}
