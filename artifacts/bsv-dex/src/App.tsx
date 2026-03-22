import { useEffect, useRef, ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/Layout";
import { BiometricLockScreen } from "@/components/BiometricLockScreen";
import { useBiometricStore } from "@/store/useBiometricStore";
import { AdminLayout } from "@/components/AdminLayout";
import { Markets } from "@/pages/Markets";
import { SpotTrading } from "@/pages/Spot";
import { FuturesTrading } from "@/pages/Futures";
import { Portfolio } from "@/pages/Portfolio";
import { DexHub } from "@/pages/DexHub";
import { P2P } from "@/pages/P2P";
import NotFound from "@/pages/not-found";

import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminUsers } from "@/pages/admin/Users";
import { AdminAdmins } from "@/pages/admin/Admins";
import { AdminTradePairs } from "@/pages/admin/TradePairs";
import { AdminApiSettings } from "@/pages/admin/ApiSettings";
import { AdminContractBuilder } from "@/pages/admin/ContractBuilder";
import { AdminThemes } from "@/pages/admin/Themes";
import { AdminTransactions } from "@/pages/admin/Transactions";
import { AdminFeeWallet } from "@/pages/admin/FeeWallet";
import { AdminIntegrations } from "@/pages/admin/Integrations";
import { AdminLogin } from "@/pages/admin/Login";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { applyStoredTheme } from "@/store/useThemeStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { MobileMarkets } from "@/pages/mobile/MobileMarkets";
import { MobilePortfolio } from "@/pages/mobile/MobilePortfolio";
import { MobileSettings } from "@/pages/mobile/MobileSettings";
import { MobileTrade } from "@/pages/mobile/MobileTrade";
import { MobileLiquidity } from "@/pages/mobile/MobileLiquidity";
import { Liquidity } from "@/pages/Liquidity";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5000 },
  },
});

function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAdminAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) navigate("/admin/login");
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function Router() {
  const isMobile = useIsMobile();

  useEffect(() => {
    applyStoredTheme();

    // On startup: verify any EVM wallet saved in localStorage is still genuinely connected.
    // eth_accounts is silent (no popup). If it returns nothing, the stored address is stale
    // (likely a leftover from the old mock-connection flow) — disconnect immediately.
    const { network, disconnect } = useWalletStore.getState();
    if (network === "evm") {
      const eth = (window as any).ethereum;
      if (!eth) {
        disconnect();
      } else {
        eth.request({ method: "eth_accounts" })
          .then((accounts: string[]) => { if (!accounts?.length) disconnect(); })
          .catch(() => disconnect());
      }
    }
  }, []);

  return (
    <Switch>
      {/* Admin login — no auth required */}
      <Route path="/admin/login" component={AdminLogin} />

      {/* Protected admin routes */}
      <Route path="/admin">
        <RequireAdminAuth>
          <AdminLayout><AdminDashboard /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/users">
        <RequireAdminAuth>
          <AdminLayout><AdminUsers /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/admins">
        <RequireAdminAuth>
          <AdminLayout><AdminAdmins /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/pairs">
        <RequireAdminAuth>
          <AdminLayout><AdminTradePairs /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/api">
        <RequireAdminAuth>
          <AdminLayout><AdminApiSettings /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/contracts">
        <RequireAdminAuth>
          <AdminLayout><AdminContractBuilder /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/themes">
        <RequireAdminAuth>
          <AdminLayout><AdminThemes /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/transactions">
        <RequireAdminAuth>
          <AdminLayout><AdminTransactions /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/fee-wallet">
        <RequireAdminAuth>
          <AdminLayout><AdminFeeWallet /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/integrations">
        <RequireAdminAuth>
          <AdminLayout><AdminIntegrations /></AdminLayout>
        </RequireAdminAuth>
      </Route>

      {/* Mobile layout — rendered when on a phone/small screen */}
      {isMobile && (
        <Route>
          <MobileLayout>
            <Switch>
              <Route path="/" component={MobileMarkets} />
              <Route path="/trade/:symbol">
                {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
              </Route>
              <Route path="/futures/:symbol">
                {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
              </Route>
              <Route path="/dex" component={DexHub} />
              <Route path="/liquidity" component={MobileLiquidity} />
              <Route path="/p2p" component={P2P} />
              <Route path="/portfolio" component={MobilePortfolio} />
              <Route path="/settings" component={MobileSettings} />
              <Route component={MobileMarkets} />
            </Switch>
          </MobileLayout>
        </Route>
      )}

      {/* Desktop layout */}
      {!isMobile && (
        <Route>
          <Layout>
            <Switch>
              <Route path="/" component={Markets} />
              <Route path="/markets" component={Markets} />
              <Route path="/trade/:symbol" component={SpotTrading} />
              <Route path="/futures/:symbol" component={FuturesTrading} />
              <Route path="/dex" component={DexHub} />
              <Route path="/liquidity" component={Liquidity} />
              <Route path="/p2p" component={P2P} />
              <Route path="/portfolio" component={Portfolio} />
              <Route component={NotFound} />
            </Switch>
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
