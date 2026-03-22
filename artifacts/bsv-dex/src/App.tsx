import { useEffect, ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/AdminLayout";
import { Markets } from "@/pages/Markets";
import { SpotTrading } from "@/pages/Spot";
import { FuturesTrading } from "@/pages/Futures";
import { Portfolio } from "@/pages/Portfolio";
import NotFound from "@/pages/not-found";

import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminUsers } from "@/pages/admin/Users";
import { AdminAdmins } from "@/pages/admin/Admins";
import { AdminTradePairs } from "@/pages/admin/TradePairs";
import { AdminApiSettings } from "@/pages/admin/ApiSettings";
import { AdminContractBuilder } from "@/pages/admin/ContractBuilder";
import { AdminThemes } from "@/pages/admin/Themes";
import { AdminLogin } from "@/pages/admin/Login";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { applyStoredTheme } from "@/store/useThemeStore";

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
  useEffect(() => {
    applyStoredTheme();
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

      {/* Main exchange routes */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Markets} />
            <Route path="/trade/:symbol" component={SpotTrading} />
            <Route path="/futures/:symbol" component={FuturesTrading} />
            <Route path="/portfolio" component={Portfolio} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
