/**
 * WithdrawSheet.tsx
 *
 * Three-tab dialog: Deposit · Withdraw · History
 *
 * Deposit tab  — unique per-user deposit address + QR, network selector,
 *                and TX-hash verifier.
 * Withdraw tab — amount + recipient form, instant on-chain settlement.
 * History tab  — past withdrawals with status badges, gas-shortage banner.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  CheckCircle2,
  Loader2,
  Zap,
  History,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Download,
  RefreshCw,
  Wallet,
  ArrowRight,
  Clock,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { validateAltChainAddress } from "@/lib/addressValidation";
import { isAddress as isEvmAddress } from "viem";
import { CHAIN_RPC_URLS } from "@/lib/reown";
import { getViemAccountForAddress } from "@/lib/walletSigner";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNotificationStore } from "@/store/useNotificationStore";
import { QRCodeCanvas } from "qrcode.react";

// ── constants ────────────────────────────────────────────────────────────────
const SUPPORTED_CHAINS: { id: number; label: string; short: string; color: string }[] = [
  { id: 1,        label: "Ethereum Mainnet", short: "Ethereum", color: "#627EEA" },
  { id: 8453,     label: "Base",             short: "Base",     color: "#0052FF" },
  { id: 56,       label: "BNB Smart Chain",  short: "BSC",      color: "#F3BA2F" },
  { id: 11155111, label: "Sepolia Testnet",  short: "Sepolia",  color: "#9B59B6" },
];

// ── wallet-send chain & token registry ───────────────────────────────────────
interface WalletChain  { id: number; name: string; symbol: string; color: string; explorer: string }
interface WalletToken  { symbol: string; decimals: number; isNative: boolean; address: string | null; color: string }

const WALLET_CHAINS: WalletChain[] = [
  { id: 8453,     name: "Base",      symbol: "ETH",  color: "#0052FF", explorer: "https://basescan.org/tx/" },
  { id: 1,        name: "Ethereum",  symbol: "ETH",  color: "#627EEA", explorer: "https://etherscan.io/tx/" },
  { id: 56,       name: "BSC",       symbol: "BNB",  color: "#F0B90B", explorer: "https://bscscan.com/tx/" },
  { id: 42161,    name: "Arbitrum",  symbol: "ETH",  color: "#28A0F0", explorer: "https://arbiscan.io/tx/" },
  { id: 10,       name: "Optimism",  symbol: "ETH",  color: "#FF0420", explorer: "https://optimistic.etherscan.io/tx/" },
  { id: 137,      name: "Polygon",   symbol: "POL",  color: "#8247E5", explorer: "https://polygonscan.com/tx/" },
  { id: 43114,    name: "Avalanche", symbol: "AVAX", color: "#E84142", explorer: "https://snowtrace.io/tx/" },
  { id: 11155111, name: "Sepolia",   symbol: "ETH",  color: "#9B59B6", explorer: "https://sepolia.etherscan.io/tx/" },
];

const WALLET_TOKENS: Record<number, WalletToken[]> = {
  8453:  [
    { symbol: "ETH",  decimals: 18, isNative: true,  address: null,                                       color: "#627EEA" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", color: "#3B82F6" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", color: "#22C55E" },
    { symbol: "WETH", decimals: 18, isNative: false, address: "0x4200000000000000000000000000000000000006", color: "#8B5CF6" },
  ],
  1:     [
    { symbol: "ETH",  decimals: 18, isNative: true,  address: null,                                       color: "#627EEA" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", color: "#22C55E" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", color: "#3B82F6" },
    { symbol: "WBTC", decimals: 8,  isNative: false, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", color: "#F97316" },
  ],
  56:    [
    { symbol: "BNB",  decimals: 18, isNative: true,  address: null,                                       color: "#F0B90B" },
    { symbol: "USDT", decimals: 18, isNative: false, address: "0x55d398326f99059fF775485246999027B3197955", color: "#22C55E" },
    { symbol: "USDC", decimals: 18, isNative: false, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", color: "#3B82F6" },
  ],
  42161: [
    { symbol: "ETH",  decimals: 18, isNative: true,  address: null,                                       color: "#627EEA" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", color: "#3B82F6" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", color: "#22C55E" },
  ],
  10:    [
    { symbol: "ETH",  decimals: 18, isNative: true,  address: null,                                       color: "#627EEA" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", color: "#3B82F6" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", color: "#22C55E" },
  ],
  137:   [
    { symbol: "POL",  decimals: 18, isNative: true,  address: null,                                       color: "#8247E5" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", color: "#22C55E" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", color: "#3B82F6" },
  ],
  43114: [
    { symbol: "AVAX", decimals: 18, isNative: true,  address: null,                                       color: "#E84142" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", color: "#3B82F6" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", color: "#22C55E" },
  ],
  11155111: [
    { symbol: "ETH",  decimals: 18, isNative: true,  address: null,                                       color: "#627EEA" },
    { symbol: "USDC", decimals: 6,  isNative: false, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", color: "#3B82F6" },
    { symbol: "USDT", decimals: 6,  isNative: false, address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", color: "#22C55E" },
    { symbol: "WBTC", decimals: 8,  isNative: false, address: "0x29f2D40B0605204364af54EC677bD022dA425d03", color: "#F97316" },
  ],
};

// minimal ERC-20 transfer ABI
const ERC20_TRANSFER_ABI = [{
  name: "transfer", type: "function", stateMutability: "nonpayable",
  inputs:  [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

// ── types ────────────────────────────────────────────────────────────────────
interface WithdrawHistoryItem {
  id:           string;
  asset:        string;
  amount:       number;
  recipient:    string;
  network:      string;
  networkLabel: string;
  status:       "pending" | "processing" | "completed" | "failed" | "cancelled";
  txid?:        string | null;
  note?:        string | null;
  createdAt:    string;
}

interface DepositAddressResponse {
  depositAddress: string;
  chainId:        number;
  chainName:      string;
  nativeSymbol:   string;
  blockExplorer:  string;
  ledgerBalances: Record<string, string>;
}

interface BitcoinDepositResponse {
  network:          string;
  supported:        boolean;
  symbol:           string;
  label:            string;
  address?:         string;
  minDeposit?:      string;
  explorerTx?:      string;
  explorerAddress?: string;
  message?:         string;
}

interface SolanaDepositResponse {
  network:          string;
  supported:        boolean;
  symbol:           string;
  label?:           string;
  address?:         string;
  minDeposit?:      string;
  explorerTx?:      string;
  explorerAddress?: string;
  message?:         string;
}

interface AltChainDepositResponse {
  network:          string;
  supported:        boolean;
  symbol:           string;
  label?:           string;
  address?:         string;
  minDeposit?:      string;
  explorerAddress?: string;
  message?:         string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function summariseNote(raw: string): string {
  if (!raw) return raw;
  if (raw.includes("total cost") && raw.includes("gas fee"))
    return "Your withdrawal is queued and will be processed automatically.";
  if (/insufficient funds/i.test(raw)) return "Insufficient funds to complete the transaction.";
  if (/nonce/i.test(raw)) return "Transaction nonce conflict — please retry.";
  if (/execution reverted/i.test(raw)) return "Transaction reverted by the contract.";
  const firstSentence = raw.split(/\.\s/)[0];
  return firstSentence.length <= 120 ? firstSentence : firstSentence.slice(0, 117) + "…";
}

function isGasError(note: string | null | undefined): boolean {
  if (!note) return false;
  return (note.includes("total cost") && note.includes("gas fee")) ||
    /insufficient funds for transfer/i.test(note);
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 8)}…${a.slice(-6)}` : "";
}

// ── props ────────────────────────────────────────────────────────────────────
export interface WithdrawSheetProps {
  open:                boolean;
  onClose:             () => void;
  walletAddress:       string;
  defaultRecipient?:   string;
  asset:               string;
  available:           number;
  network:             string;
  networkLabel:        string;
  addressPlaceholder?: string;
  color?:              string;
  /** Open directly on a specific tab */
  initialTab?:         "deposit" | "withdraw" | "history";
  /** Restrict which tabs are visible in the tab bar. Defaults to all three. */
  visibleTabs?:        ("deposit" | "withdraw" | "history")[];
  /** Whether this is a passkey / orah-wallet — enables "Send from Wallet" mode */
  isOrahWallet?:       boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
