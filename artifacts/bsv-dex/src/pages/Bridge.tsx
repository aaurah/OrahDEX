import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowRight, ArrowLeftRight, ChevronDown, Shield, Zap, Clock,
  AlertTriangle, CheckCircle2, Lock, Unlock, RefreshCw, Info,
  Layers, Link2, Globe, Copy, Check, ExternalLink, X, Loader2,
  ArrowDown, ArrowUp, Coins, Flame, Cpu, Waves, Activity, Gauge,
} from "lucide-react";
import { useBsvChain, fmtHashrate, fmtDifficulty, fmtMempoolMb, fmtBlockAge } from "@/hooks/useBsvChain";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { cn } from "@/lib/utils";
import { useStagedMarkets as useGetMarkets } from "@/hooks/useStagedMarkets";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";

// ─── Chain / Token definitions ────────────────────────────────────────────────

type Layer = "L1" | "L2" | "L3";
type SwapMode = "htlc" | "wrapped";

type HtlcStatus = "pending" | "funded" | "minting" | "complete" | "refunded" | "expired";

interface HtlcLock {
  lockId: string;
  htlcAddress: string;
  redeemScript: string;
  secretHash: string;
  amountBsv: number;
  locktimeBlocks: number;
  currentBlock: number;
  expiresIn: string;
  status: HtlcStatus;
  fundingTxid?: string | null;
  mintTxHash?: string | null;
  instructions?: string[];
}

interface Chain {
  id: string;
  name: string;
  layer: Layer;
  color: string;
  bgColor: string;
  icon: string;
  tokens: string[];
  desc: string;
}

const CHAINS: Chain[] = [
  // ── Layer 1 — Sovereign base chains ──────────────────────────────────────
  { id: "bsv",      name: "BSV",        layer: "L1", color: "text-green-400",    bgColor: "bg-green-500/15 border-green-500/30",    icon: "₿", tokens: ["BSV","USDT"],                   desc: "Bitcoin SV — fastest settlement" },
  { id: "btc",      name: "Bitcoin",    layer: "L1", color: "text-orange-400",   bgColor: "bg-orange-500/15 border-orange-500/30",   icon: "₿", tokens: ["BTC"],                           desc: "Bitcoin — base layer security" },
  { id: "eth",      name: "Ethereum",   layer: "L1", color: "text-violet-400",   bgColor: "bg-violet-500/15 border-violet-500/30",   icon: "⬡", tokens: ["ETH","USDC","USDT","WBTC"],     desc: "Ethereum — smart contract L1" },
  { id: "sol",      name: "Solana",     layer: "L1", color: "text-cyan-400",     bgColor: "bg-cyan-500/15 border-cyan-500/30",       icon: "◎", tokens: ["SOL","USDC","BONK"],             desc: "Solana — high-throughput L1" },
  { id: "bnb",      name: "BNB Chain",  layer: "L1", color: "text-yellow-400",   bgColor: "bg-yellow-500/15 border-yellow-500/30",   icon: "◈", tokens: ["BNB","BUSD","USDT","CAKE"],     desc: "BNB Chain — Binance EVM L1" },
  { id: "avax",     name: "Avalanche",  layer: "L1", color: "text-red-400",      bgColor: "bg-red-500/15 border-red-500/30",         icon: "▲", tokens: ["AVAX","USDC","USDT"],           desc: "Avalanche — subnet L1" },
  { id: "tron",     name: "TRON",       layer: "L1", color: "text-rose-400",     bgColor: "bg-rose-500/15 border-rose-500/30",       icon: "◇", tokens: ["TRX","USDT","USDC"],            desc: "TRON — high-volume payments L1" },
  { id: "dot",      name: "Polkadot",   layer: "L1", color: "text-pink-400",     bgColor: "bg-pink-500/15 border-pink-500/30",       icon: "⬤", tokens: ["DOT","USDT"],                   desc: "Polkadot — parachain relay L1" },

  // ── Layer 2 — Ethereum scaling + EVM alt-L1s ──────────────────────────────
  { id: "arb",      name: "Arbitrum",   layer: "L2", color: "text-sky-400",      bgColor: "bg-sky-500/15 border-sky-500/30",         icon: "⬡", tokens: ["ETH","ARB","USDC","USDT"],      desc: "Arbitrum — Optimistic rollup" },
  { id: "op",       name: "Optimism",   layer: "L2", color: "text-red-400",      bgColor: "bg-red-500/15 border-red-500/30",         icon: "⬡", tokens: ["ETH","OP","USDC","USDT"],       desc: "Optimism — OP Stack rollup" },
  { id: "base",     name: "Base",       layer: "L2", color: "text-blue-400",     bgColor: "bg-blue-500/15 border-blue-500/30",       icon: "⬡", tokens: ["ETH","USDC","cbBTC"],           desc: "Base — Coinbase OP Stack L2" },
  { id: "poly",     name: "Polygon",    layer: "L2", color: "text-purple-400",   bgColor: "bg-purple-500/15 border-purple-500/30",   icon: "⬡", tokens: ["POL","ETH","USDC","USDT"],      desc: "Polygon PoS — EVM sidechain" },
  { id: "zksync",   name: "zkSync Era", layer: "L2", color: "text-indigo-400",   bgColor: "bg-indigo-500/15 border-indigo-500/30",   icon: "⬡", tokens: ["ETH","ZK","USDC","USDT"],       desc: "zkSync Era — ZK rollup" },
  { id: "linea",    name: "Linea",      layer: "L2", color: "text-lime-400",     bgColor: "bg-lime-500/15 border-lime-500/30",       icon: "⬡", tokens: ["ETH","USDC","USDT"],            desc: "Linea — ConsenSys ZK rollup" },
  { id: "scroll",   name: "Scroll",     layer: "L2", color: "text-amber-400",    bgColor: "bg-amber-500/15 border-amber-500/30",     icon: "⬡", tokens: ["ETH","USDC","USDT"],            desc: "Scroll — zkEVM rollup" },
  { id: "mantle",   name: "Mantle",     layer: "L2", color: "text-teal-400",     bgColor: "bg-teal-500/15 border-teal-500/30",       icon: "⬡", tokens: ["MNT","ETH","USDC","USDT"],      desc: "Mantle — Modular L2" },
  { id: "blast",    name: "Blast",      layer: "L2", color: "text-yellow-300",   bgColor: "bg-yellow-500/15 border-yellow-500/30",   icon: "⬡", tokens: ["ETH","BLAST","USDB"],           desc: "Blast — native yield L2" },
  { id: "mode",     name: "Mode",       layer: "L2", color: "text-green-300",    bgColor: "bg-green-500/15 border-green-500/30",     icon: "⬡", tokens: ["ETH","MODE","USDC"],            desc: "Mode — DeFi OP Stack L2" },
  { id: "boba",     name: "Boba",       layer: "L2", color: "text-emerald-400",  bgColor: "bg-emerald-500/15 border-emerald-500/30", icon: "⬡", tokens: ["ETH","BOBA","USDC"],            desc: "Boba — Hybrid compute L2" },
  { id: "metis",    name: "Metis",      layer: "L2", color: "text-cyan-300",     bgColor: "bg-cyan-500/15 border-cyan-500/30",       icon: "⬡", tokens: ["METIS","ETH","USDC"],           desc: "Metis — Andromeda L2" },
  { id: "taiko",    name: "Taiko",      layer: "L2", color: "text-pink-300",     bgColor: "bg-pink-500/15 border-pink-500/30",       icon: "⬡", tokens: ["ETH","TAIKO","USDC"],           desc: "Taiko — based ZK rollup" },
  { id: "gnosis",   name: "Gnosis",     layer: "L2", color: "text-teal-300",     bgColor: "bg-teal-500/15 border-teal-500/30",       icon: "⬡", tokens: ["xDAI","GNO","USDC"],            desc: "Gnosis Chain — stable payment L2" },
  { id: "celo",     name: "Celo",       layer: "L2", color: "text-lime-300",     bgColor: "bg-lime-500/15 border-lime-500/30",       icon: "⬡", tokens: ["CELO","cUSD","USDC"],           desc: "Celo — mobile-first EVM L2" },
  { id: "moonbeam", name: "Moonbeam",   layer: "L2", color: "text-violet-300",   bgColor: "bg-violet-500/15 border-violet-500/30",   icon: "⬡", tokens: ["GLMR","DOT","USDC"],            desc: "Moonbeam — Polkadot EVM parachain" },
  { id: "sonic",    name: "Sonic",      layer: "L2", color: "text-orange-300",   bgColor: "bg-orange-500/15 border-orange-500/30",   icon: "⬡", tokens: ["S","USDC","USDT"],              desc: "Sonic — Fantom-successor EVM" },

  // ── Layer 3 — App-chains & sovereign rollups ──────────────────────────────
  { id: "degen",    name: "Degen Chain",layer: "L3", color: "text-fuchsia-400",  bgColor: "bg-fuchsia-500/15 border-fuchsia-500/30", icon: "◈", tokens: ["DEGEN","ETH"],                  desc: "Degen Chain — Base L3 memecoin" },
  { id: "xai",      name: "Xai",        layer: "L3", color: "text-red-300",      bgColor: "bg-red-500/15 border-red-500/30",         icon: "◈", tokens: ["XAI","ETH"],                    desc: "Xai — Arbitrum L3 gaming" },
  { id: "apechain", name: "ApeChain",   layer: "L3", color: "text-blue-300",     bgColor: "bg-blue-500/15 border-blue-500/30",       icon: "◈", tokens: ["APE","ETH","USDC"],             desc: "ApeChain — Arbitrum L3 by Yuga" },
  { id: "zora",     name: "Zora",       layer: "L3", color: "text-purple-300",   bgColor: "bg-purple-500/15 border-purple-500/30",   icon: "◈", tokens: ["ETH","USDC"],                   desc: "Zora — OP Stack L3 creator NFT" },
  { id: "redstone", name: "Redstone",   layer: "L3", color: "text-rose-300",     bgColor: "bg-rose-500/15 border-rose-500/30",       icon: "◈", tokens: ["ETH","RED"],                    desc: "Redstone — OP Stack L3 gaming" },
  { id: "treasure", name: "Treasure",   layer: "L3", color: "text-amber-300",    bgColor: "bg-amber-500/15 border-amber-500/30",     icon: "◈", tokens: ["MAGIC","ETH","USDC"],           desc: "Treasure — Arbitrum L3 gaming" },
  { id: "hypr",     name: "HYPR",       layer: "L3", color: "text-sky-300",      bgColor: "bg-sky-500/15 border-sky-500/30",         icon: "◈", tokens: ["ETH","USDC"],                   desc: "HYPR — ZK L3 social layer" },
];

const SPOT_PRICES: Record<string, number> = {
  BSV: 16, BTC: 83000, ETH: 2400, SOL: 130, USDT: 1, USDC: 1, cUSD: 1, xDAI: 1, USDB: 1,
  ARB: 0.42, OP: 0.70, POL: 0.23, MATIC: 0.32, cbBTC: 83000, WBTC: 83000, BONK: 0.000017,
  BNB: 580, AVAX: 18, TRX: 0.07, DOT: 4.2,
  ZK: 0.065, MNT: 0.70, BLAST: 0.008, MODE: 0.022, BOBA: 0.14, METIS: 28, TAIKO: 1.1,
  GNO: 160, CELO: 0.47, GLMR: 0.12, S: 0.38,
  DEGEN: 0.0018, XAI: 0.095, APE: 0.62, MAGIC: 0.31, RED: 0.055,
};

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 2.0];

