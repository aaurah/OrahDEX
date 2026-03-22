import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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