export function WithdrawSheet({
  open,
  onClose,
  walletAddress,
  defaultRecipient,
  asset,
  available,
  network,
  networkLabel,
  addressPlaceholder = "Destination wallet address",
  color = "#6B7280",
  initialTab = "withdraw",
  visibleTabs,
  isOrahWallet = false,
}: WithdrawSheetProps) {
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();

  const isBitcoinFork = ["bsv", "btc", "bch"].includes(network.toLowerCase());
  const isSolana      = network.toLowerCase() === "sol";
  const isEvmNetwork  = !isBitcoinFork && !isSolana && (network.toLowerCase() === "evm" || network === "");
  const isAltChain    = !isBitcoinFork && !isSolana && !isEvmNetwork; // LTC, DOGE, XRP, ADA, TRON, TON, etc.
  const isNonEvm      = isBitcoinFork || isSolana || isAltChain;
  const isManualWithdraw = !isEvmNetwork && network.toLowerCase() !== "bsv" && network.toLowerCase() !== "bch";

  const [tab,          setTab]          = useState<"deposit" | "withdraw" | "history">(initialTab);
  const [amount,       setAmount]       = useState("");
  const [recipient,    setRecipient]    = useState(defaultRecipient ?? "");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [depositChain, setDepositChain] = useState(SUPPORTED_CHAINS[1]); // Base default
  const [depositMode,  setDepositMode]  = useState<"exchange" | "wallet">("exchange");
  const [txHash,       setTxHash]       = useState("");
  const [verifying,    setVerifying]    = useState(false);
  const [bsvTxHash,    setBsvTxHash]    = useState("");
  const [bsvVerifying, setBsvVerifying] = useState(false);
  const [solTxHash,    setSolTxHash]    = useState("");
  const [solVerifying, setSolVerifying] = useState(false);

  // ── deposit-from-wallet state ────────────────────────────────────────────
  const [depFromWalletBalance,  setDepFromWalletBalance]  = useState<number | null>(null);
  const [depFromWalletBalFetch, setDepFromWalletBalFetch] = useState(false);
  const [depFromWalletAmount,   setDepFromWalletAmount]   = useState("");
  const [depFromWalletSending,  setDepFromWalletSending]  = useState(false);
  const [depFromWalletTxHash,   setDepFromWalletTxHash]   = useState<string | null>(null);
  const [depFromWalletError,    setDepFromWalletError]    = useState<string | null>(null);

  // ── wallet send state ────────────────────────────────────────────────────
  const [withdrawSource,      setWithdrawSource]      = useState<"exchange" | "wallet">("exchange");
  const [walletSendChain,     setWalletSendChain]     = useState<WalletChain>(WALLET_CHAINS[0]); // Base default
  const [walletSendToken,     setWalletSendToken]     = useState<WalletToken>(WALLET_TOKENS[WALLET_CHAINS[0].id][0]);
  const [walletSendBalance,   setWalletSendBalance]   = useState<number | null>(null);
  const [walletSendBalFetch,  setWalletSendBalFetch]  = useState(false);
  const [walletSendAmount,    setWalletSendAmount]    = useState("");
  const [walletSendRecipient, setWalletSendRecipient] = useState("");
  const [walletSending,       setWalletSending]       = useState(false);
  const [walletSendTxHash,    setWalletSendTxHash]    = useState<string | null>(null);
  const [walletSendError,     setWalletSendError]     = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAmount("");
      setRecipient(defaultRecipient ?? "");
      setSubmitted(false);
      setTxHash("");
      setWithdrawSource("exchange");
      setWalletSendTxHash(null);
      setWalletSendError(null);
      setWalletSendAmount("");
      setWalletSendRecipient("");
      setDepFromWalletTxHash(null);
      setDepFromWalletError(null);
      setDepFromWalletAmount("");
      setDepFromWalletBalance(null);
      setBsvTxHash("");
      setSolTxHash("");
    }
  }, [open, defaultRecipient, initialTab]);

  // ── live OrahDEX ledger balance for this asset ───────────────────────────
  // Fetches the user_balances row directly so the displayed "OrahDEX Balance"
  // is always the custodial ledger amount, never the on-chain wallet balance
  // that may be passed in via the `available` prop.
  const { data: ledgerBal } = useQuery<{ available: string }>({
    queryKey: ["withdraw-ledger-balance", walletAddress, asset],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/balances/${asset}?walletAddress=${encodeURIComponent(walletAddress)}`, { cache: "no-store" });
      if (!r.ok) return { available: "0" };
      return r.json();
    },
    enabled: !!walletAddress && !!asset && open,
    refetchInterval: open ? 10_000 : false,
    staleTime: 5_000,
  });
  const ledgerAvailable = parseFloat(ledgerBal?.available ?? "0") || 0;
  // Use the live ledger value when we have one; fall back to the prop only
  // before the first fetch returns.
  const exchangeAvailable = ledgerBal !== undefined ? ledgerAvailable : available;

  // ── deposit address ──────────────────────────────────────────────────────
  const { data: depositData, isLoading: depositLoading, refetch: refetchDeposit } =
    useQuery<DepositAddressResponse>({
      queryKey: ["deposit-address", walletAddress, depositChain.id],
      queryFn: async () => {
        if (!walletAddress) throw new Error("No wallet");
        const r = await fetch(
          `${API_BASE}/deposit/address?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${depositChain.id}`
        );
        if (!r.ok) throw new Error("Failed to load deposit address");
        return r.json();
      },
      enabled: !!walletAddress && open && tab === "deposit" && !isNonEvm,
      staleTime: 60_000,
    });

  // ── bitcoin (BSV/BTC/BCH) deposit address ────────────────────────────────
  const { data: bitcoinDepositData, isLoading: bitcoinDepositLoading } =
    useQuery<BitcoinDepositResponse>({
      queryKey: ["bitcoin-deposit-address", network],
      queryFn: async () => {
        const r = await fetch(`${API_BASE}/deposit/bitcoin-address?network=${network.toLowerCase()}`);
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      },
      enabled: isBitcoinFork && open && tab === "deposit",
      staleTime: 300_000,
    });

  // ── Solana deposit address ───────────────────────────────────────────────
  const { data: solanaDepositData, isLoading: solanaDepositLoading } =
    useQuery<SolanaDepositResponse>({
      queryKey: ["solana-deposit-address"],
      queryFn: async () => {
        const r = await fetch(`${API_BASE}/deposit/solana-address`);
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      },
      enabled: isSolana && open && tab === "deposit",
      staleTime: 300_000,
    });

  // ── Solana tx verify ─────────────────────────────────────────────────────
  const handleSolVerify = async () => {
    if (!solTxHash.trim() || solVerifying || !walletAddress) return;
    setSolVerifying(true);
    try {
      const r = await fetch(`${API_BASE}/deposit/solana-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash: solTxHash.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Verification failed", description: data.error ?? "Could not verify transaction", variant: "destructive" });
      } else {
        toast({ title: "SOL deposit credited!", description: `${data.amount} SOL has been added to your trading balance.` });
        addNotification({ type: "deposit", title: "SOL Deposit Credited", body: `${data.amount} SOL added to your exchange balance.` });
        setSolTxHash("");
      }
    } catch {
      toast({ title: "Verification failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setSolVerifying(false);
    }
  };

  // ── AltChain deposit address ─────────────────────────────────────────────
  const { data: altchainData, isLoading: altchainLoading } =
    useQuery<AltChainDepositResponse>({
      queryKey: ["altchain-deposit-address", network],
      queryFn: async () => {
        const r = await fetch(`${API_BASE}/deposit/altchain-address?network=${network.toLowerCase()}`);
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      },
      enabled: isAltChain && open && tab === "deposit",
      staleTime: 300_000,
    });

  // ── BSV tx verify ────────────────────────────────────────────────────────
  const handleBsvVerify = async () => {
    if (!bsvTxHash.trim() || bsvVerifying || !walletAddress) return;
    setBsvVerifying(true);
    try {
      const r = await fetch(`${API_BASE}/deposit/bsv-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash: bsvTxHash.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Verification failed", description: data.error ?? "Could not verify transaction", variant: "destructive" });
      } else {
        toast({ title: "BSV deposit credited!", description: `${data.amount} BSV has been added to your trading balance.` });
        addNotification({ type: "deposit", title: "BSV Deposit Credited", body: `${data.amount} BSV added to your exchange balance.` });
        setBsvTxHash("");
      }
    } catch {
      toast({ title: "Verification failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setBsvVerifying(false);
    }
  };

  // ── withdrawal history ───────────────────────────────────────────────────
  const { data: history = [], refetch: refetchHistory } = useQuery<WithdrawHistoryItem[]>({
    queryKey: ["withdrawal-history", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const r = await fetch(`${API_BASE}/withdrawals/${encodeURIComponent(walletAddress)}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!walletAddress && open,
    refetchInterval: submitted ? 4_000 : 30_000,
    staleTime: 2_000,
  });

  const hasGasError = history.some(
    h => isGasError(h.note) && (h.status === "cancelled" || h.status === "pending")
  );

  // ── withdraw logic ───────────────────────────────────────────────────────
  const parsedAmount    = parseFloat(amount) || 0;
  const exceedsBalance  = parsedAmount > exchangeAvailable;

  const isValidRecipient = (() => {
    const r = recipient.trim();
    if (!r) return false;
    if (isSolana)     return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r);
    if (isBitcoinFork) return /^[13mn][a-km-zA-HJ-NP-Z1-9]{25,50}$/.test(r);
    if (isAltChain)   return validateAltChainAddress(network, r);
    // EVM: viem's isAddress validates EIP-55 checksum so a single mistyped
    // character is caught rather than silently passing regex.
    return isEvmAddress(r, { strict: false });
  })();

  const canSubmit = parsedAmount > 0 && !exceedsBalance && isValidRecipient && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/withdrawals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, asset, amount: parsedAmount, network, networkLabel, recipient: recipient.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to submit withdrawal");
      setSubmitted(true);
      toast({ title: "Withdrawal sent", description: `${parsedAmount} ${asset} is being broadcast on-chain.` });
      addNotification({ type: "withdrawal", title: "Withdrawal Processing", body: `${parsedAmount} ${asset} is being sent on-chain.` });
      refetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── deposit-from-wallet: native balance fetch ────────────────────────────
  const fetchDepFromWalletBalance = useCallback(async (chainId: number) => {
    if (!walletAddress) return;
    setDepFromWalletBalance(null);
    setDepFromWalletBalFetch(true);
    try {
      const rpc = CHAIN_RPC_URLS[chainId];
      if (!rpc) return;
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [walletAddress, "latest"] }),
      });
      const { result } = await res.json();
      setDepFromWalletBalance(Number(BigInt(result ?? "0x0")) / 1e18);
    } catch {
      setDepFromWalletBalance(null);
    } finally {
      setDepFromWalletBalFetch(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (open && tab === "deposit" && depositMode === "exchange" && isOrahWallet) {
      fetchDepFromWalletBalance(depositChain.id);
    }
  }, [open, tab, depositMode, depositChain.id, isOrahWallet, fetchDepFromWalletBalance]);

  // ── deposit-from-wallet: broadcast ──────────────────────────────────────
  const handleDepositFromWallet = async (depositAddress: string, nativeSymbol: string) => {
    const parsedAmt = parseFloat(depFromWalletAmount);
    if (!parsedAmt || !depositAddress || depFromWalletSending) return;
    setDepFromWalletSending(true);
    setDepFromWalletError(null);
    try {
      const account = await getViemAccountForAddress(walletAddress, {
        title: "Authorize deposit",
        subtitle: `Unlock your imported OrahDEX wallet to send ${depFromWalletAmount} ${nativeSymbol}.`,
      });
      const { createWalletClient, http, parseEther } = await import("viem");
      const chainDef = {
        id:             depositChain.id,
        name:           depositChain.short,
        nativeCurrency: { name: nativeSymbol, symbol: nativeSymbol, decimals: 18 },
        rpcUrls:        { default: { http: [CHAIN_RPC_URLS[depositChain.id]] } },
      } as const;
      const walletClient = createWalletClient({ account, chain: chainDef as any, transport: http(CHAIN_RPC_URLS[depositChain.id]) });
      const hash = await walletClient.sendTransaction({
        to:    depositAddress as `0x${string}`,
        value: parseEther(depFromWalletAmount),
      } as any);
      setDepFromWalletTxHash(hash);
      // Auto-fill the TX verify field so user can verify in one tap
      setTxHash(hash);
      toast({ title: "Deposit sent!", description: `${depFromWalletAmount} ${nativeSymbol} sent to OrahDEX. Tap Verify to credit your balance.` });
      addNotification({ type: "deposit", title: "Deposit Sent", body: `${depFromWalletAmount} ${nativeSymbol} sent on-chain. Verify to credit balance.` });
      setTimeout(() => fetchDepFromWalletBalance(depositChain.id), 4000);
    } catch (err: any) {
      const msg = err.shortMessage ?? err.message ?? "Transaction failed";
      setDepFromWalletError(msg);
      toast({ title: "Deposit failed", description: msg, variant: "destructive" });
    } finally {
      setDepFromWalletSending(false);
    }
  };

  // ── wallet send: balance fetch ───────────────────────────────────────────
  const fetchWalletBalance = useCallback(async (chain: WalletChain, token: WalletToken) => {
    if (!walletAddress) return;
    setWalletSendBalance(null);
    setWalletSendBalFetch(true);
    try {
      const rpc = CHAIN_RPC_URLS[chain.id];
      if (!rpc) return;

      if (token.isNative) {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [walletAddress, "latest"] }),
        });
        const { result } = await res.json();
        setWalletSendBalance(Number(BigInt(result ?? "0x0")) / 1e18);
      } else if (token.address) {
        // balanceOf(address) → 0x70a08231 + padded address
        const data = "0x70a08231" + walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token.address, data }, "latest"] }),
        });
        const { result } = await res.json();
        const raw = BigInt(result ?? "0x0");
        setWalletSendBalance(Number(raw) / Math.pow(10, token.decimals));
      }
    } catch {
      setWalletSendBalance(null);
    } finally {
      setWalletSendBalFetch(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (open && tab === "withdraw" && withdrawSource === "wallet" && isOrahWallet) {
      fetchWalletBalance(walletSendChain, walletSendToken);
    }
  }, [open, tab, withdrawSource, walletSendChain, walletSendToken, isOrahWallet, fetchWalletBalance]);

  // ── wallet send: broadcast ───────────────────────────────────────────────
  const handleWalletSend = async () => {
    const parsedWalletAmount = parseFloat(walletSendAmount);
    if (!parsedWalletAmount || !walletSendRecipient.trim() || walletSending) return;
    setWalletSending(true);
    setWalletSendError(null);
    try {
      const account = await getViemAccountForAddress(walletAddress, {
        title: "Authorize transfer",
        subtitle: `Unlock your imported OrahDEX wallet to send ${walletSendAmount} ${walletSendToken.symbol}.`,
      });

      const { createWalletClient, http, parseEther, parseUnits } = await import("viem");
      // build minimal chain object viem needs
      const chainDef = {
        id:         walletSendChain.id,
        name:       walletSendChain.name,
        nativeCurrency: { name: walletSendChain.symbol, symbol: walletSendChain.symbol, decimals: 18 },
        rpcUrls:    { default: { http: [CHAIN_RPC_URLS[walletSendChain.id]] } },
      } as const;

      const walletClient = createWalletClient({ account, chain: chainDef as any, transport: http(CHAIN_RPC_URLS[walletSendChain.id]) });

      let hash: `0x${string}`;
      if (walletSendToken.isNative) {
        hash = await walletClient.sendTransaction({
          to:    walletSendRecipient.trim() as `0x${string}`,
          value: parseEther(walletSendAmount),
        } as any);
      } else {
        hash = await walletClient.writeContract({
          address:      walletSendToken.address as `0x${string}`,
          abi:          ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [
            walletSendRecipient.trim() as `0x${string}`,
            parseUnits(walletSendAmount, walletSendToken.decimals),
          ],
        } as any);
      }

      setWalletSendTxHash(hash);
      toast({ title: "Transaction sent!", description: `${walletSendAmount} ${walletSendToken.symbol} is being confirmed on-chain.` });
      addNotification({
        type: "withdrawal",
        title: "On-Chain Transfer Sent",
        body: `${walletSendAmount} ${walletSendToken.symbol} sent on ${walletSendChain.name}. TX: ${hash.slice(0, 12)}…`,
      });
      // refresh balance after a short delay
      setTimeout(() => fetchWalletBalance(walletSendChain, walletSendToken), 4000);
    } catch (err: any) {
      const msg = err.shortMessage ?? err.message ?? "Transaction failed";
      setWalletSendError(msg);
      toast({ title: "Transfer failed", description: msg, variant: "destructive" });
    } finally {
      setWalletSending(false);
    }
  };

  // ── verify deposit TX ────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!txHash.trim()) return;
    setVerifying(true);
    try {
      const r = await fetch(`${API_BASE}/deposit/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash: txHash.trim(), chainId: depositChain.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Verification failed");
      toast({ title: "Deposit credited!", description: `${data.amount} ${data.asset} added to your OrahDEX balance.` });
      setTxHash("");
      refetchDeposit();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const statusStyle = (s: string) => {
    if (s === "completed")  return "text-green-400  bg-green-400/10  border-green-400/20";
    if (s === "failed")     return "text-red-400    bg-red-400/10    border-red-400/20";
    if (s === "cancelled")  return "text-orange-400 bg-orange-400/10 border-orange-400/20";
    if (s === "processing") return "text-blue-400   bg-blue-400/10   border-blue-400/20";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0"
              style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
            >
              {asset[0]}
            </div>
            <span>
              {asset} —{" "}
              {!visibleTabs || visibleTabs.length === 3
                ? "Deposit & Withdraw"
                : visibleTabs.includes("deposit") && !visibleTabs.includes("withdraw")
                  ? "Deposit"
                  : visibleTabs.includes("withdraw") && !visibleTabs.includes("deposit")
                    ? "Withdraw"
                    : "Deposit & Withdraw"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar — hidden when only one tab is shown */}
        {(!visibleTabs || visibleTabs.length > 1) && (
          <div className="flex gap-1 p-1 rounded-xl bg-secondary/30">
            {([
              { key: "deposit",  label: "Deposit",  icon: <Download className="w-3.5 h-3.5" /> },
              { key: "withdraw", label: "Withdraw", icon: <Upload    className="w-3.5 h-3.5" /> },
              { key: "history",  label: "History",  icon: <History   className="w-3.5 h-3.5" />, badge: history.length },
            ] as const).filter(t => !visibleTabs || visibleTabs.includes(t.key)).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all",
                  tab === t.key
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {t.icon}
                  {t.label}
                  {"badge" in t && t.badge > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      {t.badge}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── DEPOSIT TAB ──────────────────────────────────────────────────── */}
        {tab === "deposit" && (
          <div className="space-y-4">

            {/* ── BITCOIN FORK DEPOSIT UI (BSV / BTC / BCH) ── */}
            {isBitcoinFork && bitcoinDepositLoading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading deposit address…</span>
              </div>
            )}

            {isBitcoinFork && !bitcoinDepositLoading && bitcoinDepositData?.supported && (
              <div className="space-y-3">
                    {/* Mode toggle */}
                    <div className="flex gap-1 p-1 rounded-xl bg-secondary/30">
                      <button
                        onClick={() => setDepositMode("exchange")}
                        className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                          depositMode === "exchange" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                        )}
                      >Exchange Address</button>
                      <button
                        onClick={() => setDepositMode("wallet")}
                        className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                          depositMode === "wallet" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                        )}
                      >Wallet Address</button>
                    </div>

                    {depositMode === "exchange" && bitcoinDepositData.address && (
                      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-400" />
                          <p className="text-xs font-bold text-orange-400 uppercase tracking-wide">OrahDEX {bitcoinDepositData.symbol} Deposit Address</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-1">
                          Funds sent here are credited to your <strong className="text-foreground">OrahDEX trading balance</strong>.
                        </p>
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-3 bg-white rounded-xl shadow-sm">
                            <QRCodeCanvas value={bitcoinDepositData.address} size={148} level="M" includeMargin={false} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">{bitcoinDepositData.label} Network</p>
                        </div>
                        <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-orange-500/20">
                          <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">
                            {bitcoinDepositData.address}
                          </span>
                          <button onClick={() => copy(bitcoinDepositData.address!, "btc-dep-addr")} className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors">
                            {copiedId === "btc-dep-addr" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                            <p className="text-muted-foreground">Accepted asset</p>
                            <p className="font-bold">{bitcoinDepositData.symbol} (native)</p>
                          </div>
                          <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                            <p className="text-muted-foreground">Min deposit</p>
                            <p className="font-bold">{bitcoinDepositData.minDeposit} {bitcoinDepositData.symbol}</p>
                          </div>
                        </div>

                        {/* BSV verify TX */}
                        <div className="space-y-2">
                          <label className="text-sm font-semibold">I've sent funds — verify deposit</label>
                          <div className="flex gap-2">
                            <Input
                              value={bsvTxHash}
                              onChange={e => setBsvTxHash(e.target.value.trim())}
                              placeholder="BSV transaction ID (txid)"
                              className="font-mono text-xs flex-1"
                            />
                            <Button onClick={handleBsvVerify} disabled={!bsvTxHash.trim() || bsvVerifying} size="sm" className="shrink-0 gap-1.5">
                              {bsvVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Verify
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Paste the transaction ID from your BSV wallet after sending. Funds are credited instantly upon confirmation.
                          </p>
                        </div>

                        {bitcoinDepositData.explorerAddress && (
                          <a href={bitcoinDepositData.explorerAddress} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 transition-colors">
                            <ExternalLink className="w-3 h-3" /> View address on explorer
                          </a>
                        )}
                      </div>
                    )}

                    {depositMode === "wallet" && (
                      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-400" />
                          <p className="text-xs font-bold text-green-400 uppercase tracking-wide">Your Personal {bitcoinDepositData.symbol} Wallet Address</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-2">
                          Funds sent here go <strong className="text-foreground">directly to your wallet</strong> — not to your OrahDEX trading balance. Use this for personal receives.
                        </p>
                        {walletAddress && /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(walletAddress) ? (
                          <>
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-3 bg-white rounded-xl shadow-sm">
                                <QRCodeCanvas value={walletAddress} size={148} level="M" includeMargin={false} />
                              </div>
                              <p className="text-[11px] text-muted-foreground">{bitcoinDepositData.label} · P2PKH</p>
                            </div>
                            <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-green-500/20">
                              <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">{walletAddress}</span>
                              <button onClick={() => copy(walletAddress, "bsv-wallet-addr")} className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors">
                                {copiedId === "bsv-wallet-addr" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 opacity-40" />
                            <p className="text-sm text-center">Connect a {bitcoinDepositData.symbol} wallet to see your personal address.</p>
                          </div>
                        )}
                      </div>
                    )}
              </div>
            )}

            {/* ── BTC/BCH: coming soon ── */}
            {isBitcoinFork && !bitcoinDepositLoading && !bitcoinDepositData?.supported && (
              <div className="space-y-4">
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                    <p className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Exchange Deposit Coming Soon</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {bitcoinDepositData?.message ?? `${network.toUpperCase()} exchange deposits are not yet available. You can still receive ${network.toUpperCase()} to your personal wallet address below.`}
                  </p>
                </div>

                {walletAddress && (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <p className="text-xs font-bold text-green-400 uppercase tracking-wide">Your Personal Wallet Address</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 bg-white rounded-xl shadow-sm">
                        <QRCodeCanvas value={walletAddress} size={148} level="M" includeMargin={false} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{networkLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-green-500/20">
                      <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">{walletAddress}</span>
                      <button onClick={() => copy(walletAddress, "btc-wallet-addr")} className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors">
                        {copiedId === "btc-wallet-addr" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SOLANA: loading ── */}
            {isSolana && solanaDepositLoading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading Solana deposit address…</span>
              </div>
            )}

            {/* ── SOLANA: exchange address + verify TX ── */}
            {isSolana && !solanaDepositLoading && solanaDepositData?.supported && solanaDepositData.address && (
              <div className="space-y-3">
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-wide">OrahDEX Solana Deposit Address</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Funds sent here are credited to your <strong className="text-foreground">OrahDEX trading balance</strong>. Send only SOL (native) to this address.
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <QRCodeCanvas value={solanaDepositData.address} size={148} level="M" includeMargin={false} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Solana Mainnet</p>
                  </div>
                  <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-purple-500/20">
                    <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">
                      {solanaDepositData.address}
                    </span>
                    <button onClick={() => copy(solanaDepositData.address!, "sol-dep-addr")} className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors">
                      {copiedId === "sol-dep-addr" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Accepted asset</p>
                      <p className="font-bold">SOL (native)</p>
                    </div>
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Min deposit</p>
                      <p className="font-bold">{solanaDepositData.minDeposit} SOL</p>
                    </div>
                  </div>

                  {/* Solana verify TX */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">I've sent SOL — verify deposit</label>
                    <div className="flex gap-2">
                      <Input
                        value={solTxHash}
                        onChange={e => setSolTxHash(e.target.value.trim())}
                        placeholder="Solana transaction signature"
                        className="font-mono text-xs flex-1"
                      />
                      <Button onClick={handleSolVerify} disabled={!solTxHash.trim() || solVerifying} size="sm" className="shrink-0 gap-1.5">
                        {solVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Verify
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Paste the transaction signature from your Solana wallet after sending. Funds are credited instantly upon on-chain confirmation.
                    </p>
                  </div>

                  {solanaDepositData.explorerAddress && (
                    <a href={solanaDepositData.explorerAddress} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300 transition-colors">
                      <ExternalLink className="w-3 h-3" /> View address on Solscan
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ── SOLANA: not yet supported ── */}
            {isSolana && !solanaDepositLoading && !solanaDepositData?.supported && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                  <p className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Exchange Deposit Coming Soon</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {solanaDepositData?.message ?? "Solana exchange deposits are being configured. Please check back soon."}
                </p>
              </div>
            )}

            {/* ── ALTCHAIN: loading ── */}
            {isAltChain && altchainLoading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading deposit address…</span>
              </div>
            )}

            {/* ── ALTCHAIN: exchange address + 24hr credit notice ── */}
            {isAltChain && !altchainLoading && altchainData?.supported && altchainData.address && (
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wide">
                      OrahDEX {altchainData.symbol} Deposit Address
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Send <strong className="text-foreground">{altchainData.symbol}</strong> to this address. Your OrahDEX trading balance is credited within <strong className="text-foreground">24 hours</strong> after network confirmation.
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <QRCodeCanvas value={altchainData.address} size={148} level="M" includeMargin={false} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{altchainData.label ?? networkLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-blue-500/20">
                    <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">
                      {altchainData.address}
                    </span>
                    <button onClick={() => copy(altchainData.address!, "alt-dep-addr")} className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors">
                      {copiedId === "alt-dep-addr" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                  {altchainData.minDeposit && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                        <p className="text-muted-foreground">Accepted asset</p>
                        <p className="font-bold">{altchainData.symbol} (native)</p>
                      </div>
                      <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                        <p className="text-muted-foreground">Min deposit</p>
                        <p className="font-bold">{altchainData.minDeposit} {altchainData.symbol}</p>
                      </div>
                    </div>
                  )}
                  {altchainData.explorerAddress && (
                    <a href={altchainData.explorerAddress} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                      <ExternalLink className="w-3 h-3" /> View address on explorer
                    </a>
                  )}
                </div>
                <div className="flex gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Zap className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    After sending, your deposit will be automatically detected and credited to your OrahDEX balance within 24 hours. No manual verification needed.
                  </p>
                </div>
              </div>
            )}

            {/* ── ALTCHAIN: not yet supported ── */}
            {isAltChain && !altchainLoading && !altchainData?.supported && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                  <p className="text-xs font-bold text-yellow-400 uppercase tracking-wide">
                    {altchainData?.symbol ?? network.toUpperCase()} Exchange Deposits Coming Soon
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {altchainData?.message ?? `${network.toUpperCase()} exchange deposits are being set up. Please check back soon or contact support.`}
                </p>
              </div>
            )}

            {/* ── EVM WALLET ADDRESS (non-Bitcoin, non-Solana, non-AltChain assets) ── */}
            {!isNonEvm && (<>
            {/* ── WALLET ADDRESS ── */}
            {walletAddress && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <p className="text-xs font-bold text-green-400 uppercase tracking-wide">Your Personal Wallet Address</p>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Funds sent here go <strong className="text-foreground">directly to your wallet</strong> — not to your OrahDEX trading balance. Use this for personal receives.
                </p>

                {/* QR code */}
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <QRCodeCanvas
                      value={walletAddress}
                      size={148}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">EVM · Ethereum / Base / BNB Chain / all L2s</p>
                </div>

                {/* Address row */}
                <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-green-500/20">
                  <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">
                    {walletAddress}
                  </span>
                  <button
                    onClick={() => copy(walletAddress, "wallet-addr")}
                    className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors"
                  >
                    {copiedId === "wallet-addr"
                      ? <Check className="w-4 h-4 text-green-400" />
                      : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>

                <div className="flex gap-2.5 p-3 rounded-xl bg-green-500/8 border border-green-500/20">
                  <Zap className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This is your OrahDEX passkey wallet address. Anyone can send EVM tokens here directly.
                  </p>
                </div>
              </div>
            )}

            </>)}

          </div>
        )}

        {/* ── WITHDRAW TAB ─────────────────────────────────────────────────── */}
        {tab === "withdraw" && !submitted && (
          <div className="space-y-4">

            {/* Source toggle — only for passkey wallet users */}
            {isOrahWallet && (
              <div className="flex rounded-xl bg-secondary/40 border border-border p-1 gap-1">
                <button
                  onClick={() => setWithdrawSource("exchange")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                    withdrawSource === "exchange"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Exchange Balance
                </button>
                <button
                  onClick={() => setWithdrawSource("wallet")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                    withdrawSource === "wallet"
                      ? "bg-green-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  My Wallet
                </button>
              </div>
            )}

            {/* ── EXCHANGE SOURCE ── */}
            {withdrawSource === "exchange" && (
              <>
                {/* Queued withdrawal notice */}
                {hasGasError && (
                  <div className="w-full flex items-start gap-2.5 p-3 rounded-xl bg-secondary/40 border border-border text-left">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">Withdrawal queued</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Your withdrawal is queued and will be processed automatically.</p>
                    </div>
                  </div>
                )}

                {/* Balance summary */}
                <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">OrahDEX Balance</span>
                    <span className="font-bold font-mono" style={{ color }}>
                      {exchangeAvailable.toLocaleString(undefined, { maximumFractionDigits: exchangeAvailable < 0.0001 ? 8 : 6 })} {asset}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Destination network</span>
                    <span className="font-medium">{networkLabel}</span>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Amount to withdraw</label>
                  <div className="relative">
                    <Input
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className={cn("pr-16 font-mono text-base", exceedsBalance && "border-red-500/60 focus-visible:ring-red-500/30")}
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(exchangeAvailable.toFixed(exchangeAvailable < 0.0001 ? 8 : 6))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-primary hover:text-primary/80 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  {exceedsBalance && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Exceeds available OrahDEX balance
                    </p>
                  )}
                </div>

                {/* Recipient */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Withdrawal address</label>
                  <Input
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    placeholder={addressPlaceholder}
                    className={cn("font-mono text-xs", recipient.trim() && !isValidRecipient && "border-destructive focus-visible:ring-destructive")}
                  />
                  {recipient.trim() && !isValidRecipient ? (
                    <p className="text-xs text-destructive">
                      {isSolana
                        ? "Invalid Solana address — must be a 32–44 character base58 public key."
                        : isBitcoinFork
                          ? `Invalid ${network.toUpperCase()} address — expected a P2PKH address starting with 1 or 3.`
                          : isAltChain
                            ? `Invalid ${networkLabel} address format. Double-check the address from your wallet.`
                            : "Invalid EVM address — must start with 0x followed by 40 hex characters."}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {walletAddress
                        ? `Pre-filled with your connected wallet. You may change this to any valid ${networkLabel} address.`
                        : `Enter a valid ${networkLabel} address.`}
                    </p>
                  )}
                </div>

                {/* Processing notice */}
                {isManualWithdraw ? (
                  <div className="flex gap-2.5 p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20">
                    <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {networkLabel} withdrawals are processed within <strong className="text-foreground">24 hours</strong>. Your OrahDEX balance is debited immediately upon request.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2.5 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Withdrawals are processed instantly on-chain. Funds go directly to your wallet — no waiting.
                    </p>
                  </div>
                )}

                <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full gap-2 h-11">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {submitting ? "Submitting…" : `Withdraw${parsedAmount > 0 ? ` ${parsedAmount}` : ""} ${asset}`}
                </Button>
              </>
            )}

            {/* ── WALLET SOURCE (passkey wallet direct on-chain send) ── */}
            {withdrawSource === "wallet" && (
              <>
                {/* Chain selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Network</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {WALLET_CHAINS.slice(0, 4).map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setWalletSendChain(ch);
                          setWalletSendToken(WALLET_TOKENS[ch.id][0]);
                          setWalletSendBalance(null);
                          setWalletSendAmount("");
                        }}
                        className={cn(
                          "py-2 rounded-xl text-[11px] font-bold border transition-all text-center",
                          walletSendChain.id === ch.id
                            ? "border-2 text-white"
                            : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                        )}
                        style={walletSendChain.id === ch.id ? { borderColor: ch.color, backgroundColor: ch.color + "22", color: ch.color } : {}}
                      >
                        {ch.name}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {WALLET_CHAINS.slice(4).map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setWalletSendChain(ch);
                          setWalletSendToken(WALLET_TOKENS[ch.id][0]);
                          setWalletSendBalance(null);
                          setWalletSendAmount("");
                        }}
                        className={cn(
                          "py-2 rounded-xl text-[11px] font-bold border transition-all text-center",
                          walletSendChain.id === ch.id
                            ? "border-2 text-white"
                            : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                        )}
                        style={walletSendChain.id === ch.id ? { borderColor: ch.color, backgroundColor: ch.color + "22", color: ch.color } : {}}
                      >
                        {ch.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Token selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Token</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(WALLET_TOKENS[walletSendChain.id] ?? []).map(tok => (
                      <button
                        key={tok.symbol}
                        onClick={() => { setWalletSendToken(tok); setWalletSendBalance(null); setWalletSendAmount(""); }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                          walletSendToken.symbol === tok.symbol
                            ? "text-white border-2"
                            : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                        )}
                        style={walletSendToken.symbol === tok.symbol ? { borderColor: tok.color, backgroundColor: tok.color + "22", color: tok.color } : {}}
                      >
                        {tok.symbol}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wallet balance display */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Wallet Balance</p>
                    <p className="text-sm font-bold font-mono text-foreground">
                      {walletSendBalFetch
                        ? "Loading…"
                        : walletSendBalance !== null
                          ? `${walletSendBalance.toLocaleString(undefined, { maximumFractionDigits: walletSendBalance < 0.001 ? 8 : 6 })} ${walletSendToken.symbol}`
                          : "—"}
                    </p>
                  </div>
                  <button
                    onClick={() => fetchWalletBalance(walletSendChain, walletSendToken)}
                    disabled={walletSendBalFetch}
                    className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", walletSendBalFetch && "animate-spin")} />
                  </button>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Amount</label>
                  <div className="relative">
                    <Input
                      value={walletSendAmount}
                      onChange={e => setWalletSendAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className={cn(
                        "pr-16 font-mono text-base",
                        walletSendBalance !== null && parseFloat(walletSendAmount) > walletSendBalance
                          ? "border-red-500/60 focus-visible:ring-red-500/30" : ""
                      )}
                    />
                    {walletSendBalance !== null && (
                      <button
                        type="button"
                        onClick={() => setWalletSendAmount(walletSendBalance.toFixed(walletSendBalance < 0.001 ? 8 : 6))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-green-400 hover:text-green-300 px-2 py-0.5 rounded bg-green-400/10 hover:bg-green-400/20 transition-colors"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                  {walletSendBalance !== null && parseFloat(walletSendAmount) > walletSendBalance && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Exceeds wallet balance
                    </p>
                  )}
                </div>

                {/* Recipient */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Send to address</label>
                  <Input
                    value={walletSendRecipient}
                    onChange={e => setWalletSendRecipient(e.target.value)}
                    placeholder="0x… recipient address"
                    className="font-mono text-xs"
                  />
                </div>

                {/* Biometric notice */}
                <div className="flex gap-2.5 p-3 rounded-xl bg-green-500/8 border border-green-500/20">
                  <Zap className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This sends funds <strong className="text-foreground">directly from your passkey wallet</strong> on-chain. Face ID / Touch ID will authenticate the transaction — no exchange involved.
                  </p>
                </div>

                {/* Error */}
                {walletSendError && (
                  <div className="flex gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 leading-relaxed">{walletSendError}</p>
                  </div>
                )}

                {/* Success */}
                {walletSendTxHash && (
                  <div className="flex gap-2.5 p-3.5 rounded-xl bg-green-500/10 border border-green-500/25">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-green-400">Transaction sent!</p>
                      <div className="flex items-center gap-1.5 bg-background/40 rounded-lg px-2 py-1.5 border border-green-500/20">
                        <span className="font-mono text-[10px] text-green-300 flex-1 truncate">{walletSendTxHash}</span>
                        <button onClick={() => copy(walletSendTxHash, "wallet-tx")} className="shrink-0 p-0.5">
                          {copiedId === "wallet-tx" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                        </button>
                      </div>
                      <a
                        href={walletSendChain.explorer + walletSendTxHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> View on {walletSendChain.name} explorer
                      </a>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleWalletSend}
                  disabled={
                    !walletSendAmount || !walletSendRecipient.trim() || walletSending ||
                    (walletSendBalance !== null && parseFloat(walletSendAmount) > walletSendBalance)
                  }
                  className="w-full gap-2 h-11 bg-green-600 hover:bg-green-500 text-white"
                >
                  {walletSending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating…</>
                    : <><ArrowRight className="w-4 h-4" /> Send {walletSendAmount ? `${walletSendAmount} ` : ""}{walletSendToken.symbol} from Wallet</>}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── SUCCESS STATE ─────────────────────────────────────────────────── */}
        {tab === "withdraw" && submitted && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold">Sending to Your Wallet</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                <span className="font-semibold text-foreground">{parsedAmount} {asset}</span>{" "}
                is being broadcast on-chain. Check the History tab for your transaction ID once confirmed.
              </p>
            </div>
            <div className="flex gap-2 w-full pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTab("history")}>View History</Button>
              <Button className="flex-1" onClick={() => { setSubmitted(false); setAmount(""); }}>New Withdrawal</Button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-0.5">

            {/* Queued withdrawal notice */}
            {hasGasError && (
              <div className="w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-secondary/40 border border-border text-left">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Withdrawal queued</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Your withdrawal is queued and will be processed automatically.
                  </p>
                </div>
              </div>
            )}

            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <History className="w-10 h-10 opacity-30" />
                <p className="text-sm">No withdrawal history yet</p>
              </div>
            ) : (
              history.map(item => (
                <div key={item.id} className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm font-mono">
                      {item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {item.asset}
                    </span>
                    <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full border", statusStyle(item.status))}>
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.networkLabel}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                    <span className="truncate flex-1">{item.recipient}</span>
                    <button onClick={() => copy(item.recipient, `${item.id}-addr`)} className="shrink-0 p-0.5 hover:text-foreground transition-colors">
                      {copiedId === `${item.id}-addr` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {item.txid && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                      <span className="text-muted-foreground/50 shrink-0">TX</span>
                      <span className="truncate flex-1">{item.txid}</span>
                      <button onClick={() => copy(item.txid!, `${item.id}-tx`)} className="shrink-0 p-0.5 hover:text-foreground transition-colors">
                        {copiedId === `${item.id}-tx` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}

                  {item.note && (
                    item.note.startsWith("http") ? (
                      <a href={item.note} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                        <ExternalLink className="w-3 h-3" /> View on block explorer
                      </a>
                    ) : (() => {
                      const summary = summariseNote(item.note as string);
                      const isLong  = (item.note as string).length > summary.length + 2;
                      const isOpen  = expandedNote === item.id;
                      return (
                        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg px-2.5 py-2 space-y-1">
                          <p className="italic leading-relaxed">{isOpen ? item.note : summary}</p>
                          {isLong && (
                            <button onClick={() => setExpandedNote(isOpen ? null : item.id)} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
                              {isOpen ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
