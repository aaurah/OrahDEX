import { useEffect, useRef, ReactNode, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/Layout";
import { BiometricLockScreen } from "@/components/BiometricLockScreen";
import { useBiometricStore } from "@/store/useBiometricStore";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { applyStoredTheme } from "@/store/useThemeStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { subscribeReownAccount, isReownReady, fetchEvmBalance, parseChainFromCaip } from "@/lib/reown";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { useTxTracker } from "@/hooks/useTxTracker";
import { MobileLayout } from "@/components/mobile/MobileLayout";

/* ─── Lazy page imports — each becomes its own JS chunk ─── */
const Markets      = lazy(() => import("@/pages/Markets").then(m => ({ default: m.Markets })));
const SpotTrading  = lazy(() => import("@/pages/Spot").then(m => ({ default: m.SpotTrading })));
const FuturesTrading = lazy(() => import("@/pages/Futures").then(m => ({ default: m.FuturesTrading })));
const Portfolio    = lazy(() => import("@/pages/Portfolio").then(m => ({ default: m.Portfolio })));
const DexHub       = lazy(() => import("@/pages/DexHub").then(m => ({ default: m.DexHub })));
const P2P          = lazy(() => import("@/pages/P2P").then(m => ({ default: m.P2P })));
const Liquidity    = lazy(() => import("@/pages/Liquidity").then(m => ({ default: m.Liquidity })));
const BridgePage   = lazy(() => import("@/pages/Bridge").then(m => ({ default: m.BridgePage })));
const NotFound     = lazy(() => import("@/pages/not-found"));

/* Legal / Info — standalone full-screen pages (no Layout wrapper) */
const TermsOfService  = lazy(() => import("@/pages/TermsOfService").then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy   = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const WhitePaper      = lazy(() => import("@/pages/WhitePaper").then(m => ({ default: m.WhitePaper })));

/* Mobile */
const MobileMarkets   = lazy(() => import("@/pages/mobile/MobileMarkets").then(m => ({ default: m.MobileMarkets })));
const MobilePortfolio = lazy(() => import("@/pages/mobile/MobilePortfolio").then(m => ({ default: m.MobilePortfolio })));
const MobileSettings  = lazy(() => import("@/pages/mobile/MobileSettings").then(m => ({ default: m.MobileSettings })));
const MobileTrade     = lazy(() => import("@/pages/mobile/MobileTrade").then(m => ({ default: m.MobileTrade })));
const MobileLiquidity = lazy(() => import("@/pages/mobile/MobileLiquidity").then(m => ({ default: m.MobileLiquidity })));

/* Admin — single chunk group for the whole admin section */
const AdminLogin          = lazy(() => import("@/pages/admin/Login").then(m => ({ default: m.AdminLogin })));
const AdminDashboard      = lazy(() => import("@/pages/admin/Dashboard").then(m => ({ default: m.AdminDashboard })));
const AdminSetupGuide     = lazy(() => import("@/pages/admin/SetupGuide").then(m => ({ default: m.AdminSetupGuide })));
const AdminUsers          = lazy(() => import("@/pages/admin/Users").then(m => ({ default: m.AdminUsers })));
const AdminAdmins         = lazy(() => import("@/pages/admin/Admins").then(m => ({ default: m.AdminAdmins })));
const AdminTradePairs     = lazy(() => import("@/pages/admin/TradePairs").then(m => ({ default: m.AdminTradePairs })));
const AdminApiSettings    = lazy(() => import("@/pages/admin/ApiSettings").then(m => ({ default: m.AdminApiSettings })));
const AdminContractBuilder = lazy(() => import("@/pages/admin/ContractBuilder").then(m => ({ default: m.AdminContractBuilder })));
const AdminThemes         = lazy(() => import("@/pages/admin/Themes").then(m => ({ default: m.AdminThemes })));
const AdminTransactions   = lazy(() => import("@/pages/admin/Transactions").then(m => ({ default: m.AdminTransactions })));
const AdminFeeWallet      = lazy(() => import("@/pages/admin/FeeWallet").then(m => ({ default: m.AdminFeeWallet })));
const AdminIntegrations   = lazy(() => import("@/pages/admin/Integrations").then(m => ({ default: m.AdminIntegrations })));
const AdminBotProfit      = lazy(() => import("@/pages/admin/BotProfit").then(m => ({ default: m.AdminBotProfit })));
const AdminSiteSettings   = lazy(() => import("@/pages/admin/SiteSettings").then(m => ({ default: m.AdminSiteSettings })));
const AdminHomeBuilder    = lazy(() => import("@/pages/admin/HomeBuilder").then(m => ({ default: m.AdminHomeBuilder })));
const AdminFeatureFlags   = lazy(() => import("@/pages/admin/FeatureFlags").then(m => ({ default: m.AdminFeatureFlags })));
const AdminSecuritySettings = lazy(() => import("@/pages/admin/SecuritySettings").then(m => ({ default: m.AdminSecuritySettings })));
const AdminFeeConfig      = lazy(() => import("@/pages/admin/FeeConfig").then(m => ({ default: m.AdminFeeConfig })));
const AdminAnnouncements  = lazy(() => import("@/pages/admin/Announcements").then(m => ({ default: m.AdminAnnouncements })));
const AdminEmailInbox     = lazy(() => import("@/pages/admin/EmailInbox").then(m => ({ default: m.AdminEmailInbox })));

/* ─── QueryClient — aggressive caching so API is hit far less often ─── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      staleTime: 30_000,       // 30 s — data considered fresh; no re-fetch during this window
      gcTime: 5 * 60_000,      // 5 min — keep unused data in memory cache
    },
  },
});

/* ─── Lightweight skeleton shown while a lazy chunk is downloading ─── */
function PageSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}

function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAdminAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) navigate("/admin/login");
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function RedirectTo({ href }: { href: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(href, { replace: true }); }, []);
  return null;
}

