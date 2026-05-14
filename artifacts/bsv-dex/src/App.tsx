import { useEffect, ReactNode, lazy, Suspense, Component } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { PinPromptModal } from "@/components/PinPromptModal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletChooserDialog } from "@/components/WalletChooserDialog";

import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { applyStoredTheme, useThemeStore } from "@/store/useThemeStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { useTxTracker } from "@/hooks/useTxTracker";
import { useInternalEvmWallet } from "@/hooks/useInternalEvmWallet";
import { useInternalBsvWallet } from "@/hooks/useInternalBsvWallet";

const AdminLayout  = lazy(() => import("@/components/AdminLayout").then(m => ({ default: m.AdminLayout })));
const MobileLayout = lazy(() => import("@/components/mobile/MobileLayout").then(m => ({ default: m.MobileLayout })));
const MobileTabKeeper = lazy(() => import("@/components/mobile/MobileTabKeeper").then(m => ({ default: m.MobileTabKeeper })));
const Layout = lazy(() => import("@/components/Layout").then(m => ({ default: m.Layout })));

/* ─── Lazy page imports — each becomes its own JS chunk ─── */
const LandingPage  = lazy(() => import("@/pages/Landing").then(m => ({ default: m.LandingPage })));
const Markets      = lazy(() => import("@/pages/Markets").then(m => ({ default: m.Markets })));
const SpotTrading  = lazy(() => import("@/pages/Spot").then(m => ({ default: m.SpotTrading })));
const FuturesTrading = lazy(() => import("@/pages/Futures").then(m => ({ default: m.FuturesTrading })));
const Portfolio    = lazy(() => import("@/pages/Portfolio").then(m => ({ default: m.Portfolio })));
const WalletPage   = lazy(() => import("@/pages/Wallet"));
const DexHub       = lazy(() => import("@/pages/DexHub").then(m => ({ default: m.DexHub })));
const SwapPage     = lazy(() => import("@/pages/Swap").then(m => ({ default: m.Swap })));
const P2P          = lazy(() => import("@/pages/P2P").then(m => ({ default: m.P2P })));
const Liquidity    = lazy(() => import("@/pages/Liquidity").then(m => ({ default: m.Liquidity })));
const BridgePage   = lazy(() => import("@/pages/Bridge").then(m => ({ default: m.BridgePage })));
const CopyTrading  = lazy(() => import("@/pages/CopyTrading").then(m => ({ default: m.CopyTrading })));
const RevenuePage  = lazy(() => import("@/pages/Revenue"));
const SovereignOverviewPage = lazy(() => import("@/pages/SovereignOverview").then(m => ({ default: m.SovereignOverviewPage })));
const NotFound     = lazy(() => import("@/pages/not-found"));

