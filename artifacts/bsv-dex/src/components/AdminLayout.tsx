import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ShieldCheck, ArrowRightLeft,
  Key, Cpu, Palette, LogOut, Menu, X, ChevronRight, Activity,
  Wallet, Link2, Bot, Globe, Home, ToggleLeft, Shield, DollarSign,
  Megaphone, ChevronDown, Layers, Copy, Check, ExternalLink, Rocket, Mail, Brain,
  HeartPulse, TrendingUp, Terminal, Headphones, Inbox, HelpCircle, Search,
} from "lucide-react";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { useAccount, useChainId, useBalance, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { cn } from "@/lib/utils";
import { BrandLogo, OrahInline } from "./BrandLogo";

const CHAIN_NAMES: Record<number, { name: string; color: string; short: string }> = {
  1:      { name: "Ethereum",    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "ETH" },
  56:     { name: "BNB Chain",   color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", short: "BNB" },
  137:    { name: "Polygon",     color: "text-violet-400 bg-violet-400/10 border-violet-400/20", short: "MATIC" },
  42161:  { name: "Arbitrum",   color: "text-blue-300 bg-blue-300/10 border-blue-300/20",    short: "ARB" },
  10:     { name: "Optimism",   color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "OP" },
  8453:   { name: "Base",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "BASE" },
  43114:  { name: "Avalanche",  color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "AVAX" },
  250:    { name: "Fantom",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "FTM" },
  324:    { name: "zkSync",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "ZK" },
  534352: { name: "Scroll",     color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", short: "SCR" },
  5000:   { name: "Mantle",     color: "text-teal-400 bg-teal-400/10 border-teal-400/20",    short: "MNT" },
  59144:  { name: "Linea",      color: "text-blue-300 bg-blue-300/10 border-blue-300/20",    short: "LINEA" },
  25:     { name: "Cronos",     color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20", short: "CRO" },
};

const NETWORK_STYLES: Record<string, { color: string; label: string }> = {
  bsv: { color: "text-green-400 bg-green-400/10 border-green-400/20",   label: "BSV" },
  sol: { color: "text-purple-400 bg-purple-400/10 border-purple-400/20", label: "SOL" },
  btc: { color: "text-orange-400 bg-orange-400/10 border-orange-400/20", label: "BTC" },
};

interface NavItem {
  href: string;
  label: string;
  icon: any;
  exact?: boolean;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin",              label: "Dashboard",          icon: LayoutDashboard, exact: true },
      { href: "/admin/setup",        label: "Setup",              icon: Rocket, badge: "A–Z" },
      { href: "/admin/mail",         label: "Email Inbox",        icon: Mail },
    ],
  },
  {
    title: "Customization",
    items: [
      { href: "/admin/site",         label: "Site Settings",      icon: Globe },
      { href: "/admin/home",         label: "Homepage Builder",   icon: Home },
      { href: "/admin/themes",       label: "Themes",             icon: Palette },
      { href: "/admin/announcements",label: "Announcements",      icon: Megaphone },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/features",     label: "Feature Flags",      icon: ToggleLeft },
      { href: "/admin/pairs",        label: "Trade Pairs",        icon: ArrowRightLeft },
      { href: "/admin/trade-analytics", label: "Trade Analytics", icon: TrendingUp, badge: "NEW" },
      { href: "/admin/fees",         label: "Fee Configuration",  icon: DollarSign },
      { href: "/admin/integrations", label: "Integrations",       icon: Link2 },
      { href: "/admin/contracts",    label: "Contracts & Coins",  icon: Cpu },
      { href: "/admin/copy-vaults",  label: "CopyVault",          icon: Copy,    badge: "NEW" },
    ],
  },
  {
    title: "AI Intelligence",
    items: [
      { href: "/admin/ai",           label: "Ora AI Settings",    icon: Brain,   badge: "AI" },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/admin/support",      label: "Support & Contact",  icon: Headphones },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/health",       label: "System Health",      icon: HeartPulse, badge: "LIVE" },
      { href: "/admin/api-monitor",  label: "API Monitor",        icon: Activity,   badge: "NEW" },
      { href: "/admin/liquidity",    label: "Liquidity Bot",      icon: Bot },
      { href: "/admin/tradingview",  label: "TradingView Feed",   icon: TrendingUp },
      { href: "/admin/logs",         label: "System Logs",        icon: Terminal },
    ],
  },
  {
    title: "Integrations",
    items: [
      { href: "/admin/cex",          label: "CEX Connections",    icon: Link2,   badge: "NEW" },
    ],
  },
  {
    title: "Security",
    items: [
      { href: "/admin/security",     label: "Security Settings",  icon: Shield },
      { href: "/admin/api",          label: "API Keys",           icon: Key },
      { href: "/admin/admins",       label: "Admin Users",        icon: ShieldCheck },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/admin/fee-wallet",   label: "Fee Wallet",         icon: Wallet },
      { href: "/admin/bot-profit",   label: "Bot Profit",         icon: Bot },
      { href: "/admin/transactions", label: "On-Chain Txns",      icon: Activity },
    ],
  },
  {
    title: "Users",
    items: [
      { href: "/admin/users",        label: "User Management",    icon: Users },
    ],
  },
];
