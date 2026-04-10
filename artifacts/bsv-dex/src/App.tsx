import { ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminTradeAnalytics } from "@/pages/admin/TradeAnalytics";
import { AdminLogin } from "@/pages/admin/Login";
import { AdminSetupGuide } from "@/pages/admin/SetupGuide";
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
import { AdminSiteSettings } from "@/pages/admin/SiteSettings";
import { AdminHomeBuilder } from "@/pages/admin/HomeBuilder";
import { AdminFeatureFlags } from "@/pages/admin/FeatureFlags";
import { AdminSecuritySettings } from "@/pages/admin/SecuritySettings";
import { AdminFeeConfig } from "@/pages/admin/FeeConfig";
import { AdminAnnouncements } from "@/pages/admin/Announcements";
import { AdminEmailInbox } from "@/pages/admin/EmailInbox";
import { AdminCexConnections } from "@/pages/admin/CexConnections";
import { AdminAiIntelligence } from "@/pages/admin/AiIntelligence";
import { AdminSystemHealth } from "@/pages/admin/SystemHealth";
import { AdminLiquidityBot } from "@/pages/admin/LiquidityBot";
import { AdminCopyVault } from "@/pages/admin/CopyVaultAdmin";
import { AdminTradingView } from "@/pages/admin/TradingViewAdmin";
import { AdminLogsPage } from "@/pages/admin/AdminLogs";
import { AdminSupportSettings } from "@/pages/admin/SupportSettings";
export default function App() {
  return (
    <Switch>
      <Route path="/admin/login"><AdminLogin /></Route>
      <Route path="/admin"><AdminDashboard /></Route>
      <Route path="/admin/trade-analytics"><AdminTradeAnalytics /></Route>
    </Switch>
  );
}
