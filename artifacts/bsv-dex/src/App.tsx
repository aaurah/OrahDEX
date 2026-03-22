import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
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
import { applyStoredTheme } from "@/store/useThemeStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5000 },
  },
});

function Router() {
  useEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    <Switch>
      {/* Admin routes — own layout */}
      <Route path="/admin">
        <AdminLayout><AdminDashboard /></AdminLayout>
      </Route>
      <Route path="/admin/users">
        <AdminLayout><AdminUsers /></AdminLayout>
      </Route>
      <Route path="/admin/admins">
        <AdminLayout><AdminAdmins /></AdminLayout>
      </Route>
      <Route path="/admin/pairs">
        <AdminLayout><AdminTradePairs /></AdminLayout>
      </Route>
      <Route path="/admin/api">
        <AdminLayout><AdminApiSettings /></AdminLayout>
      </Route>
      <Route path="/admin/contracts">
        <AdminLayout><AdminContractBuilder /></AdminLayout>
      </Route>
      <Route path="/admin/themes">
        <AdminLayout><AdminThemes /></AdminLayout>
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