/* Tiny helper to keep route definitions DRY */
function AdminRoute({ children }: { children: ReactNode }) {
  return (
    <RequireAdminAuth>
      <AdminLayout>
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </AdminLayout>
    </RequireAdminAuth>
  );
}

function Router() {
  const isMobile = useIsMobile();

  useBsvBalance();
  useTxTracker();

  useEffect(() => {
    applyStoredTheme();

    const eth = (window as any).ethereum;

    const { network, address, disconnect, provider: storedProvider } = useWalletStore.getState();
    if (network === "evm" && storedProvider !== "reown") {
      if (!eth) {
        disconnect();
      } else {
        eth.request({ method: "eth_accounts" })
          .then(async (accounts: string[]) => {
            if (!accounts?.length) {
              disconnect();
            } else if (accounts[0] && !address) {
              const chainHex: string = await eth.request({ method: "eth_chainId" });
              useWalletStore.getState().connect({
                address: accounts[0], provider: "metamask", network: "evm",
                chainId: parseInt(chainHex, 16),
              });
            }
          })
          .catch(() => disconnect());
      }
    }

    const onAccountsChanged = async (accounts: string[]) => {
      const { provider: p } = useWalletStore.getState();
      if (p === "reown") return;
      if (!accounts.length) {
        useWalletStore.getState().disconnect();
      } else {
        const chainHex: string = await eth.request({ method: "eth_chainId" }).catch(() => "0x1");
        const chainId = parseInt(chainHex, 16);
        useWalletStore.getState().connect({ address: accounts[0], provider: p ?? "metamask", network: "evm", chainId });
        const bal = await fetchEvmBalance(accounts[0], chainId);
        if (bal !== null) useWalletStore.getState().setBalance(bal);
      }
    };

    const onChainChanged = async (chainHex: string) => {
      const { address: addr, provider: p } = useWalletStore.getState();
      if (p === "reown" || !addr) return;
      const chainId = parseInt(chainHex, 16);
      useWalletStore.getState().setBalance(null);
      useWalletStore.getState().connect({ address: addr, provider: p ?? "metamask", network: "evm", chainId });
      const bal = await fetchEvmBalance(addr, chainId);
      if (bal !== null) useWalletStore.getState().setBalance(bal);
    };

    if (eth) {
      eth.on?.("accountsChanged", onAccountsChanged);
      eth.on?.("chainChanged", onChainChanged);
    }

    let reownUnsub: (() => void) | null = null;
    let pollTries = 0;
    const pollReown = setInterval(() => {
      if (isReownReady()) {
        clearInterval(pollReown);
        reownUnsub = subscribeReownAccount(async (state) => {
          const { provider: current } = useWalletStore.getState();
          if (state.isConnected && state.address) {
            const chainId = parseChainFromCaip(state.caipAddress) ?? 1;
            useWalletStore.getState().connect({
              address: state.address,
              provider: "reown",
              network: "evm",
              chainId,
            });
            const bal = await fetchEvmBalance(state.address, chainId);
            if (bal !== null) {
              useWalletStore.getState().setBalance(bal);
            }
          } else if (current === "reown") {
            useWalletStore.getState().disconnect();
          }
        });
      }
      if (++pollTries > 50) clearInterval(pollReown);
    }, 200);

    return () => {
      clearInterval(pollReown);
      reownUnsub?.();
      if (eth) {
        eth.removeListener?.("accountsChanged", onAccountsChanged);
        eth.removeListener?.("chainChanged", onChainChanged);
      }
    };
  }, []);

  return (
    <Switch>
      {/* ── Admin login ── */}
      <Route path="/admin/login">
        <Suspense fallback={<PageSkeleton />}><AdminLogin /></Suspense>
      </Route>

      {/* ── Admin panel routes ── */}
      <Route path="/admin">         <AdminRoute><AdminDashboard /></AdminRoute></Route>
      <Route path="/admin/setup">   <AdminRoute><AdminSetupGuide /></AdminRoute></Route>
      <Route path="/admin/users">   <AdminRoute><AdminUsers /></AdminRoute></Route>
      <Route path="/admin/admins">  <AdminRoute><AdminAdmins /></AdminRoute></Route>
      <Route path="/admin/pairs">   <AdminRoute><AdminTradePairs /></AdminRoute></Route>
      <Route path="/admin/api">     <AdminRoute><AdminApiSettings /></AdminRoute></Route>
      <Route path="/admin/contracts"><AdminRoute><AdminContractBuilder /></AdminRoute></Route>
      <Route path="/admin/themes">  <AdminRoute><AdminThemes /></AdminRoute></Route>
      <Route path="/admin/transactions"><AdminRoute><AdminTransactions /></AdminRoute></Route>
      <Route path="/admin/fee-wallet"><AdminRoute><AdminFeeWallet /></AdminRoute></Route>
      <Route path="/admin/integrations"><AdminRoute><AdminIntegrations /></AdminRoute></Route>
      <Route path="/admin/bot-profit"><AdminRoute><AdminBotProfit /></AdminRoute></Route>
      <Route path="/admin/site">    <AdminRoute><AdminSiteSettings /></AdminRoute></Route>
      <Route path="/admin/home">    <AdminRoute><AdminHomeBuilder /></AdminRoute></Route>
      <Route path="/admin/features"><AdminRoute><AdminFeatureFlags /></AdminRoute></Route>
      <Route path="/admin/security"><AdminRoute><AdminSecuritySettings /></AdminRoute></Route>
      <Route path="/admin/fees">    <AdminRoute><AdminFeeConfig /></AdminRoute></Route>
      <Route path="/admin/announcements"><AdminRoute><AdminAnnouncements /></AdminRoute></Route>
      <Route path="/admin/mail">      <AdminRoute><AdminEmailInbox /></AdminRoute></Route>

      {/* ── Redirects ── */}
      <Route path="/spot"><RedirectTo href="/trade/BSV-USDT" /></Route>
      <Route path="/futures"><RedirectTo href="/futures/BSV-USDT-PERP" /></Route>

      {/* ── Standalone legal / info pages (no nav wrapper) ── */}
      <Route path="/terms">
        <Suspense fallback={<PageSkeleton />}><TermsOfService /></Suspense>
      </Route>
      <Route path="/privacy">
        <Suspense fallback={<PageSkeleton />}><PrivacyPolicy /></Suspense>
      </Route>
      <Route path="/whitepaper">
        <Suspense fallback={<PageSkeleton />}><WhitePaper /></Suspense>
      </Route>

      {/* ── Mobile layout ── */}
      {isMobile && (
        <Route>
          <MobileLayout>
            <Suspense fallback={<PageSkeleton />}>
              <Switch>
                <Route path="/"          component={MobileMarkets} />
                <Route path="/markets"   component={MobileMarkets} />
                <Route path="/trade/:symbol">
                  {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
                </Route>
                <Route path="/futures/:symbol">
                  {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
                </Route>
                <Route path="/dex"        component={DexHub} />
                <Route path="/liquidity"  component={MobileLiquidity} />
                <Route path="/p2p"        component={P2P} />
                <Route path="/bridge"     component={BridgePage} />
                <Route path="/portfolio"  component={MobilePortfolio} />
                <Route path="/settings"   component={MobileSettings} />
                <Route component={MobileMarkets} />
              </Switch>
            </Suspense>
          </MobileLayout>
        </Route>
      )}

      {/* ── Desktop layout ── */}
      {!isMobile && (
        <Route>
          <Layout>
            <Suspense fallback={<PageSkeleton />}>
              <Switch>
                <Route path="/"               component={Markets} />
                <Route path="/markets"        component={Markets} />
                <Route path="/trade/:symbol"  component={SpotTrading} />
                <Route path="/futures/:symbol" component={FuturesTrading} />
                <Route path="/dex"            component={DexHub} />
                <Route path="/liquidity"      component={Liquidity} />
                <Route path="/p2p"            component={P2P} />
                <Route path="/bridge"         component={BridgePage} />
                <Route path="/portfolio"      component={Portfolio} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Layout>
        </Route>
      )}
    </Switch>
  );
}

const AUTO_LOCK_MS = 30_000;

function AppContent() {
  const { isEnabled, isLocked, lock } = useBiometricStore();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isEnabled) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (document.visibilityState === "visible") {
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= AUTO_LOCK_MS) {
          lock();
        }
        hiddenAt.current = null;
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isEnabled, lock]);

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
      {isEnabled && isLocked && <BiometricLockScreen />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