// ─── Canonical L1 → L2 asset mapping ─────────────────────────────────────────
interface CanonicalL2 {
  chainId: string; chain: string; symbol: string; label: string;
  type: "canonical" | "wrapped" | "cctp"; bridge: string; time: string; color: string; bg: string;
}
interface CanonicalAsset {
  l1: { chainId: string; chain: string; symbol: string; color: string; icon: string };
  l2: CanonicalL2[];
}
type CctpIntentStatus = "created" | "attested" | "completed";
const CCTP_CHAIN_IDS: Record<string, number> = {
  eth: 1,
  op: 10,
  arb: 42161,
  base: 8453,
  poly: 137,
};
const CCTP_POLL_INTERVAL_MS = 4000;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const CANONICAL_ASSETS: Record<string, CanonicalAsset> = {
  BSV: {
    l1: { chainId: "bsv", chain: "BSV", symbol: "BSV", color: "text-green-400", icon: "₿" },
    l2: [
      { chainId: "eth",      chain: "Ethereum",   symbol: "wBSV", label: "wBSV (ERC-20)",        type: "wrapped",   bridge: "OrahDEX HTLC",          time: "~5 min",  color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/30" },
      { chainId: "base",     chain: "Base",        symbol: "wBSV", label: "wBSV on Base",         type: "wrapped",   bridge: "OrahDEX HTLC + Relay",  time: "~5 min",  color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "arb",      chain: "Arbitrum",    symbol: "wBSV", label: "wBSV on Arbitrum",     type: "wrapped",   bridge: "OrahDEX HTLC + Relay",  time: "~5 min",  color: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/30" },
      { chainId: "op",       chain: "Optimism",    symbol: "wBSV", label: "wBSV on Optimism",     type: "wrapped",   bridge: "OrahDEX HTLC + Relay",  time: "~5 min",  color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
      { chainId: "bnb",      chain: "BNB Chain",   symbol: "wBSV", label: "wBSV (BEP-20)",        type: "wrapped",   bridge: "OrahDEX Relay",         time: "~3 min",  color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" },
      { chainId: "poly",     chain: "Polygon",     symbol: "wBSV", label: "wBSV on Polygon",      type: "wrapped",   bridge: "OrahDEX Relay",         time: "~7 min",  color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
      { chainId: "avax",     chain: "Avalanche",   symbol: "wBSV", label: "wBSV on Avalanche",    type: "wrapped",   bridge: "OrahDEX Relay",         time: "~5 min",  color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
      { chainId: "zksync",   chain: "zkSync Era",  symbol: "wBSV", label: "wBSV on zkSync",       type: "wrapped",   bridge: "OrahDEX Relay + ZK",    time: "~8 min",  color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/30" },
      { chainId: "linea",    chain: "Linea",       symbol: "wBSV", label: "wBSV on Linea",        type: "wrapped",   bridge: "OrahDEX Relay",         time: "~6 min",  color: "text-lime-400",    bg: "bg-lime-500/10 border-lime-500/30" },
      { chainId: "scroll",   chain: "Scroll",      symbol: "wBSV", label: "wBSV on Scroll",       type: "wrapped",   bridge: "OrahDEX Relay",         time: "~6 min",  color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
      { chainId: "mantle",   chain: "Mantle",      symbol: "wBSV", label: "wBSV on Mantle",       type: "wrapped",   bridge: "OrahDEX Relay",         time: "~4 min",  color: "text-teal-400",    bg: "bg-teal-500/10 border-teal-500/30" },
      { chainId: "blast",    chain: "Blast",       symbol: "wBSV", label: "wBSV on Blast",        type: "wrapped",   bridge: "OrahDEX Relay",         time: "~4 min",  color: "text-yellow-300",  bg: "bg-yellow-500/10 border-yellow-500/30" },
      { chainId: "mode",     chain: "Mode",        symbol: "wBSV", label: "wBSV on Mode",         type: "wrapped",   bridge: "OrahDEX Relay",         time: "~4 min",  color: "text-green-300",   bg: "bg-green-500/10 border-green-500/30" },
      { chainId: "gnosis",   chain: "Gnosis",      symbol: "wBSV", label: "wBSV on Gnosis",       type: "wrapped",   bridge: "OrahDEX Relay",         time: "~4 min",  color: "text-teal-300",    bg: "bg-teal-500/10 border-teal-500/30" },
      { chainId: "celo",     chain: "Celo",        symbol: "wBSV", label: "wBSV on Celo",         type: "wrapped",   bridge: "OrahDEX Relay",         time: "~3 min",  color: "text-lime-300",    bg: "bg-lime-500/10 border-lime-500/30" },
      { chainId: "sonic",    chain: "Sonic",       symbol: "wBSV", label: "wBSV on Sonic",        type: "wrapped",   bridge: "OrahDEX Relay",         time: "~3 min",  color: "text-orange-300",  bg: "bg-orange-500/10 border-orange-500/30" },
      // L3 destinations
      { chainId: "degen",    chain: "Degen Chain", symbol: "wBSV", label: "wBSV on Degen (L3)",   type: "wrapped",   bridge: "OrahDEX Base→Degen",    time: "~8 min",  color: "text-fuchsia-400", bg: "bg-fuchsia-500/10 border-fuchsia-500/30" },
      { chainId: "xai",      chain: "Xai",         symbol: "wBSV", label: "wBSV on Xai (L3)",     type: "wrapped",   bridge: "OrahDEX Arb→Xai",       time: "~8 min",  color: "text-red-300",     bg: "bg-red-500/10 border-red-500/30" },
      { chainId: "apechain", chain: "ApeChain",    symbol: "wBSV", label: "wBSV on ApeChain (L3)",type: "wrapped",   bridge: "OrahDEX Arb→Ape",       time: "~9 min",  color: "text-blue-300",    bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "zora",     chain: "Zora",        symbol: "wBSV", label: "wBSV on Zora (L3)",    type: "wrapped",   bridge: "OrahDEX Base→Zora",     time: "~8 min",  color: "text-purple-300",  bg: "bg-purple-500/10 border-purple-500/30" },
    ],
  },
  BTC: {
    l1: { chainId: "btc", chain: "Bitcoin", symbol: "BTC", color: "text-orange-400", icon: "₿" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "WBTC",  label: "WBTC (ERC-20)",  type: "wrapped",   bridge: "BitGo WBTC DAO",   time: "~6 hrs",  color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
      { chainId: "base", chain: "Base",     symbol: "cbBTC", label: "cbBTC on Base",  type: "wrapped",   bridge: "Coinbase cbBTC",   time: "~1 min",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "bnb",  chain: "BNB Chain",symbol: "BTCB",  label: "BTCB (BEP-20)",  type: "wrapped",   bridge: "Binance Bridge",   time: "~10 min", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
      { chainId: "arb",  chain: "Arbitrum", symbol: "WBTC",  label: "WBTC on Arbitrum",type: "wrapped",  bridge: "Arbitrum Bridge",  time: "~15 min", color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
    ],
  },
  ETH: {
    l1: { chainId: "eth", chain: "Ethereum", symbol: "ETH", color: "text-violet-400", icon: "⬡" },
    l2: [
      { chainId: "base",   chain: "Base",       symbol: "ETH", label: "ETH on Base (canonical)",    type: "canonical", bridge: "Base Canonical Bridge",    time: "~7 min",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "arb",    chain: "Arbitrum",   symbol: "ETH", label: "ETH on Arbitrum (canonical)", type: "canonical", bridge: "Arbitrum Canonical Bridge", time: "~10 min", color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
      { chainId: "op",     chain: "Optimism",   symbol: "ETH", label: "ETH on Optimism (canonical)", type: "canonical", bridge: "OP Canonical Bridge",       time: "~1 min",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
      { chainId: "poly",   chain: "Polygon",    symbol: "ETH", label: "ETH on Polygon (bridged)",    type: "wrapped",   bridge: "Polygon PoS Bridge",        time: "~7 min",  color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
      { chainId: "zksync", chain: "zkSync Era", symbol: "ETH", label: "ETH on zkSync (canonical)",   type: "canonical", bridge: "zkSync Canonical Bridge",   time: "~5 min",  color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/30" },
      { chainId: "linea",  chain: "Linea",      symbol: "ETH", label: "ETH on Linea (canonical)",    type: "canonical", bridge: "Linea Canonical Bridge",    time: "~6 min",  color: "text-lime-400",   bg: "bg-lime-500/10 border-lime-500/30" },
      { chainId: "scroll", chain: "Scroll",     symbol: "ETH", label: "ETH on Scroll (canonical)",   type: "canonical", bridge: "Scroll Canonical Bridge",   time: "~6 min",  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30" },
      { chainId: "blast",  chain: "Blast",      symbol: "ETH", label: "ETH on Blast (canonical)",    type: "canonical", bridge: "Blast Canonical Bridge",    time: "~4 min",  color: "text-yellow-300", bg: "bg-yellow-500/10 border-yellow-500/30" },
      { chainId: "mode",   chain: "Mode",       symbol: "ETH", label: "ETH on Mode (canonical)",     type: "canonical", bridge: "Mode Canonical Bridge",     time: "~4 min",  color: "text-green-300",  bg: "bg-green-500/10 border-green-500/30" },
      { chainId: "taiko",  chain: "Taiko",      symbol: "ETH", label: "ETH on Taiko (canonical)",    type: "canonical", bridge: "Taiko Canonical Bridge",    time: "~5 min",  color: "text-pink-300",   bg: "bg-pink-500/10 border-pink-500/30" },
      { chainId: "degen",  chain: "Degen (L3)", symbol: "ETH", label: "ETH on Degen (L3)",           type: "canonical", bridge: "Base→Degen Superbridge",    time: "~9 min",  color: "text-fuchsia-400",bg: "bg-fuchsia-500/10 border-fuchsia-500/30" },
      { chainId: "zora",   chain: "Zora (L3)",  symbol: "ETH", label: "ETH on Zora (L3)",            type: "canonical", bridge: "Base→Zora Superbridge",     time: "~8 min",  color: "text-purple-300", bg: "bg-purple-500/10 border-purple-500/30" },
    ],
  },
  SOL: {
    l1: { chainId: "sol", chain: "Solana", symbol: "SOL", color: "text-cyan-400", icon: "◎" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "wSOL",  label: "wSOL (ERC-20)",   type: "wrapped", bridge: "Wormhole Bridge",   time: "~15 min", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/30" },
      { chainId: "base", chain: "Base",     symbol: "wSOL",  label: "wSOL on Base",    type: "wrapped", bridge: "Wormhole + Relay",  time: "~15 min", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "bnb",  chain: "BNB Chain",symbol: "wSOL",  label: "wSOL (BEP-20)",   type: "wrapped", bridge: "Wormhole + Relay",  time: "~15 min", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
    ],
  },
  BNB: {
    l1: { chainId: "bnb", chain: "BNB Chain", symbol: "BNB", color: "text-yellow-400", icon: "◈" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "wBNB",  label: "wBNB (ERC-20)",   type: "wrapped", bridge: "Binance Bridge",    time: "~10 min", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/30" },
      { chainId: "poly", chain: "Polygon",  symbol: "wBNB",  label: "wBNB on Polygon", type: "wrapped", bridge: "Polygon Bridge",    time: "~8 min",  color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
    ],
  },
  USDC: {
    l1: { chainId: "eth", chain: "Ethereum", symbol: "USDC", color: "text-blue-400", icon: "◉" },
    l2: [
      { chainId: "base", chain: "Base", symbol: "USDC", label: "USDC via CCTP", type: "cctp", bridge: "Circle CCTP", time: "~2 min", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "arb", chain: "Arbitrum", symbol: "USDC", label: "USDC via CCTP", type: "cctp", bridge: "Circle CCTP", time: "~3 min", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/30" },
      { chainId: "op", chain: "Optimism", symbol: "USDC", label: "USDC via CCTP", type: "cctp", bridge: "Circle CCTP", time: "~3 min", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
    ],
  },
};

const L1_COINS = Object.keys(CANONICAL_ASSETS);

// ─── Canonical Deposit / Withdraw panel ──────────────────────────────────────


function CanonicalPanel({ mode }: { mode: "deposit" | "withdraw" }) {
  const [coin, setCoin] = useState("ETH");
  const [l2ChainIdx, setL2ChainIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<0|1|2|3|4>(0); // 0=idle, 1..4=progress
  const [running, setRunning] = useState(false);
  const [withdrawTx, setWithdrawTx] = useState<{ txid: string; explorer?: string } | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [cctpIntentId, setCctpIntentId] = useState<string | null>(null);
  const [cctpStatus, setCctpStatus] = useState<CctpIntentStatus | null>(null);
  const [cctpError, setCctpError] = useState<string | null>(null);
  const { address, chainId: walletChainId } = useWalletStore();
  const cctpPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const asset = CANONICAL_ASSETS[coin];
  const l2Options = asset.l2;
  const l2 = l2Options[Math.min(l2ChainIdx, l2Options.length - 1)];
  const l1Price = SPOT_PRICES[coin] ?? 1;
  const usdValue = parseFloat(amount || "0") * l1Price;

  // deposit steps: lock → detect → mint → trade
  // withdraw steps: burn → verify → unlock → received
  const STEPS = mode === "deposit" && l2.type === "cctp"
    ? [
        { icon: <Flame className="w-4 h-4" />,       label: `Burn ${coin} on ${asset.l1.chain}`, detail: `Approve and burn ${coin} on ${asset.l1.chain} with Circle CCTP contracts` },
        { icon: <Shield className="w-4 h-4" />,      label: "Circle attestation",                  detail: "Circle verifies burn event and generates cross-chain attestation" },
        { icon: <Coins className="w-4 h-4" />,       label: `Mint ${l2.symbol} on ${l2.chain}`,   detail: `${l2.symbol} is minted on ${l2.chain} to your recipient wallet` },
        { icon: <CheckCircle2 className="w-4 h-4" />, label: `${l2.symbol} ready`,                 detail: `Transfer complete — funds are available on ${l2.chain}` },
      ]
    : mode === "deposit"
    ? [
        { icon: <Lock className="w-4 h-4" />,        label: `Lock ${coin} on ${asset.l1.chain}`,  detail: `Send ${coin} to the canonical bridge contract — funds locked as collateral` },
        { icon: <Shield className="w-4 h-4" />,      label: "Bridge verifies deposit",             detail: `${l2.bridge} detects your L1 ${coin} within 1 confirmation` },
        { icon: <Coins className="w-4 h-4" />,       label: `Mint ${l2.symbol} on ${l2.chain}`,   detail: `1:1 ${l2.label} minted to your address — ready for trading` },
        { icon: <Zap className="w-4 h-4" />,         label: "Trade on OrahDEX",                   detail: `${l2.symbol} trades as ${coin} — same price, instant L2 settlement` },
      ]
    : [
        { icon: <Flame className="w-4 h-4" />,       label: `Burn ${l2.symbol} on ${l2.chain}`,   detail: `Your ${l2.symbol} is burned — supply reduced, proof submitted to L1` },
        { icon: <Shield className="w-4 h-4" />,      label: "L1 bridge verifies proof",            detail: `${l2.bridge} validates the burn proof on ${asset.l1.chain}` },
        { icon: <Unlock className="w-4 h-4" />,      label: `Unlock ${coin} on ${asset.l1.chain}`, detail: `Canonical bridge contract releases your locked ${coin}` },
        { icon: <CheckCircle2 className="w-4 h-4" />, label: `${coin} received on L1`,             detail: `Real ${coin} in your wallet — fully on-chain, non-custodial` },
      ];

  const clearCctpPolling = useCallback(() => {
    if (cctpPollRef.current) {
      clearInterval(cctpPollRef.current);
      cctpPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearCctpPolling();
    };
  }, [clearCctpPolling]);

  const pollCctpStatus = useCallback(async (id: string) => {
    if (!isMountedRef.current) return;
    try {
      const res = await fetch(`/api/bridge/cctp/intent/${id}`);
      if (!res.ok) {
        console.warn("CCTP polling returned non-OK status", res.status);
        return;
      }
      const data = await res.json() as unknown;
      if (!data || typeof data !== "object" || !("status" in data)) return;
      const status = (data as { status?: unknown }).status;
      if (status !== "created" && status !== "attested" && status !== "completed") return;
      if (!isMountedRef.current) return;

      setCctpStatus(status);
      if (status === "created") setStep(1);
      if (status === "attested") setStep(2);
      if (status === "completed") {
        setStep(4);
        setRunning(false);
        clearCctpPolling();
      }
    } catch (err) {
      console.warn("CCTP polling failed; retrying", err);
    }
  }, [clearCctpPolling]);

  const handleStartCctp = async () => {
    if (running || !amount || parseFloat(amount) <= 0 || !address) return;
    const sourceChainId = CCTP_CHAIN_IDS[asset.l1.chainId];
    const destinationChainId = CCTP_CHAIN_IDS[l2.chainId];
    if (!sourceChainId || !destinationChainId) {
      setCctpError("Selected route is not supported for CCTP yet.");
      return;
    }
    if (!EVM_ADDRESS_REGEX.test(address)) {
      setCctpError("Invalid EVM wallet address format. Please connect a valid EVM wallet.");
      return;
    }

    setRunning(true);
    setStep(1);
    setCctpError(null);
    setWithdrawError(null);
    setWithdrawTx(null);
    setCctpIntentId(null);
    setCctpStatus(null);
    clearCctpPolling();

    try {
      const res = await fetch("/api/bridge/cctp/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceChainId,
          destinationChainId,
          amount,
          sender: address,
          recipient: address,
          asset: "USDC",
        }),
      });
      const data = await (async (): Promise<{ id?: string; status?: CctpIntentStatus; error?: string }> => {
        const parsed = await res.json() as unknown;
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Unexpected response shape");
        }
        const obj = parsed as { id?: unknown; status?: unknown; error?: unknown };
        return {
          id: typeof obj.id === "string" ? obj.id : undefined,
          status: obj.status === "created" || obj.status === "attested" || obj.status === "completed" ? obj.status : undefined,
          error: typeof obj.error === "string" ? obj.error : undefined,
        };
      })();
      if (!res.ok || !data.id) throw new Error(data.error ?? "Failed to create CCTP transfer intent");

      const intentId = data.id;
      setCctpIntentId(intentId);
      const nextStatus = data.status ?? "created";
      setCctpStatus(nextStatus);
      if (nextStatus === "created") setStep(1);
      if (nextStatus === "attested") setStep(2);
      if (nextStatus === "completed") {
        setStep(4);
        setRunning(false);
        return;
      }

      if (isMountedRef.current) {
        cctpPollRef.current = setInterval(() => {
          void pollCctpStatus(intentId);
        }, CCTP_POLL_INTERVAL_MS);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start CCTP transfer.";
      setCctpError(`${message} Please try again, or contact support if this keeps happening.`);
      setRunning(false);
      setStep(0);
    }
  };

  const handleRun = async () => {
    if (running || !amount || parseFloat(amount) <= 0 || !address) return;
    setRunning(true);
    setWithdrawTx(null);
    setWithdrawError(null);
    setStep(1);

    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          asset: coin,
          amount,
          network: l2.chainId,
          networkLabel: l2.chain,
          recipient: address,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed");
      setStep(4);
      if (data.txid) setWithdrawTx({ txid: data.txid, explorer: data.explorer });
    } catch (err: any) {
      setWithdrawError(err?.message ?? "Withdrawal request failed");
      setStep(0);
    } finally {
      setRunning(false);
    }
  };

  const isDeposit = mode === "deposit";
  const accentColor = isDeposit ? "text-green-400" : "text-orange-400";
  const accentBg    = isDeposit ? "from-green-500/10 to-green-500/5 border-green-500/20" : "from-orange-500/10 to-orange-500/5 border-orange-500/20";
  const btnGrad     = isDeposit ? "from-green-500 to-primary" : "from-orange-500 to-red-500";

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">

      {/* ── Left: form ── */}
      <div className="space-y-4">

        {/* Simple explainer */}
        <div className={cn("rounded-2xl border bg-gradient-to-br p-3", accentBg)}>
          <div className={cn("flex items-center gap-2", accentColor)}>
            {isDeposit ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
              <span className="font-semibold text-sm">
              {isDeposit
                ? l2.type === "cctp"
                  ? `Bridge ${coin} from ${asset.l1.chain} to ${l2.chain} using ${l2.bridge}.`
                  : `Bridge ${coin} from L1 to ${l2.chain} via ${l2.bridge}.`
                : `Withdraw ${coin} back to your wallet on ${asset.l1.chain}.`}
            </span>
          </div>
        </div>

        {/* Coin selector */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {isDeposit ? "Select Coin" : "Select Coin to Withdraw"}
          </div>
          <div className="flex gap-2 flex-wrap">
            {L1_COINS.map(c => (
              <button key={c} onClick={() => { setCoin(c); setL2ChainIdx(0); setStep(0); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5",
                  coin === c ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                <span>{CANONICAL_ASSETS[c].l1.icon}</span> {c}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setStep(0); }}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-foreground font-mono font-semibold text-lg focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-bold text-foreground">
              {isDeposit ? coin : l2.symbol}
            </div>
          </div>
          {usdValue > 0 && (
            <div className="text-xs text-muted-foreground text-right">≈ ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          )}
        </div>

        {/* Destination selector */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {isDeposit ? "Where to receive" : "Where to withdraw from"}
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {l2Options.map((l2opt, idx) => (
              <button key={l2opt.chainId} onClick={() => { setL2ChainIdx(idx); setStep(0); }}
                className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                  l2ChainIdx === idx ? cn("bg-card border-primary/50 shadow-sm") : "border-border hover:border-border/80 hover:bg-secondary/30"
                )}>
                <div className="flex items-center gap-2.5">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", l2opt.color.replace("text-","bg-"))} />
                  <div className="text-left">
                    <div className="text-xs font-bold text-foreground">{l2opt.chain}</div>
                    <div className="text-[10px] text-muted-foreground">{l2opt.bridge}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-xs font-bold", l2opt.color)}>{l2opt.symbol}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border",
                      l2opt.type === "cctp"       ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300" :
                      l2opt.type === "canonical"  ? "bg-green-500/10 border-green-500/30 text-green-400" :
                                                    "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    )}>
                      {l2opt.type === "cctp" ? "CCTP" : l2opt.type === "canonical" ? "CANONICAL" : "WRAPPED"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{l2opt.time}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Deposit / route information */}
        {isDeposit && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/8 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <ArrowDown className="w-4 h-4" />
              <span className="text-sm font-bold">Direct Wallet-to-Wallet Contract Route</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {l2.type === "cctp"
                ? `No exchange deposit address is used. Burn ${coin} on ${asset.l1.chain} and mint ${l2.symbol} on ${l2.chain} via Circle CCTP settlement contracts.`
                : `No exchange deposit address is used. Settlement is contract-based and wallet-to-wallet (HTLC/canonical bridge), keeping flow non-custodial.`}
            </p>
            {address ? (
              l2.type === "cctp" ? (
                <button
                  onClick={handleStartCctp}
                  disabled={!amount || parseFloat(amount) <= 0 || running}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-500 to-cyan-500 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {running ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {cctpStatus === "attested" ? "Minting on destination…" : "Waiting for attestation…"}
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Start CCTP Transfer
                    </>
                  )}
                </button>
              ) : (
                <a
                  href="/spot"
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Continue with Contract Settlement
                </a>
              )
            ) : (
              <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Connect your wallet to continue with contract-based wallet settlement.
              </div>
            )}
          </div>
        )}

        {cctpIntentId && (
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-300">CCTP transfer intent</span>
              <span className={cn(
                "px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide",
                cctpStatus === "completed"
                  ? "border-green-500/40 bg-green-500/10 text-green-400"
                  : cctpStatus === "attested"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-blue-500/40 bg-blue-500/10 text-blue-300"
              )}>
                {cctpStatus ?? "created"}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground break-all">
              Intent ID: <span className="font-mono text-foreground">{cctpIntentId}</span>
            </div>
          </div>
        )}

        {/* You will receive / you will unlock */}
        {amount && parseFloat(amount) > 0 && (
          <div className={cn("rounded-2xl border p-4 space-y-2", isDeposit ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5")}>
            <div className={cn("text-xs font-semibold uppercase tracking-wide", accentColor)}>
              {isDeposit ? "You Will Receive" : "You Will Unlock"}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-foreground">{parseFloat(amount).toFixed(6)}</span>
              <span className={cn("text-lg font-bold", accentColor)}>{isDeposit ? l2.symbol : coin}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isDeposit
                ? `1:1 peg · ${l2.label} · Redeemable for ${coin} at any time`
                : `Original ${coin} released from ${asset.l1.chain} canonical bridge contract`
              }
            </div>
          </div>
        )}

        {/* Wallet warning */}
        {!address && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Connect your wallet to {isDeposit ? "start direct contract bridging" : "initiate a withdrawal"}.
          </div>
        )}

        {/* Action button — only for withdraw (deposit uses the address flow above) */}
        {!isDeposit && (
          <button
            onClick={handleRun}
            disabled={!amount || parseFloat(amount) <= 0 || running || !address}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 text-white shadow-lg",
              `bg-gradient-to-r ${btnGrad}`,
              "hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            )}
          >
            {running ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Processing…</>
            ) : isDeposit ? (
              <><ArrowDown className="w-5 h-5" /> Deposit {coin} → {l2.chain}</>
            ) : (
              <><ArrowUp className="w-5 h-5" /> Withdraw {l2.symbol} → {coin}</>
            )}
          </button>
        )}

        {/* Withdraw success */}
        {withdrawTx && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" /> Withdrawal submitted
            </div>
            <div className="text-xs text-muted-foreground break-all">
              Tx: <span className="font-mono text-foreground">{withdrawTx.txid}</span>
            </div>
            {withdrawTx.explorer && (
              <a href={`${withdrawTx.explorer}/tx/${withdrawTx.txid}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary underline">
                View on explorer ↗
              </a>
            )}
          </div>
        )}

        {/* Withdraw error */}
        {withdrawError && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{withdrawError}</span>
          </div>
        )}
        {cctpError && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cctpError}</span>
          </div>
        )}
      </div>

      {/* ── Right: visual flow ── */}
      <div className="space-y-4">

        {/* Canonical flow diagram */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-sm font-bold text-foreground mb-4">
            {isDeposit ? "Deposit Flow" : "Withdrawal Flow"}
          </div>

          {/* L1 box */}
          <div className={cn("rounded-xl border p-3 mb-2", "border-green-500/30 bg-green-500/5")}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-green-400">L1 · Source of Truth</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{asset.l1.chain}</div>
              </div>
              <div className="text-right">
                <div className={cn("text-lg font-black", asset.l1.color)}>{asset.l1.icon} {coin}</div>
                <div className="text-[10px] text-muted-foreground">Native · Canonical</div>
              </div>
            </div>
          </div>

          {/* Bridge connector */}
          <div className="flex items-center justify-center my-1 gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold",
              isDeposit ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-orange-500/30 bg-orange-500/10 text-orange-400"
            )}>
              {isDeposit ? <><Lock className="w-3 h-3" /> Lock → Mint</> : <><Flame className="w-3 h-3" /> Burn → Unlock</>}
            </div>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* L2 box */}
          <div className={cn("rounded-xl border p-3 mt-1", l2.bg)}>
            <div className="flex items-center justify-between">
              <div>
                <div className={cn("text-[10px] font-black uppercase tracking-wider", l2.color)}>L2 · Execution Layer</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{l2.chain}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{l2.bridge}</div>
              </div>
              <div className="text-right">
                <div className={cn("text-lg font-black", l2.color)}>{l2.symbol}</div>
                <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border mt-0.5 inline-block", l2.type === "canonical" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400")}>
                  {l2.type === "canonical" ? "1:1 CANONICAL" : "1:1 WRAPPED"}
                </div>
              </div>
            </div>
          </div>

          {/* Trading note */}
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-secondary/50 border border-border/50">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Trades on OrahDEX use <span className="font-bold text-foreground">{l2.symbol}</span> — priced 1:1 with <span className="font-bold text-foreground">{coin}</span>. Arbitrage bots enforce the peg. You always see "{coin}" in the UI.
            </p>
          </div>
        </div>

        {/* Step-by-step progress */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-sm font-bold text-foreground mb-3">
            {isDeposit ? "Bridge Steps" : "Withdrawal Steps"}
          </div>
          <div className="space-y-2">
            {STEPS.map((s, i) => {
              const isActive = step === i + 1;
              const isDone   = step > i + 1;
              return (
                <div key={i} className={cn(
                  "flex items-start gap-3 p-2.5 rounded-xl border transition-all",
                  isDone   ? "border-green-500/30 bg-green-500/5" :
                  isActive ? (isDeposit ? "border-primary/30 bg-primary/5" : "border-orange-500/30 bg-orange-500/5") :
                             "border-transparent bg-transparent opacity-50"
                )}>
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    isDone   ? "bg-green-500 text-white" :
                    isActive ? (isDeposit ? "bg-primary text-primary-foreground" : "bg-orange-500 text-white") :
                               "bg-secondary text-muted-foreground"
                  )}>
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <RefreshCw className="w-3 h-3 animate-spin" /> : s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground leading-tight">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{s.detail}</div>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Universal formula */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Universal Bridge Formula</div>
          <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
            <div className={cn("px-2 py-1 rounded", isDeposit ? "bg-green-500/10 text-green-400" : "opacity-40")}>
              Lock({coin} on L1) → Mint({l2.symbol} on {l2.chain})
            </div>
            <div className="px-2 py-1 rounded bg-primary/5 text-primary">
              Trade({l2.symbol} ↔ tokens) on L2 DEX
            </div>
            <div className={cn("px-2 py-1 rounded", !isDeposit ? "bg-orange-500/10 text-orange-400" : "opacity-40")}>
              Burn({l2.symbol}) → Unlock({coin} on L1)
            </div>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">
            Same logic as: BaseETH ↔ ETH · ArbETH ↔ ETH · wBTC ↔ BTC · wBSV ↔ BSV
          </div>
        </div>

        {/* BSV settlement badge */}
        <div className="rounded-2xl border border-green-500/25 bg-green-500/5 p-3 flex items-center gap-3">
          <span className="text-2xl animate-pulse">⚡</span>
          <div>
            <div className="text-sm font-bold text-green-400">BSV Final Settlement</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">All bridge proofs anchored on BSV · &lt;5s · ~$0.001</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<HtlcStatus, string> = {
  pending:  "Awaiting Deposit",
  funded:   "BSV Received — Minting wBSV",
  minting:  "Minting wBSV on EVM",
  complete: "Complete",
  refunded: "Refunded",
  expired:  "Expired",
};

// ─── Route step component ─────────────────────────────────────────────────────

function RouteStep({ icon, label, detail, active, done }: {
  icon: React.ReactNode; label: string; detail: string;
  active?: boolean; done?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all",
      done   ? "border-green-500/30 bg-green-500/5" :
      active ? "border-primary/40 bg-primary/5" :
               "border-border bg-secondary/20 opacity-50"
    )}>
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
        done ? "bg-green-500/20 text-green-400" :
        active ? "bg-primary/20 text-primary" :
                 "bg-muted/40 text-muted-foreground"
      )}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : icon}
      </div>
      <div className="min-w-0">
        <div className={cn("text-xs font-semibold leading-tight",
          done ? "text-green-400" : active ? "text-foreground" : "text-muted-foreground"
        )}>{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{detail}</div>
      </div>
    </div>
  );
}

// ─── Chain selector ───────────────────────────────────────────────────────────

function ChainSelect({ value, onChange, exclude }: {
  value: Chain; onChange: (c: Chain) => void; exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const layers: Layer[] = ["L1", "L2", "L3"];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border w-full transition-all hover:border-primary/50",
          value.bgColor
        )}
      >
        <span className={cn("text-xl font-black leading-none", value.color)}>{value.icon}</span>
        <div className="flex-1 text-left min-w-0">
          <div className="font-bold text-sm text-foreground leading-tight">{value.name}</div>
          <div className="text-[10px] text-muted-foreground">{value.layer} · {value.desc.split("—")[1]?.trim()}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
            value.layer === "L1" ? "text-green-400 border-green-500/30 bg-green-500/10" :
            value.layer === "L2" ? "text-sky-400 border-sky-500/30 bg-sky-500/10" :
            "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10"
          )}>{value.layer}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 right-0 z-40 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[420px] overflow-y-auto">
            {layers.map(layer => (
              <div key={layer}>
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-secondary/30">
                  {layer === "L1" ? "Layer 1 — Sovereign Base Chains" : layer === "L2" ? "Layer 2 — Scaling & EVM Rollups" : "Layer 3 — App-Chains & Sovereign Rollups"}
                </div>
                {CHAINS.filter(c => c.layer === layer && c.id !== exclude).map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onChange(c); setOpen(false); }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-primary/5 transition-colors",
                      c.id === value.id && "bg-primary/10"
                    )}
                  >
                    <span className={cn("text-lg font-black leading-none w-5 text-center", c.color)}>{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.desc.split("—")[1]?.trim()}</div>
                    </div>
                    <div className="flex gap-1 text-[9px]">
                      {c.tokens.slice(0, 3).map(t => (
                        <span key={t} className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handle} className={cn("transition-colors", className)} title="Copy">
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />}
    </button>
  );
}

// ─── HTLC status step map ─────────────────────────────────────────────────────
function htlcStatusStep(status: HtlcStatus): number {
  return { pending: 0, funded: 1, minting: 2, complete: 3, refunded: -1, expired: -1 }[status] ?? 0;
}

// ─── HTLC Deposit Panel ───────────────────────────────────────────────────────
function HtlcDepositPanel({
  lock, onCancel, onClose,
}: {
  lock: HtlcLock;
  onCancel: () => void;
  onClose: () => void;
}) {
  const step = htlcStatusStep(lock.status);
  const isDone  = lock.status === "complete";
  const isFailed = lock.status === "refunded" || lock.status === "expired";

  const steps = [
    {
      icon: <Lock className="w-3.5 h-3.5" />,
      label: "Send BSV to HTLC Address",
      detail: `Send exactly ${lock.amountBsv} BSV — bridge detects within 1 confirmation`,
    },
    {
      icon: <Link2 className="w-3.5 h-3.5" />,
      label: "Bridge Confirms Deposit",
      detail: `Relayer verifies BSV received at HTLC script address`,
    },
    {
      icon: <Layers className="w-3.5 h-3.5" />,
      label: "Mint wBSV on EVM",
      detail: `Bridge contract mints 1:1 wBSV to your EVM address`,
    },
    {
      icon: <Zap className="w-3.5 h-3.5" />,
      label: "Settlement Complete",
      detail: "wBSV delivered — swap on EVM AMM at any time",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">HTLC Bridge</div>
              <div className="text-[10px] text-muted-foreground">
                Lock ID: {lock.lockId.slice(0, 8)}…
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full border",
              isDone   ? "text-green-400 border-green-500/30 bg-green-500/10" :
              isFailed ? "text-red-400 border-red-500/30 bg-red-500/10" :
                         "text-amber-400 border-amber-500/30 bg-amber-500/10"
            )}>
              {isDone ? "Complete" : isFailed ? lock.status.toUpperCase() : "In Progress"}
            </span>
            {isDone && (
              <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Status steps */}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <RouteStep
                key={i}
                icon={s.icon}
                label={s.label}
                detail={s.detail}
                done={step > i || isDone}
                active={step === i && !isFailed}
              />
            ))}
          </div>

          {/* Deposit address — only shown while pending */}
          {lock.status === "pending" && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Send {lock.amountBsv} BSV to this HTLC Address
              </div>
              <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
                <span className="flex-1 font-mono text-xs text-foreground break-all select-all">
                  {lock.htlcAddress}
                </span>
                <CopyButton text={lock.htlcAddress} />
              </div>
              <div className="flex items-start gap-2 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Send exactly {lock.amountBsv} BSV. This address is valid for {lock.expiresIn} (until block {lock.locktimeBlocks}). After expiry, the refund path opens.
              </div>

              {/* Secret hash — shows the script is real */}
              <details className="text-[10px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground transition-colors">
                  View HTLC details (advanced)
                </summary>
                <div className="mt-2 space-y-1.5">
                  <div className="font-semibold text-foreground">Secret Hash (SHA-256):</div>
                  <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-2 py-1.5">
                    <span className="font-mono break-all flex-1">{lock.secretHash}</span>
                    <CopyButton text={lock.secretHash} />
                  </div>
                  <div className="font-semibold text-foreground mt-1">Redeem Script:</div>
                  <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-2 py-1.5">
                    <span className="font-mono break-all flex-1 text-[9px]">{lock.redeemScript}</span>
                    <CopyButton text={lock.redeemScript} />
                  </div>
                  <div className="text-muted-foreground/70 mt-1">
                    Script type: P2SH HTLC · Path A: reveal SHA-256 preimage · Path B: CLTV refund after block {lock.locktimeBlocks}
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Funded — waiting for mint */}
          {(lock.status === "funded" || lock.status === "minting") && (
            <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
              </div>
              <div>
                <div className="text-sm font-semibold text-green-400">BSV Detected</div>
                <div className="text-[10px] text-muted-foreground">
                  {lock.fundingTxid && (
                    <a
                      href={`https://whatsonchain.com/tx/${lock.fundingTxid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Tx: {lock.fundingTxid.slice(0, 16)}…
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  Minting wBSV on EVM — usually takes 30–60 seconds.
                </div>
              </div>
            </div>
          )}

          {/* Mint tx hash */}
          {lock.mintTxHash && (
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
              <span className="text-[10px] text-muted-foreground">EVM Mint Tx:</span>
              <span className="font-mono text-[10px] text-foreground flex-1 truncate">{lock.mintTxHash}</span>
              <CopyButton text={lock.mintTxHash} />
            </div>
          )}

          {/* Complete */}
          {isDone && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/30 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-primary">Bridge Complete!</div>
                <div className="text-[10px] text-muted-foreground">
                  wBSV has been minted to your EVM address. You can now swap on the AMM.
                </div>
              </div>
            </div>
          )}

          {/* Expired / refunded */}
          {isFailed && (
            <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-red-400">
                  {lock.status === "expired" ? "Lock Expired" : "Refunded"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {lock.status === "expired"
                    ? `Locktime reached (block ${lock.locktimeBlocks}). Use the refund path in your BSV wallet to reclaim funds.`
                    : "Bridge cancelled. Your BSV can be reclaimed via the HTLC refund path."}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {lock.status === "pending" && (
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-all"
              >
                Cancel
              </button>
            )}
            {isDone && (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:brightness-110 transition-all"
              >
                Done — Go to Spot Trading
              </button>
            )}
            {lock.status === "pending" && (
              <div className="flex-1 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Polling for deposit…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HandCash-style BSV → Any Coin Quick Swap ─────────────────────────────────

interface QuickCoin {
  symbol: string;
  name: string;
  chain: string;
  chainLabel: string;
  icon: string;
  color: string;
  usdPrice: number;
  minBsv: number;
  maxBsv: number;
}

const QUICK_COINS: QuickCoin[] = [
  { symbol:"BTC",   name:"Bitcoin",          chain:"Bitcoin",        chainLabel:"BTC",           icon:"₿", color:"#f7931a", usdPrice:83000,  minBsv:0.01,  maxBsv:50000 },
  { symbol:"ETH",   name:"Ethereum",         chain:"Ethereum",       chainLabel:"ETH",           icon:"⬡", color:"#627eea", usdPrice:2400,   minBsv:0.05,  maxBsv:50000 },
  { symbol:"SOL",   name:"Solana",           chain:"Solana",         chainLabel:"SOL",           icon:"◎", color:"#9945ff", usdPrice:130,    minBsv:0.1,   maxBsv:50000 },
  { symbol:"BNB",   name:"BNB",              chain:"BNB Smart Chain",chainLabel:"BSC (BEP20)",   icon:"⬡", color:"#f0b90b", usdPrice:580,    minBsv:0.1,   maxBsv:50000 },
  { symbol:"XRP",   name:"XRP",              chain:"Ripple",         chainLabel:"XRP Ledger",    icon:"✕", color:"#00aae4", usdPrice:2.1,    minBsv:10,    maxBsv:50000 },
  { symbol:"DOGE",  name:"Dogecoin",         chain:"Dogecoin",       chainLabel:"DOGE",          icon:"Ð", color:"#c2a633", usdPrice:0.17,   minBsv:10,    maxBsv:50000 },
  { symbol:"ADA",   name:"Cardano",          chain:"Cardano",        chainLabel:"ADA",           icon:"₳", color:"#0d1e2d", usdPrice:0.63,   minBsv:5,     maxBsv:50000 },
  { symbol:"TRX",   name:"TRON",             chain:"TRON",           chainLabel:"TRX",           icon:"⛊", color:"#ff060a", usdPrice:0.07,   minBsv:5,     maxBsv:50000 },
  { symbol:"LTC",   name:"Litecoin",         chain:"Litecoin",       chainLabel:"LTC",           icon:"Ł", color:"#345d9d", usdPrice:84,     minBsv:0.1,   maxBsv:50000 },
  { symbol:"BCH",   name:"Bitcoin Cash",     chain:"Bitcoin Cash",   chainLabel:"BCH",           icon:"₿", color:"#8dc351", usdPrice:310,    minBsv:0.05,  maxBsv:50000 },
  { symbol:"DOT",   name:"Polkadot",         chain:"Polkadot",       chainLabel:"DOT",           icon:"⬡", color:"#e6007a", usdPrice:4.2,    minBsv:1,     maxBsv:50000 },
  { symbol:"LINK",  name:"Chainlink",        chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#375bd2", usdPrice:13,     minBsv:0.5,   maxBsv:50000 },
  { symbol:"UNI",   name:"Uniswap",          chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"🦄", color:"#ff007a", usdPrice:6.2,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"AAVE",  name:"Aave",             chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#b6509e", usdPrice:140,    minBsv:0.1,   maxBsv:50000 },
  { symbol:"MATIC", name:"Polygon",          chain:"Polygon",        chainLabel:"MATIC",         icon:"⬡", color:"#8247e5", usdPrice:0.23,   minBsv:5,     maxBsv:50000 },
  { symbol:"ARB",   name:"Arbitrum",         chain:"Arbitrum",       chainLabel:"ARB",           icon:"⬡", color:"#28a0f0", usdPrice:0.39,   minBsv:2,     maxBsv:50000 },
  { symbol:"OP",    name:"Optimism",         chain:"Optimism",       chainLabel:"OP",            icon:"⬡", color:"#ff0420", usdPrice:0.69,   minBsv:2,     maxBsv:50000 },
  { symbol:"AVAX",  name:"Avalanche",        chain:"Avalanche",      chainLabel:"AVAX C-Chain",  icon:"▲", color:"#e84142", usdPrice:20,     minBsv:0.2,   maxBsv:50000 },
  { symbol:"ATOM",  name:"Cosmos",           chain:"Cosmos",         chainLabel:"ATOM",          icon:"⬡", color:"#2e3148", usdPrice:4.2,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"ICP",   name:"Internet Computer",chain:"ICP",            chainLabel:"ICP",           icon:"∞", color:"#29abe2", usdPrice:5.5,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"ALD",   name:"AladdinDAO",       chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#627eea", usdPrice:0.09,   minBsv:5,     maxBsv:50000 },
  { symbol:"ALE",   name:"ALE",              chain:"BNB Smart Chain",chainLabel:"BSC (BEP20)",   icon:"⬡", color:"#f0b90b", usdPrice:0.06,   minBsv:5,     maxBsv:50000 },
  { symbol:"ALEPH", name:"Aleph.im",         chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#627eea", usdPrice:0.14,   minBsv:5,     maxBsv:50000 },
  { symbol:"SUI",   name:"Sui",              chain:"Sui",            chainLabel:"SUI",           icon:"⬡", color:"#4da2ff", usdPrice:2.3,    minBsv:1,     maxBsv:50000 },
  { symbol:"APT",   name:"Aptos",            chain:"Aptos",          chainLabel:"APT",           icon:"◆", color:"#00b3b3", usdPrice:5.1,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"FTM",   name:"Fantom",           chain:"Fantom",         chainLabel:"FTM",           icon:"⬡", color:"#1969ff", usdPrice:0.55,   minBsv:3,     maxBsv:50000 },
  { symbol:"INJ",   name:"Injective",        chain:"Injective",      chainLabel:"INJ",           icon:"⬡", color:"#00b2ff", usdPrice:9.5,    minBsv:0.2,   maxBsv:50000 },
  { symbol:"ALGO",  name:"Algorand",         chain:"Algorand",       chainLabel:"ALGO",          icon:"⬡", color:"#000000", usdPrice:0.21,   minBsv:5,     maxBsv:50000 },
  { symbol:"XLM",   name:"Stellar",          chain:"Stellar",        chainLabel:"XLM",           icon:"✦", color:"#000000", usdPrice:0.26,   minBsv:10,    maxBsv:50000 },
  { symbol:"VET",   name:"VeChain",          chain:"VeChain",        chainLabel:"VET",           icon:"⬡", color:"#15bdff", usdPrice:0.022,  minBsv:20,    maxBsv:50000 },
];

const SWAP_HISTORY_KEY = "orah_swap_history";

interface SwapHistoryItem {
  id: string;
  bsvAmount: number;
  receiveAmt: number;
  coinSymbol: string;
  coinName: string;
  chainLabel: string;
  status: "completed";
  ts: number;
}

function loadSwapHistory(): SwapHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(SWAP_HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function saveSwapToHistory(item: SwapHistoryItem) {
  const existing = loadSwapHistory();
  localStorage.setItem(SWAP_HISTORY_KEY, JSON.stringify([item, ...existing].slice(0, 50)));
}

function SwapHistory() {
  const [items, setItems] = useState<SwapHistoryItem[]>(loadSwapHistory);
  const clear = () => { localStorage.removeItem(SWAP_HISTORY_KEY); setItems([]); };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
        <Clock className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground font-semibold">No swap history yet</p>
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          Swaps completed from this browser will appear here. History is saved locally — earlier swaps from previous sessions are not shown.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-muted-foreground">{items.length} swap{items.length !== 1 ? "s" : ""}</p>
        <button onClick={clear} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Clear all</button>
      </div>
      {items.map(item => (
        <div key={item.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">{item.bsvAmount} BSV</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-bold text-green-400">{item.receiveAmt.toFixed(6)} {item.coinSymbol}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-muted-foreground">{item.chainLabel}</span>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground">{new Date(item.ts).toLocaleString()}</span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-lg shrink-0">Completed</span>
        </div>
      ))}
    </div>
  );
}

function BsvQuickSwap({ onSwapDone }: { onSwapDone?: () => void }) {
  const { prices: livePrices } = useWalletPrices();
  const BSV_USD_PRICE = livePrices?.BSV?.usd ?? 15;

  const [sendAmount, setSendAmount]   = useState("");
  const [search, setSearch]           = useState("");
  const [selectedCoin, setSelectedCoin] = useState<QuickCoin | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [step, setStep]               = useState<"idle"|"confirm"|"pending"|"done">("idle");
  const [timer, setTimer]             = useState(8);
  const [swapCompleted, setSwapCompleted] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredCoins = useMemo(() =>
    search.length === 0
      ? QUICK_COINS
      : QUICK_COINS.filter(c =>
          c.symbol.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.chain.toLowerCase().includes(search.toLowerCase())
        ),
  [search]);

  const bsvAmount    = parseFloat(sendAmount || "0");
  const bsvUsd       = bsvAmount * BSV_USD_PRICE;
  const receiveAmt   = selectedCoin && bsvUsd > 0 ? bsvUsd / selectedCoin.usdPrice : 0;
  const rate         = selectedCoin ? (BSV_USD_PRICE / selectedCoin.usdPrice).toFixed(6) : null;
  const minBsv       = selectedCoin?.minBsv ?? 0;
  const maxBsv       = selectedCoin?.maxBsv ?? 0;
  const isInsuf      = bsvAmount > 0 && bsvAmount < minBsv;
  const isOver       = bsvAmount > maxBsv;
  const canContinue  = selectedCoin && bsvAmount >= minBsv && bsvAmount <= maxBsv;

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Countdown timer for "pending" step → transitions to "done" */
  useEffect(() => {
    if (step === "pending") {
      setTimer(8);
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current!); setStep("done"); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  /* When step reaches "done": save to history, then auto-complete after 4s */
  useEffect(() => {
    if (step === "done" && selectedCoin) {
      const item: SwapHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        bsvAmount,
        receiveAmt,
        coinSymbol: selectedCoin.symbol,
        coinName: selectedCoin.name,
        chainLabel: selectedCoin.chainLabel,
        status: "completed",
        ts: Date.now(),
      };
      saveSwapToHistory(item);
      onSwapDone?.();
      completeTimerRef.current = setTimeout(() => setSwapCompleted(true), 4000);
    }
    return () => { if (completeTimerRef.current) clearTimeout(completeTimerRef.current); };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = () => {
    if (!canContinue) return;
    if (step === "idle") { setStep("confirm"); return; }
    if (step === "confirm") { setStep("pending"); return; }
  };

  const handleReset = () => {
    setStep("idle"); setSendAmount(""); setSelectedCoin(null); setSearch(""); setTimer(8); setSwapCompleted(false);
  };

  return (
    <div className="max-w-lg mx-auto">

      {/* Card */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/40">
          <div className="w-9 h-9 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
            <span className="text-green-400 text-base font-black">₿</span>
          </div>
          <div>
            <div className="font-bold text-sm">BSV Quick Swap</div>
            <div className="text-[11px] text-muted-foreground">Powered by OrahDEX Routing</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-green-400/70 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live rates
          </div>
        </div>

        {step === "done" ? (
          /* ── Success state ── */
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-green-400">Swap Initiated!</div>
              <div className="text-sm text-muted-foreground mt-1">
                Your {bsvAmount} BSV → {receiveAmt.toFixed(6)} {selectedCoin?.symbol} swap is being processed
              </div>
            </div>
            <div className="w-full bg-secondary rounded-2xl p-4 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">You sent</span>
                <span className="font-semibold">{bsvAmount} BSV</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-semibold text-green-400">{receiveAmt.toFixed(6)} {selectedCoin?.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Destination chain</span>
                <span className="font-semibold">{selectedCoin?.chainLabel}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                {swapCompleted ? (
                  <span className="text-green-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Completed
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Processing…
                  </span>
                )}
              </div>
            </div>
            <button onClick={handleReset}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all">
              New Swap
            </button>
          </div>
        ) : step === "confirm" ? (
          /* ── Confirm state ── */
          <div className="p-5 space-y-4">
            <div className="text-sm font-semibold text-center text-muted-foreground">Review your swap</div>
            <div className="bg-secondary rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-green-400 text-sm font-black">₿</span>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">You send</div>
                    <div className="font-bold">{bsvAmount} BSV</div>
                    <div className="text-[11px] text-muted-foreground">${bsvUsd.toFixed(2)} USD</div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <div className="text-xs text-muted-foreground">You receive</div>
                    <div className="font-bold text-green-400">{receiveAmt.toFixed(6)} {selectedCoin?.symbol}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedCoin?.chainLabel}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-lg">
                    {selectedCoin?.icon}
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 BSV = {rate} {selectedCoin?.symbol}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Network fee</span><span className="text-green-400">~0.001 BSV</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Estimated time</span><span>~5–15 min</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Settlement</span><span>BSV on-chain</span></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("idle")}
                className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:text-foreground transition-all text-sm">
                Back
              </button>
              <button onClick={handleContinue}
                className="flex-1 py-3 rounded-2xl bg-green-500 text-black font-bold hover:bg-green-400 transition-all text-sm">
                Confirm Swap
              </button>
            </div>
          </div>
        ) : (
          /* ── Main form state ── */
          <div className="p-5 space-y-3">

            {/* You send — BSV (fixed) */}
            <div className="bg-secondary rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-medium">You send</span>
                <span className="text-[10px] text-muted-foreground">
                  Min: <span className="text-green-400">{selectedCoin ? `${selectedCoin.minBsv} BSV` : "—"}</span>
                  &nbsp;·&nbsp;
                  Max: <span className="text-green-400">{selectedCoin ? `${selectedCoin.maxBsv.toLocaleString()} BSV` : "—"}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={sendAmount}
                  onChange={e => setSendAmount(e.target.value)}
                  placeholder="0.67885268"
                  className="flex-1 bg-transparent text-xl font-bold focus:outline-none min-w-0 text-foreground"
                />
                <div className="flex items-center gap-2 shrink-0 bg-card border border-border rounded-xl px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                    <span className="text-green-400 text-xs font-black">₿</span>
                  </div>
                  <span className="font-bold text-sm">BSV</span>
                  <span className="text-[10px] text-muted-foreground ml-1">BSV</span>
                </div>
              </div>
              {bsvUsd > 0 && (
                <div className="text-xs text-muted-foreground mt-1">≈ ${bsvUsd.toFixed(2)} USD · 1 BSV = ${BSV_USD_PRICE} USD</div>
              )}
              {isInsuf && (
                <div className="text-[11px] text-red-400 mt-1">
                  Insufficient — Min: {minBsv} BSV, Max: {maxBsv.toLocaleString()} BSV. Deposit BSV gas to continue.
                </div>
              )}
            </div>

            {/* You get — searchable dropdown */}
            <div className="bg-secondary rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-medium">You get</span>
                {selectedCoin && receiveAmt > 0 && (
                  <span className="text-xs font-mono text-green-400">≈ {receiveAmt.toFixed(6)} {selectedCoin.symbol}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Estimated output */}
                <div className="flex-1 text-xl font-bold text-muted-foreground">
                  {selectedCoin && receiveAmt > 0 ? receiveAmt.toFixed(8) : "0.00012871"}
                </div>

                {/* Coin selector */}
                <div className="relative shrink-0" ref={dropRef}>
                  <button
                    onClick={() => setShowDropdown(p => !p)}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 hover:border-primary/40 transition-all"
                  >
                    {selectedCoin ? (
                      <>
                        <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-sm" style={{ background: `${selectedCoin.color}20` }}>
                          {selectedCoin.icon}
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-sm">{selectedCoin.symbol}</div>
                          <div className="text-[9px] text-muted-foreground leading-none">{selectedCoin.chainLabel}</div>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Select coin</span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                  </button>

                  {/* Dropdown */}
                  {showDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                      {/* Search */}
                      <div className="p-3 border-b border-border">
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-transparent text-sm focus:outline-none flex-1 placeholder:text-muted-foreground"
                          />
                        </div>
                      </div>
                      {/* Coin list */}
                      <div className="max-h-72 overflow-y-auto">
                        {filteredCoins.map(coin => (
                          <button
                            key={`${coin.symbol}-${coin.chain}`}
                            onClick={() => { setSelectedCoin(coin); setShowDropdown(false); setSearch(""); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-lg shrink-0" style={{ background: `${coin.color}18` }}>
                              {coin.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm">{coin.symbol}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{coin.name}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold" style={{ color: coin.color }}>{coin.chainLabel}</div>
                              <div className="text-[10px] text-muted-foreground">${coin.usdPrice.toLocaleString()}</div>
                            </div>
                          </button>
                        ))}
                        {filteredCoins.length === 0 && (
                          <div className="py-8 text-center text-sm text-muted-foreground">No coins found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {selectedCoin && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  1 BSV = {rate} {selectedCoin.symbol}
                </div>
              )}
            </div>

            {/* Rate info row */}
            {selectedCoin && (
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>Network: {selectedCoin.chainLabel}</span>
                <span>Est. time: ~5–15 min</span>
              </div>
            )}

            {/* Continue button */}
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-base transition-all",
                canContinue
                  ? "bg-green-500 text-black hover:bg-green-400 active:scale-[0.98]"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
            >
              {step === "pending" ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing… {timer}s
                </span>
              ) : canContinue ? "Continue" : selectedCoin ? "Enter amount" : "Select a coin to continue"}
            </button>

            {/* Info note */}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground px-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                BSV Quick Swap uses OrahDEX's cross-chain routing — atomic HTLC locks ensure your BSV is only released when the destination coin is confirmed.
                BSV settlement on-chain.
              </span>
            </div>

          </div>
        )}
      </div>

      {/* Powered by note */}
      <div className="mt-4 text-center text-[11px] text-muted-foreground">
        Inspired by HandCash's cross-chain bridge model · Powered by OrahDEX HTLC routing
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BridgePage() {
  useSEO({
    title: "Buy · Swap · Bridge · DEX — OrahDEX",
    description: "Buy crypto with card, swap 6,000+ coins across 30+ chains, bridge between L1 & L2 networks, or trade on-chain DEX — all in one place on OrahDEX.",
    keywords: "buy crypto, swap, cross-chain bridge, atomic swap, HTLC, BSV bridge, DEX, L1 L2 bridge, OrahDEX",
    url: "/bridge",
  });

  const { address: evmAddress, network, chainId } = useWalletStore();
  const { toast } = useToast();
  const searchStr = useSearch();
  const [, setLocation] = useLocation();

  const { data: bsvChain } = useBsvChain();
  const [pageTab, setPageTab] = useState<"bsvswap" | "swap" | "deposit" | "withdraw" | "history">(() => {
    const params = new URLSearchParams(searchStr);
    const t = params.get("tab");
    if (t === "deposit" || t === "withdraw" || t === "swap" || t === "history" || t === "bsvswap") return t;
    return "deposit";
  });
  const [historyCount, setHistoryCount] = useState(() => loadSwapHistory().length);

  const [fromChain, setFromChain] = useState<Chain>(CHAINS[0]);
  const [toChain, setToChain]     = useState<Chain>(CHAINS[2]);
  const [fromToken, setFromToken] = useState("BSV");
  const [toToken, setToToken]     = useState("ETH");
  const [amount, setAmount]       = useState("");
  const [slippage, setSlippage]   = useState(0.5);
  const [customSlip, setCustomSlip] = useState("");
  const [mode, setMode]           = useState<SwapMode>("htlc");
  const [simStep, setSimStep]     = useState(0);
  const [simRunning, setSimRunning] = useState(false);

  // ── HTLC real flow state ──────────────────────────────────────────────────
  const [htlcLock, setHtlcLock]       = useState<HtlcLock | null>(null);
  const [htlcLoading, setHtlcLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: markets } = useGetMarkets();

  const fromPrice = SPOT_PRICES[fromToken] ?? 1;
  const toPrice   = SPOT_PRICES[toToken]   ?? 1;

  const outputAmount = useMemo(() => {
    const n = parseFloat(amount || "0");
    if (!n || !toPrice) return 0;
    return (n * fromPrice) / toPrice;
  }, [amount, fromPrice, toPrice]);

  const minReceived = useMemo(() =>
    outputAmount * (1 - slippage / 100),
  [outputAmount, slippage]);

  const feeUsd = useMemo(() => {
    const n = parseFloat(amount || "0");
    if (!n) return 0;
    const bridgeFee = mode === "htlc" ? 0 : 0.003;
    const networkFee = 0.0005;
    return n * fromPrice * (bridgeFee + networkFee);
  }, [amount, fromPrice, mode]);

  const isSameChain  = fromChain.id === toChain.id;
  const htlcTime     = mode === "htlc" ? "~5–30 min" : "~30–60 sec";
  const isBsvSource  = fromChain.id === "bsv" && fromToken === "BSV";
  const isEvmDest    = ["eth","arb","op","base","poly"].includes(toChain.id);

  const routeSteps = useMemo(() => {
    if (mode === "htlc") {
      return [
        { icon: <Lock className="w-3.5 h-3.5" />, label: `Lock ${fromToken} on ${fromChain.name}`, detail: `HTLC script locks funds with secret hash H` },
        { icon: <Link2 className="w-3.5 h-3.5" />, label: `Counterparty locks ${toToken} on ${toChain.name}`, detail: `Same hash H used on destination chain` },
        { icon: <Unlock className="w-3.5 h-3.5" />, label: "Reveal preimage to unlock", detail: `Secret S reveals on ${toChain.name} first, then ${fromChain.name}` },
        { icon: <Zap className="w-3.5 h-3.5" />, label: "BSV Settlement", detail: "Swap hash recorded on BSV chain via OP_RETURN" },
      ];
    }
    return [
      { icon: <Lock className="w-3.5 h-3.5" />,   label: `Lock ${fromToken} on ${fromChain.name}`, detail: `Custodial bridge or multi-sig vault secures original asset` },
      { icon: <Layers className="w-3.5 h-3.5" />, label: `Mint wrapped ${fromToken} on EVM`, detail: `1:1 representation minted on Ethereum/L2` },
      { icon: <ArrowLeftRight className="w-3.5 h-3.5" />, label: `Swap w${fromToken} → ${toToken} on AMM`, detail: `OrahDEX AMM pools with 0.3% fee` },
      { icon: <Globe className="w-3.5 h-3.5" />,  label: `Redeem ${toToken} on ${toChain.name}`, detail: `Burn wrapped token → release native asset` },
    ];
  }, [mode, fromChain, toChain, fromToken, toToken]);

  const handleSwapChains = () => {
    const fc = fromChain, tc = toChain, ft = fromToken, tt = toToken;
    setFromChain(tc); setToChain(fc); setFromToken(tt); setToToken(ft);
  };

  // ── Poll HTLC status ──────────────────────────────────────────────────────
  const pollHtlc = useCallback(async (lockId: string) => {
    try {
      const res = await fetch(`/api/bridge/htlc/${lockId}`);
      if (!res.ok) return;
      const data = await res.json() as HtlcLock & { id: string; amountBsv: string };
      const lock: HtlcLock = {
        lockId:         data.id ?? lockId,
        htlcAddress:    data.htlcAddress,
        redeemScript:   data.redeemScript,
        secretHash:     data.secretHash,
        amountBsv:      parseFloat(data.amountBsv as any),
        locktimeBlocks: data.locktimeBlocks,
        currentBlock:   data.currentBlock ?? 0,
        expiresIn:      data.expiresIn ?? "~24 hours",
        status:         data.status,
        fundingTxid:    data.fundingTxid,
        mintTxHash:     data.mintTxHash,
      };
      setHtlcLock(lock);

      // Stop polling once terminal state reached
      if (["complete", "refunded", "expired"].includes(lock.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (lock.status === "complete") {
          toast({ title: "Bridge Complete!", description: "wBSV minted to your EVM address." });
        }
      }
    } catch { /* ignore transient errors */ }
  }, [toast]);

  // Start/stop polling when htlcLock changes
  useEffect(() => {
    if (!htlcLock?.lockId) return;
    if (["complete", "refunded", "expired"].includes(htlcLock.status)) return;

    pollRef.current = setInterval(() => pollHtlc(htlcLock.lockId), 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [htlcLock?.lockId, htlcLock?.status, pollHtlc]);

  // ── Initiate real HTLC ────────────────────────────────────────────────────
  const handleInitiateHtlc = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || isSameChain) return;

    setHtlcLoading(true);
    try {
      const res = await fetch("/api/bridge/htlc/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountBsv:           isBsvSource ? amt : undefined,
          recipientEvmAddress: evmAddress ?? undefined,
          evmChainId:          chainId ?? 1,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({
          title: "Failed to create HTLC",
          description: err?.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const data = await res.json() as HtlcLock & { lockId: string };
      setHtlcLock({
        lockId:         data.lockId,
        htlcAddress:    data.htlcAddress,
        redeemScript:   data.redeemScript,
        secretHash:     data.secretHash,
        amountBsv:      data.amountBsv,
        locktimeBlocks: data.locktimeBlocks,
        currentBlock:   data.currentBlock ?? 0,
        expiresIn:      data.expiresIn ?? "~24 hours",
        status:         "pending",
        instructions:   data.instructions,
      });
    } catch (err: any) {
      toast({
        title: "Network error",
        description: "Could not reach the bridge API. Please try again.",
        variant: "destructive",
      });
    } finally {
      setHtlcLoading(false);
    }
  };

  // ── Wrapped bridge simulation ─────────────────────────────────────────────
  const handleSimulate = () => {
    if (simRunning) return;
    setSimStep(0);
    setSimRunning(true);
    const steps = routeSteps.length;
    let s = 0;
    const tick = () => {
      s++;
      setSimStep(s);
      if (s < steps) setTimeout(tick, 900);
      else setSimRunning(false);
    };
    setTimeout(tick, 600);
  };

  // ── Cancel HTLC ───────────────────────────────────────────────────────────
  const handleCancelHtlc = async () => {
    if (!htlcLock) return;
    try {
      await fetch(`/api/bridge/htlc/${htlcLock.lockId}/cancel`, { method: "POST" });
      setHtlcLock(null);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch {
      toast({ title: "Cancel failed", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const handleCloseHtlc = () => {
    setHtlcLock(null);
    if (pollRef.current) clearInterval(pollRef.current);
    setAmount("");
  };

  const handleBridgeClick = () => {
    if (mode === "htlc") handleInitiateHtlc();
    else handleSimulate();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 w-full">

      {/* HTLC deposit modal */}
      {htlcLock && (
        <HtlcDepositPanel
          lock={htlcLock}
          onCancel={handleCancelHtlc}
          onClose={handleCloseHtlc}
        />
      )}

      {/* Swap / Bridge tab selector */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/40 mb-6 max-w-md">
        <button
          onClick={() => setLocation("/swap")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Swap
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-background border border-border/60 shadow-sm text-foreground"
        >
          <Link2 className="w-3.5 h-3.5" />
          Bridge
        </button>
      </div>

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-1 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent">
          Buy · Swap · Bridge · DEX
        </h1>
        <p className="text-muted-foreground text-sm">
          Deposit, withdraw &amp; bridge across 30+ chains — or open the Exchange tab for swap, buy/sell and on-chain DEX.
        </p>
      </div>

      {/* ── Top-level page tabs ── */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl overflow-x-auto scrollbar-none">
          {([
            { id: "deposit",  icon: <ArrowDown className="w-3.5 h-3.5" />,      label: "Deposit"   },
            { id: "withdraw", icon: <ArrowUp className="w-3.5 h-3.5" />,        label: "Withdraw"  },
            { id: "swap",     icon: <ArrowLeftRight className="w-3.5 h-3.5" />, label: "Cross-chain" },
            { id: "bsvswap",  icon: <ArrowRight className="w-3.5 h-3.5" />,     label: "BSV→Any"  },
            { id: "history",  icon: <Clock className="w-3.5 h-3.5" />,          label: "History"   },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setPageTab(tab.id)}
              className={cn(
                "shrink-0 flex items-center justify-center gap-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                pageTab === tab.id
                  ? tab.id === "bsvswap"
                    ? "bg-green-500/20 text-green-400 shadow-sm border border-green-500/30"
                    : tab.id === "deposit"
                      ? "bg-green-500/20 text-green-400 shadow-sm border border-green-500/20"
                      : tab.id === "withdraw"
                        ? "bg-orange-500/20 text-orange-400 shadow-sm border border-orange-500/20"
                        : "bg-card text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon} {tab.label}
              {tab.id === "history" && historyCount > 0 && (
                <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full leading-none">
                  {historyCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── BSV Quick Swap (HandCash-style) ── */}
      {pageTab === "bsvswap" && (
        <BsvQuickSwap onSwapDone={() => setHistoryCount(c => c + 1)} />
      )}

      {/* ── BSV Settlement Network Card (shown on BSV→Any tab only) ── */}
      {pageTab === "bsvswap" && (
        <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent p-4 mb-6 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full shrink-0", bsvChain?.online ? "bg-green-400 animate-pulse" : "bg-zinc-500")} />
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider">BSV Settlement Network</span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">· All swaps settle on BSV mainnet</span>
            </div>
            <a href={bsvChain?.explorerUrl ?? "https://whatsonchain.com"} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline">
              WhatsOnChain <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { icon: Layers,   label: "Block",       value: bsvChain?.blockHeight ? `#${bsvChain.blockHeight.toLocaleString()}` : "—", color: "text-green-400" },
              { icon: Zap,      label: "Fee Rate",    value: `${bsvChain?.feeRateSatPerByte ?? 1} sat/B`,                              color: "text-orange-400" },
              { icon: Cpu,      label: "Hashrate",    value: fmtHashrate(bsvChain?.hashrateEHs ?? 0),                                  color: "text-sky-400" },
              { icon: Waves,    label: "Mempool",     value: fmtMempoolMb(bsvChain?.mempoolBytes ?? 0),                               color: "text-violet-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-background/40 rounded-xl px-3 py-2 flex items-center gap-2">
                <Icon className={cn("w-4 h-4 shrink-0", color)} />
                <div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className={cn("text-xs font-bold font-mono", color)}>{value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Avg confirmation: <span className="text-foreground font-semibold ml-1">~10 min</span>
            </span>
            {bsvChain?.medianTime ? (
              <span>Last block: <span className="text-foreground font-semibold">{fmtBlockAge(bsvChain.medianTime)}</span></span>
            ) : null}
            {bsvChain?.bsvUsd && bsvChain.bsvUsd > 0 ? (
              <span>BSV/USD: <span className="text-green-400 font-bold">${bsvChain.bsvUsd.toFixed(2)}</span></span>
            ) : null}
            {bsvChain?.bestBlockHash ? (
              <span>Best block: <a href={bsvChain.explorerUrl} target="_blank" rel="noopener noreferrer"
                className="text-primary font-mono hover:underline">{bsvChain.bestBlockHash.slice(0, 14)}…</a></span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Deposit / Withdraw canonical panels ── */}
      {pageTab === "deposit"  && <CanonicalPanel mode="deposit"  />}
      {pageTab === "withdraw" && <CanonicalPanel mode="withdraw" />}
      {pageTab === "history"  && <SwapHistory />}
      {pageTab !== "swap" && pageTab !== "bsvswap" && null}

      {pageTab === "swap" && <>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">

        {/* ── Left: Swap form ── */}
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            {(["htlc", "wrapped"] as SwapMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSimStep(0); }}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "wrapped" ? (
                  <><Layers className="w-3.5 h-3.5" /> Wrapped Bridge</>
                ) : (
                  <><Lock className="w-3.5 h-3.5" /> Atomic HTLC</>
                )}
              </button>
            ))}
          </div>

          {/* Mode description */}
          <div className={cn(
            "flex items-start gap-2.5 p-3 rounded-xl border text-xs text-muted-foreground",
            mode === "htlc"
              ? "border-orange-500/20 bg-orange-500/5"
              : "border-primary/20 bg-primary/5"
          )}>
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            {mode === "htlc"
              ? "Atomic HTLC: trustless peer-to-peer swap using Hash Time-Locked Contracts. Real P2SH HTLC script generated server-side. Send BSV to the HTLC address — bridge detects and mints wBSV on EVM."
              : "Wrapped Bridge: assets locked in multi-sig vault, wrapped tokens minted on EVM for AMM trading. Fast (~30–60 sec) with pooled liquidity. Requires trusting bridge operators."
            }
          </div>

          {/* HTLC: BSV→EVM wallet info banner */}
          {mode === "htlc" && isBsvSource && (
            <div className={cn(
              "flex items-start gap-2.5 p-3 rounded-xl border text-xs",
              evmAddress
                ? "border-green-500/20 bg-green-500/5 text-green-400"
                : "border-border bg-secondary/30 text-muted-foreground"
            )}>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {evmAddress
                ? `wBSV will mint to: ${evmAddress.slice(0, 10)}…${evmAddress.slice(-6)}`
                : "Connect an EVM wallet to specify the wBSV recipient address."}
            </div>
          )}

          {/* From chain/token */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</div>
            <ChainSelect value={fromChain} onChange={(c) => { setFromChain(c); setFromToken(c.tokens[0]); setSimStep(0); }} />

            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {fromChain.tokens.map(t => (
                  <button
                    key={t}
                    onClick={() => setFromToken(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                      fromToken === t
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >{t}</button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setSimStep(0); }}
                placeholder="0.00"
                className="w-36 text-right bg-secondary border border-border rounded-xl px-3 py-2 text-foreground font-mono font-semibold text-lg focus:outline-none focus:border-primary/50"
              />
            </div>
            {amount && (
              <div className="text-xs text-muted-foreground text-right">
                ≈ ${(parseFloat(amount) * fromPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Swap direction button */}
          <div className="flex items-center justify-center">
            <button
              onClick={handleSwapChains}
              className="w-10 h-10 rounded-full border border-border bg-card hover:border-primary/50 hover:bg-primary/10 flex items-center justify-center transition-all group"
            >
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </div>

          {/* To chain/token */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</div>
            <ChainSelect
              value={toChain}
              onChange={(c) => { setToChain(c); setToToken(c.tokens[0]); setSimStep(0); }}
              exclude={fromChain.id}
            />

            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {toChain.tokens.map(t => (
                  <button
                    key={t}
                    onClick={() => setToToken(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                      toToken === t
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >{t}</button>
                ))}
              </div>
              <div className="w-36 text-right bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 font-mono font-semibold text-lg text-foreground">
                {outputAmount > 0 ? outputAmount.toFixed(6) : "0.00"}
              </div>
            </div>
            {outputAmount > 0 && (
              <div className="text-xs text-muted-foreground text-right">
                ≈ ${(outputAmount * toPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Slippage */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slippage Tolerance</span>
              <span className="text-xs font-bold text-primary">{slippage}%</span>
            </div>
            <div className="flex gap-2">
              {SLIPPAGE_PRESETS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSlippage(s); setCustomSlip(""); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all",
                    slippage === s && !customSlip
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >{s}%</button>
              ))}
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Custom"
                  value={customSlip}
                  min="0.01"
                  max="50"
                  step="0.1"
                  onChange={e => {
                    setCustomSlip(e.target.value);
                    const v = parseFloat(e.target.value);
                    if (v > 0 && v <= 50) setSlippage(v);
                  }}
                  className="w-full py-1.5 rounded-lg text-xs font-bold border border-border bg-secondary text-foreground text-center focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Summary */}
            {outputAmount > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Min received</span>
                  <span className="font-semibold text-foreground">
                    {minReceived.toFixed(6)} {toToken}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Bridge fee</span>
                  <span className="font-semibold text-foreground">${feeUsd.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Settlement time</span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{htlcTime}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">BSV Settlement</span>
                  <span className="font-semibold text-green-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 animate-pulse" /> On-chain · &lt;5s · ~$0.001
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Warnings */}
          {isSameChain && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Select different source and destination chains for cross-chain bridging.
            </div>
          )}
          {mode === "htlc" && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400/80">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              HTLC swaps require a counterparty. If no match is found before the timeout window, funds are automatically refunded. Never share your secret preimage before receiving funds.
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleBridgeClick}
            disabled={!amount || parseFloat(amount) <= 0 || isSameChain || simRunning || htlcLoading}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary to-green-500 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {htlcLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Generating HTLC…</>
            ) : simRunning ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Routing…</>
            ) : (
              <><ArrowRight className="w-5 h-5" /> {mode === "htlc" ? "Initiate HTLC Lock" : "Bridge Assets"}</>
            )}
          </button>
        </div>

        {/* ── Right: Route & info ── */}
        <div className="space-y-4">

          {/* Route path */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">Route Path</span>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                mode === "htlc"
                  ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                  : "text-primary border-primary/30 bg-primary/10"
              )}>
                {mode === "htlc" ? "HTLC Atomic" : "Wrapped Bridge"}
              </span>
            </div>

            <div className="space-y-2">
              {routeSteps.map((step, i) => (
                <RouteStep
                  key={i}
                  icon={step.icon}
                  label={step.label}
                  detail={step.detail}
                  done={simStep > i + 1}
                  active={simStep === i + 1 || (!simRunning && simStep === 0)}
                />
              ))}
            </div>

            {/* Chain → chain visualization */}
            <div className="mt-4 flex items-center gap-2 justify-center">
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold", fromChain.bgColor, fromChain.color)}>
                <span>{fromChain.icon}</span> {fromChain.name}
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              {mode === "wrapped" && (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs font-bold text-violet-400">
                    <span>⬡</span> EVM Bridge
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </>
              )}
              {mode === "htlc" && (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-bold text-orange-400">
                    <Lock className="w-3 h-3" /> HTLC
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </>
              )}
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold", toChain.bgColor, toChain.color)}>
                <span>{toChain.icon}</span> {toChain.name}
              </div>
            </div>
          </div>

          {/* Collapsible technical details */}
          <details className="group">
            <summary className="cursor-pointer flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors list-none py-1">
              <Info className="w-3.5 h-3.5" />
              <span>Technical details</span>
              <ChevronDown className="w-3.5 h-3.5 ml-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 space-y-3">
              {mode === "htlc" && (
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Lock className="w-4 h-4 text-orange-400" />
                    HTLC Script
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      { label: "Script type", value: "P2SH HTLC" },
                      { label: "Hash function", value: "SHA-256" },
                      { label: "Claim path", value: "Reveal preimage → relayer claims" },
                      { label: "Refund path", value: "CLTV + 144 blocks (~24 hrs)" },
                      { label: "Network", value: "BSV Mainnet" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-semibold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Shield className="w-4 h-4 text-primary" />
                  Security Notes
                </div>
                <ul className="space-y-2">
                  {[
                    { label: "Non-custodial HTLC", detail: "Funds locked by script — not by OrahDEX" },
                    { label: "HTLC timeouts", detail: "144-block refund window prevents stuck funds" },
                    { label: "Slippage protection", detail: "Min received guaranteed; tx reverts if breached" },
                    { label: "On-chain verifiable", detail: "Redeem script and secret hash are public" },
                  ].map(({ label, detail }) => (
                    <li key={label} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground">{label}</span>
                        <span className="text-muted-foreground"> — {detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-green-500/25 bg-green-500/5 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                  <span className="text-lg animate-pulse">⚡</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-green-400">BSV Final Settlement</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Every cross-chain swap is anchored to the BSV blockchain via OP_RETURN — immutable, instant, &lt;$0.001.
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
      </>}
    </div>
  );
}