/* Legal / Info — standalone full-screen pages (no Layout wrapper) */
const TermsOfService  = lazy(() => import("@/pages/TermsOfService").then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy   = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const WhitePaper      = lazy(() => import("@/pages/WhitePaper").then(m => ({ default: m.WhitePaper })));
const SupportPage     = lazy(() => import("@/pages/Support").then(m => ({ default: m.SupportPage })));
const WebSettings     = lazy(() => import("@/pages/Settings").then(m => ({ default: m.WebSettings })));

/* Mobile */
const MobileMarkets   = lazy(() => import("@/pages/mobile/MobileMarkets").then(m => ({ default: m.MobileMarkets })));
const MobilePortfolio      = lazy(() => import("@/pages/mobile/MobilePortfolio").then(m => ({ default: m.MobilePortfolio })));
const MobileCoinWallet     = lazy(() => import("@/pages/mobile/MobileCoinWallet").then(m => ({ default: m.MobileCoinWallet })));
const MobileWalletPortfolio = lazy(() => import("@/pages/mobile/MobileWalletPortfolio").then(m => ({ default: m.MobileWalletPortfolio })));
const MobileSettings  = lazy(() => import("@/pages/mobile/MobileSettings").then(m => ({ default: m.MobileSettings })));
const UserApiKeys     = lazy(() => import("@/pages/UserApiKeys").then(m => ({ default: m.UserApiKeys })));
const MobileTrade     = lazy(() => import("@/pages/mobile/MobileTrade").then(m => ({ default: m.MobileTrade })));
const MobileLiquidity = lazy(() => import("@/pages/mobile/MobileLiquidity").then(m => ({ default: m.MobileLiquidity })));
const GenesisLiquidity = lazy(() => import("@/pages/GenesisLiquidity"));
const MobileGenesis    = lazy(() => import("@/pages/mobile/MobileGenesis"));
const KeeperProfile    = lazy(() => import("@/pages/KeeperProfile").then(m => ({ default: m.KeeperProfile })));
const MobileHandCashBridge = lazy(() => import("@/pages/mobile/MobileHandCashBridge").then(m => ({ default: m.MobileHandCashBridge })));
const MobileQRScanner  = lazy(() => import("@/pages/mobile/MobileQRScanner").then(m => ({ default: m.MobileQRScanner })));
const MobileNFT        = lazy(() => import("@/pages/mobile/MobileNFT").then(m => ({ default: m.MobileNFT })));
const MobileStaking    = lazy(() => import("@/pages/mobile/MobileStaking").then(m => ({ default: m.MobileStaking })));
const NFTPage          = lazy(() => import("@/pages/NFT").then(m => ({ default: m.NFTPage })));
const PredictionTrading = lazy(() => import("@/pages/Prediction").then(m => ({ default: m.PredictionTrading })));

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
const AdminStripeOrders   = lazy(() => import("@/pages/admin/StripeOrders").then(m => ({ default: m.AdminStripeOrders })));
const AdminFeeWallet      = lazy(() => import("@/pages/admin/FeeWallet").then(m => ({ default: m.AdminFeeWallet })));
const AdminBotProfit      = lazy(() => import("@/pages/admin/BotProfit").then(m => ({ default: m.AdminBotProfit })));
const AdminArbBot         = lazy(() => import("@/pages/admin/ArbBot").then(m => ({ default: m.AdminArbBot })));
const AdminSeededPool     = lazy(() => import("@/pages/admin/SeededPool"));
const AdminTreasury       = lazy(() => import("@/pages/admin/Treasury").then(m => ({ default: m.AdminTreasury })));
const AdminSiteSettings   = lazy(() => import("@/pages/admin/SiteSettings").then(m => ({ default: m.AdminSiteSettings })));
const AdminHomeBuilder    = lazy(() => import("@/pages/admin/HomeBuilder").then(m => ({ default: m.AdminHomeBuilder })));
const AdminFeatureFlags   = lazy(() => import("@/pages/admin/FeatureFlags").then(m => ({ default: m.AdminFeatureFlags })));
const AdminSecuritySettings = lazy(() => import("@/pages/admin/SecuritySettings").then(m => ({ default: m.AdminSecuritySettings })));
const AdminFeeConfig      = lazy(() => import("@/pages/admin/FeeConfig").then(m => ({ default: m.AdminFeeConfig })));
const AdminAnnouncements  = lazy(() => import("@/pages/admin/Announcements").then(m => ({ default: m.AdminAnnouncements })));
const AdminEmailInbox     = lazy(() => import("@/pages/admin/EmailInbox").then(m => ({ default: m.AdminEmailInbox })));
const AdminAiIntelligence = lazy(() => import("@/pages/admin/AiIntelligence").then(m => ({ default: m.AdminAiIntelligence })));
const AdminSystemHealth   = lazy(() => import("@/pages/admin/SystemHealth").then(m => ({ default: m.AdminSystemHealth })));
const AdminLiquidityBot   = lazy(() => import("@/pages/admin/LiquidityBot").then(m => ({ default: m.AdminLiquidityBot })));
const AdminCopyVault      = lazy(() => import("@/pages/admin/CopyVaultAdmin").then(m => ({ default: m.AdminCopyVault })));
const AdminPrediction     = lazy(() => import("@/pages/admin/PredictionAdmin"));
const AdminTradingView    = lazy(() => import("@/pages/admin/TradingViewAdmin").then(m => ({ default: m.AdminTradingView })));
const AdminLogsPage          = lazy(() => import("@/pages/admin/AdminLogs").then(m => ({ default: m.AdminLogsPage })));
const AdminLEIncome          = lazy(() => import("@/pages/admin/LEIncome").then(m => ({ default: m.AdminLEIncome })));
const AdminSupportSettings   = lazy(() => import("@/pages/admin/SupportSettings").then(m => ({ default: m.AdminSupportSettings })));
const AdminSupportInbox      = lazy(() => import("@/pages/admin/SupportInbox").then(m => ({ default: m.AdminSupportInbox })));
const SupportThreadPage      = lazy(() => import("@/pages/SupportThread").then(m => ({ default: m.SupportThread })));
const AdminApiMonitor        = lazy(() => import("@/pages/admin/ApiMonitor").then(m => ({ default: m.ApiMonitor })));
const AdminTradeAnalytics    = lazy(() => import("@/pages/admin/TradeAnalytics").then(m => ({ default: m.AdminTradeAnalytics })));
const AdminWithdrawals       = lazy(() => import("@/pages/admin/Withdrawals").then(m => ({ default: m.AdminWithdrawals })));
const AdminIntegrations      = lazy(() => import("@/pages/admin/Integrations").then(m => ({ default: m.AdminIntegrations })));
const AdminMintBurn          = lazy(() => import("@/pages/admin/MintBurn").then(m => ({ default: m.AdminMintBurn })));
const AdminLedgerManager     = lazy(() => import("@/pages/admin/LedgerManager").then(m => ({ default: m.AdminLedgerManager })));
const AdminDbSync            = lazy(() => import("@/pages/admin/DbSync").then(m => ({ default: m.AdminDbSync })));
const AdminCexConnections    = lazy(() => import("@/pages/admin/CexConnections").then(m => ({ default: m.AdminCexConnections })));
const AdminDiagnostics       = lazy(() => import("@/pages/admin/Diagnostics"));

/* ─── Error Boundary — catches render errors, shows friendly fallback ─── */
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[OrahDEX] Render error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground text-sm mb-6">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:brightness-110 transition-all"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const { isAuthenticated, token, logout } = useAdminAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (isAuthenticated && !token) logout();
      navigate("/admin/login");
    }
  }, [isAuthenticated, token]);

  if (!isAuthenticated || !token) return null;
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
      <Suspense fallback={<PageSkeleton />}>
        <AdminLayout>
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </AdminLayout>
      </Suspense>
    </RequireAdminAuth>
  );
}

