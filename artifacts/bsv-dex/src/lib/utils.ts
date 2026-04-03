import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, decimals?: number): string {
  if (!isFinite(price) || price === 0) return "0.00";
  const abs = Math.abs(price);
  let d = decimals ?? (
    abs >= 1000  ? 2 :
    abs >= 1     ? 2 :
    abs >= 0.1   ? 4 :
    abs >= 0.01  ? 4 :
    abs >= 0.001 ? 6 :
    8
  );
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(price);
}

export function formatVolume(volume: number): string {
  if (volume >= 1e9) return (volume / 1e9).toFixed(2) + "B";
  if (volume >= 1e6) return (volume / 1e6).toFixed(2) + "M";
  if (volume >= 1e3) return (volume / 1e3).toFixed(2) + "K";
  return volume.toFixed(2);
}

export function formatPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  "aura-wallet":   "OrahDEX Wallet",
  "passkey":       "Passkey Wallet",
  "handcash":      "HandCash",
  "relayx":        "RelayX",
  "panda":         "Panda Wallet",
  "sensilet":      "Sensilet",
  "twetch":        "Twetch",
  "yours":         "Yours Wallet",
  "metamask":      "MetaMask",
  "coinbase":      "Coinbase Wallet",
  "walletconnect": "WalletConnect",
  "tronlink":      "TronLink",
  "phantom":       "Phantom",
  "reown":         "WalletConnect",
};

export function getProviderLabel(provider: string | null | undefined): string {
  if (!provider) return "";
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider;
}
