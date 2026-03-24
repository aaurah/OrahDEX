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
import { AdminBotProfit } from "@/pages/admin/BotProfit";
import { AdminLogin } from "@/pages/admin/Login";
import { AdminSiteSettings } from "@/pages/admin/SiteSettings";
import { AdminHomeBuilder } from "@/pages/admin/HomeBuilder";
import { AdminFeatureFlags } from "@/pages/admin/FeatureFlags";
import { AdminSecuritySettings } from "@/pages/admin/SecuritySettings";
import { AdminFeeConfig } from "@/pages/admin/FeeConfig";
import { AdminAnnouncements } from "@/pages/admin/Announcements";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { applyStoredTheme } from "@/store/useThemeStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { subscribeReownAccount, isReownReady, fetchEvmBalance, parseChainFromCaip } from "@/lib/reown";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { useTxTracker } from "@/hooks/useTxTracker";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { MobileMarkets } from "@/pages/mobile/MobileMarkets";
import { MobilePortfolio } from "@/pages/mobile/MobilePortfolio";
import { MobileSettings } from "@/pages/mobile/MobileSettings";
import { MobileTrade } from "@/pages/mobile/MobileTrade";
import { MobileLiquidity } from "@/pages/mobile/MobileLiquidity";
import { Liquidity } from "@/pages/Liquidity";
import { BridgePage } from "@/pages/Bridge";

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

function RedirectTo({ href }: { href: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(href, { replace: true }); }, []);
  return null;
}

function Router() {
  const isMobile = useIsMobile();

  // Auto-fetch and refresh BSV balance whenever a BSV wallet is connected
  useBsvBalance();

  // Poll pending EVM tx receipts and refresh balance on confirmation
  useTxTracker();

  useEffect(() => {
    applyStoredTheme();

    const eth = (window as any).ethereum;

    // On startup: verify any EVM wallet saved in localStorage is still genuinely connected.
    // eth_accounts is silent (no popup). If it returns nothing, the stored address is stale.
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

    // ── accountsChanged — user switched wallet account ─────────────────────
    const onAccountsChanged = async (accounts: string[]) => {
      const { provider: p } = useWalletStore.getState();
      if (p === "reown") return; // Reown handles its own state
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

    // ── chainChanged — user switched network ───────────────────────────────
    const onChainChanged = async (chainHex: string) => {
      const { address: addr, provider: p } = useWalletStore.getState();
      if (p === "reown" || !addr) return;
      const chainId = parseInt(chainHex, 16);
      // Clear stale balance immediately so the UI doesn't show the old chain's value
      useWalletStore.getState().setBalance(null);
      useWalletStore.getState().connect({ address: addr, provider: p ?? "metamask", network: "evm", chainId });
      // Fetch fresh balance for the new chain
      const bal = await fetchEvmBalance(addr, chainId);
      if (bal !== null) useWalletStore.getState().setBalance(bal);
    };

    if (eth) {
      eth.on?.("accountsChanged", onAccountsChanged);
      eth.on?.("chainChanged", onChainChanged);
    }

    // Subscribe to Reown AppKit account changes and sync to wallet store.
    // Polls until Reown is initialized (it's async — project ID fetch happens after mount).
    let reownUnsub: (() => void) | null = null;
    let pollTries = 0;
    const pollReown = setInterval(() => {
      if (isReownReady()) {
        clearInterval(pollReown);
        reownUnsub = subscribeReownAccount(async (state) => {
          const { provider: current } = useWalletStore.getState();
          if (state.isConnected && state.address) {
            // Parse chainId from CAIP address (e.g. "eip155:8453:0xabc..." → 8453)
            const chainId = parseChainFromCaip(state.caipAddress) ?? 1;

            // Connect immediately with address + chainId so UI updates fast
            useWalletStore.getState().connect({
              address: state.address,
              provider: "reown",
              network: "evm",
              chainId,
            });

            // Fetch balance in background using public RPC (works for all wallet types)
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
      <Route path="/admin/bot-profit">
        <RequireAdminAuth>
          <AdminLayout><AdminBotProfit /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/site">
        <RequireAdminAuth>
          <AdminLayout><AdminSiteSettings /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/home">
        <RequireAdminAuth>
          <AdminLayout><AdminHomeBuilder /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/features">
        <RequireAdminAuth>
          <AdminLayout><AdminFeatureFlags /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/security">
        <RequireAdminAuth>
          <AdminLayout><AdminSecuritySettings /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/fees">
        <RequireAdminAuth>
          <AdminLayout><AdminFeeConfig /></AdminLayout>
        </RequireAdminAuth>
      </Route>
      <Route path="/admin/announcements">
        <RequireAdminAuth>
          <AdminLayout><AdminAnnouncements /></AdminLayout>
        </RequireAdminAuth>
      </Route>

      {/* Bare /spot and /futures → redirect to default pairs */}
      <Route path="/spot"><RedirectTo href="/trade/BSV-USDT" /></Route>
      <Route path="/futures"><RedirectTo href="/futures/BSV-USDT-PERP" /></Route>

      {/* Mobile layout — rendered when on a phone/small screen */}
      {isMobile && (
        <Route>
          <MobileLayout>
            <Switch>
              <Route path="/" component={MobileMarkets} />
              <Route path="/markets" component={MobileMarkets} />
              <Route path="/trade/:symbol">
                {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
              </Route>
              <Route path="/futures/:symbol">
                {(params) => <MobileTrade symbol={params.symbol ?? "BSV-USDT"} />}
              </Route>
              <Route path="/dex" component={DexHub} />
              <Route path="/liquidity" component={MobileLiquidity} />
              <Route path="/p2p" component={P2P} />
              <Route path="/bridge" component={BridgePage} />
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
              <Route path="/bridge" component={BridgePage} />
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