function Router() {
  const isMobile = useIsMobile();

  const { refresh: refreshBsvBalance } = useBsvBalance();
  const balanceRefreshKey = useWalletStore((s) => s.balanceRefreshKey);
  useTxTracker();

  useEffect(() => {
    if (balanceRefreshKey > 0) refreshBsvBalance();
  }, [balanceRefreshKey, refreshBsvBalance]);

  useEffect(() => {
    applyStoredTheme();

    // Apply app theme to Reown modal once after it finishes initialising
    const themeTimer = setTimeout(() => {
      import("@/lib/reown").then(({ syncReownTheme }) =>
        syncReownTheme(useThemeStore.getState().theme)
      );
    }, 1500);
    const unsubTheme = () => clearTimeout(themeTimer);

    const eth = (window as any).ethereum;

    const { network, address, disconnect, provider: storedProvider } = useWalletStore.getState();
    // Skip the injected-wallet liveness check for:
    //   • reown      → handled by its own subscription below
    //   • orah-wallet → in-app self-custodial wallet, address derived locally
    //                   from the PIN/passkey secret — never depends on window.ethereum
    if (network === "evm" && storedProvider !== "reown" && storedProvider !== "orah-wallet") {
      if (!eth) {
        disconnect();
      } else {
        eth.request({ method: "eth_accounts" })
          .then(async (accounts: string[]) => {
            if (!accounts?.length) {
              disconnect();
            } else if (accounts[0] && accounts[0].toLowerCase() !== address?.toLowerCase()) {
              // Always sync — even if we have an old stored address from a different account
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
      // Orah Wallet is self-custodial and independent of window.ethereum —
      // ignore injected wallet account events for it.
      if (p === "orah-wallet") return;
      if (!accounts.length) {
        useWalletStore.getState().disconnect();
      } else {
        const chainHex: string = await eth.request({ method: "eth_chainId" }).catch(() => "0x1");
        const chainId = parseInt(chainHex, 16);
        useWalletStore.getState().connect({ address: accounts[0], provider: p ?? "metamask", network: "evm", chainId });
        const { fetchEvmBalance } = await import("@/lib/reown").catch(() => ({ fetchEvmBalance: async () => null }));
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
      const { fetchEvmBalance } = await import("@/lib/reown").catch(() => ({ fetchEvmBalance: async () => null }));
      const bal = await fetchEvmBalance(addr, chainId);
      if (bal !== null) useWalletStore.getState().setBalance(bal);
    };

    if (eth) {
      eth.on?.("accountsChanged", onAccountsChanged);
      eth.on?.("chainChanged", onChainChanged);
    }

    let reownUnsub: (() => void) | null = null;
    import("@/lib/reown").then(({ subscribeReownAccount, fetchEvmBalance, parseChainFromCaip, isUserDisconnecting, setUserDisconnecting }) => {
      reownUnsub = subscribeReownAccount(async (state) => {
        const { provider: current } = useWalletStore.getState();
        if (state.isConnected && state.address) {
          if (isUserDisconnecting()) return;
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
          setUserDisconnecting(false);
        }
      });
    });

    return () => {
      unsubTheme();
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
      <Route path="/admin/stripe-orders"><AdminRoute><AdminStripeOrders /></AdminRoute></Route>
      <Route path="/admin/withdrawals"><AdminRoute><AdminWithdrawals /></AdminRoute></Route>
      <Route path="/admin/ledger">    <AdminRoute><AdminLedgerManager /></AdminRoute></Route>
      <Route path="/admin/db-sync">   <AdminRoute><AdminDbSync /></AdminRoute></Route>
      <Route path="/admin/treasury">  <AdminRoute><AdminTreasury /></AdminRoute></Route>
      <Route path="/admin/mint-burn"><AdminRoute><AdminMintBurn /></AdminRoute></Route>
      <Route path="/admin/fee-wallet"><AdminRoute><AdminFeeWallet /></AdminRoute></Route>
      <Route path="/admin/bot-profit"><AdminRoute><AdminBotProfit /></AdminRoute></Route>
      <Route path="/admin/arb-bot">  <AdminRoute><AdminArbBot /></AdminRoute></Route>
      <Route path="/admin/seeded-pool"> <AdminRoute><AdminSeededPool /></AdminRoute></Route>
      <Route path="/admin/site">    <AdminRoute><AdminSiteSettings /></AdminRoute></Route>
      <Route path="/admin/home">    <AdminRoute><AdminHomeBuilder /></AdminRoute></Route>
      <Route path="/admin/features"><AdminRoute><AdminFeatureFlags /></AdminRoute></Route>
      <Route path="/admin/security"><AdminRoute><AdminSecuritySettings /></AdminRoute></Route>
      <Route path="/admin/fees">    <AdminRoute><AdminFeeConfig /></AdminRoute></Route>
      <Route path="/admin/announcements"><AdminRoute><AdminAnnouncements /></AdminRoute></Route>
      <Route path="/admin/mail">          <AdminRoute><AdminEmailInbox /></AdminRoute></Route>
      <Route path="/admin/integrations"> <AdminRoute><AdminIntegrations /></AdminRoute></Route>
      <Route path="/admin/ai">        <AdminRoute><AdminAiIntelligence /></AdminRoute></Route>
      <Route path="/admin/health">    <AdminRoute><AdminSystemHealth /></AdminRoute></Route>
      <Route path="/admin/liquidity"> <AdminRoute><AdminLiquidityBot /></AdminRoute></Route>
      <Route path="/admin/copy-vaults"><AdminRoute><AdminCopyVault /></AdminRoute></Route>
      <Route path="/admin/prediction"><AdminRoute><AdminPrediction /></AdminRoute></Route>
      <Route path="/admin/tradingview"><AdminRoute><AdminTradingView /></AdminRoute></Route>
      <Route path="/admin/logs">        <AdminRoute><AdminLogsPage /></AdminRoute></Route>
      <Route path="/admin/support">         <AdminRoute><AdminSupportSettings /></AdminRoute></Route>
      <Route path="/admin/support/inbox">  <AdminRoute><AdminSupportInbox /></AdminRoute></Route>
      <Route path="/admin/api-monitor"><AdminRoute><AdminApiMonitor /></AdminRoute></Route>
      <Route path="/admin/trade-analytics"><AdminRoute><AdminTradeAnalytics /></AdminRoute></Route>
      <Route path="/admin/le-income">     <AdminRoute><AdminLEIncome /></AdminRoute></Route>
      <Route path="/admin/cex-connections"><AdminRoute><AdminCexConnections /></AdminRoute></Route>
      <Route path="/admin/diagnostics">   <AdminRoute><AdminDiagnostics /></AdminRoute></Route>

      {/* ── Landing page ── */}
      <Route path="/home">
        <Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>
      </Route>

      {/* ── Root: show landing page ── */}
      <Route path="/">
        <Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>
      </Route>

      {/* ── Redirects ── */}
      <Route path="/spot"><RedirectTo href="/trade/BSV-USDT" /></Route>
      <Route path="/trade"><RedirectTo href="/trade/BSV-USDT" /></Route>
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
      <Route path="/support">
        <Suspense fallback={<PageSkeleton />}><SupportPage /></Suspense>
      </Route>
      <Route path="/support/thread/:id">
        {(params) => (
          <Suspense fallback={<PageSkeleton />}>
            <SupportThreadPage ticketId={params.id ?? "0"} />
          </Suspense>
        )}
      </Route>

      {/* ── Mobile layout ── */}
      {isMobile && (
        <Route>
          <Suspense fallback={<PageSkeleton />}>
          <MobileLayout>
            <Suspense fallback={<PageSkeleton />}>
              <MobileTabKeeper />
            </Suspense>
          </MobileLayout>
          </Suspense>
        </Route>
      )}

      {/* ── Desktop layout ── */}
      {!isMobile && (
        <Route>
          <Suspense fallback={<PageSkeleton />}>
            <Layout>
              <Suspense fallback={<PageSkeleton />}>
                <Switch>
                  <Route path="/markets"        component={Markets} />
                  <Route path="/trade/:symbol"  component={SpotTrading} />
                  <Route path="/futures/:symbol" component={FuturesTrading} />
                  <Route path="/dex"            component={DexHub} />
                  <Route path="/swap"           component={SwapPage} />
                  <Route path="/liquidity"      component={Liquidity} />
                  <Route path="/genesis"        component={GenesisLiquidity} />
                  <Route path="/p2p"            component={P2P} />
                  <Route path="/bridge"         component={BridgePage} />
                  <Route path="/copy"           component={CopyTrading} />
                  <Route path="/fees"           component={RevenuePage} />
                  <Route path="/keeper"         component={KeeperProfile} />
                  <Route path="/wallet">{() => <WalletPage />}</Route>
                  <Route path="/portfolio"      component={Portfolio} />
                  <Route path="/portfolio/:coin">
                    {(params) => <MobileCoinWallet coin={params.coin ?? "BTC"} />}
                  </Route>
                  <Route path="/staking"        component={MobileStaking} />
                  <Route path="/nft"            component={NFTPage} />
                  <Route path="/prediction"     component={PredictionTrading} />
                  <Route path="/sovereign"      component={SovereignOverviewPage} />
                  <Route path="/settings"           component={WebSettings} />
                  <Route path="/settings/api-keys" component={UserApiKeys} />
                  <Route component={NotFound} />
                </Switch>
              </Suspense>
            </Layout>
          </Suspense>
        </Route>
      )}
    </Switch>
  );
}

function AppContent() {
  useInternalEvmWallet();
  useInternalBsvWallet();

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
      <PinPromptModal />
      {/* Wallet chooser — always mounted so it works across all layouts */}
      <WalletChooserDialog />
    </>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
