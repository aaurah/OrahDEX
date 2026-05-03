import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FiatCurrency {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  rateToUsd: number;
}

export const FIAT_CURRENCIES: FiatCurrency[] = [
  { code: "USD", name: "US Dollar",          symbol: "$",   flag: "🇺🇸", rateToUsd: 1 },
  { code: "EUR", name: "Euro",               symbol: "€",   flag: "🇪🇺", rateToUsd: 0.925 },
  { code: "GBP", name: "British Pound",      symbol: "£",   flag: "🇬🇧", rateToUsd: 0.792 },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",   flag: "🇯🇵", rateToUsd: 149.5 },
  { code: "CNY", name: "Chinese Yuan",       symbol: "¥",   flag: "🇨🇳", rateToUsd: 7.24 },
  { code: "KRW", name: "South Korean Won",   symbol: "₩",   flag: "🇰🇷", rateToUsd: 1340 },
  { code: "INR", name: "Indian Rupee",       symbol: "₹",   flag: "🇮🇳", rateToUsd: 83.5 },
  { code: "AUD", name: "Australian Dollar",  symbol: "A$",  flag: "🇦🇺", rateToUsd: 1.535 },
  { code: "CAD", name: "Canadian Dollar",    symbol: "C$",  flag: "🇨🇦", rateToUsd: 1.355 },
  { code: "CHF", name: "Swiss Franc",        symbol: "Fr",  flag: "🇨🇭", rateToUsd: 0.900 },
  { code: "HKD", name: "Hong Kong Dollar",   symbol: "HK$", flag: "🇭🇰", rateToUsd: 7.82 },
  { code: "SGD", name: "Singapore Dollar",   symbol: "S$",  flag: "🇸🇬", rateToUsd: 1.348 },
  { code: "AED", name: "UAE Dirham",         symbol: "د.إ", flag: "🇦🇪", rateToUsd: 3.672 },
  { code: "SAR", name: "Saudi Riyal",        symbol: "﷼",   flag: "🇸🇦", rateToUsd: 3.750 },
  { code: "BRL", name: "Brazilian Real",     symbol: "R$",  flag: "🇧🇷", rateToUsd: 5.05 },
  { code: "MXN", name: "Mexican Peso",       symbol: "$",   flag: "🇲🇽", rateToUsd: 17.15 },
  { code: "RUB", name: "Russian Ruble",      symbol: "₽",   flag: "🇷🇺", rateToUsd: 88.5 },
  { code: "TRY", name: "Turkish Lira",       symbol: "₺",   flag: "🇹🇷", rateToUsd: 32.5 },
  { code: "ZAR", name: "South African Rand", symbol: "R",   flag: "🇿🇦", rateToUsd: 18.6 },
  { code: "SEK", name: "Swedish Krona",      symbol: "kr",  flag: "🇸🇪", rateToUsd: 10.52 },
  { code: "NOK", name: "Norwegian Krone",    symbol: "kr",  flag: "🇳🇴", rateToUsd: 10.55 },
  { code: "DKK", name: "Danish Krone",       symbol: "kr",  flag: "🇩🇰", rateToUsd: 6.90 },
  { code: "PLN", name: "Polish Zloty",       symbol: "zł",  flag: "🇵🇱", rateToUsd: 4.05 },
  { code: "CZK", name: "Czech Koruna",       symbol: "Kč",  flag: "🇨🇿", rateToUsd: 23.2 },
  { code: "HUF", name: "Hungarian Forint",   symbol: "Ft",  flag: "🇭🇺", rateToUsd: 360 },
  { code: "RON", name: "Romanian Leu",       symbol: "lei", flag: "🇷🇴", rateToUsd: 4.60 },
  { code: "IDR", name: "Indonesian Rupiah",  symbol: "Rp",  flag: "🇮🇩", rateToUsd: 15800 },
  { code: "MYR", name: "Malaysian Ringgit",  symbol: "RM",  flag: "🇲🇾", rateToUsd: 4.72 },
  { code: "THB", name: "Thai Baht",          symbol: "฿",   flag: "🇹🇭", rateToUsd: 35.4 },
  { code: "PHP", name: "Philippine Peso",    symbol: "₱",   flag: "🇵🇭", rateToUsd: 56.5 },
  { code: "VND", name: "Vietnamese Dong",    symbol: "₫",   flag: "🇻🇳", rateToUsd: 24500 },
  { code: "PKR", name: "Pakistani Rupee",    symbol: "₨",   flag: "🇵🇰", rateToUsd: 278 },
  { code: "BDT", name: "Bangladeshi Taka",   symbol: "৳",   flag: "🇧🇩", rateToUsd: 110 },
  { code: "NGN", name: "Nigerian Naira",     symbol: "₦",   flag: "🇳🇬", rateToUsd: 1520 },
  { code: "EGP", name: "Egyptian Pound",     symbol: "£",   flag: "🇪🇬", rateToUsd: 48.5 },
  { code: "GHS", name: "Ghanaian Cedi",      symbol: "₵",   flag: "🇬🇭", rateToUsd: 12.8 },
  { code: "KES", name: "Kenyan Shilling",    symbol: "KSh", flag: "🇰🇪", rateToUsd: 129 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿", rateToUsd: 1.635 },
  { code: "ILS", name: "Israeli Shekel",     symbol: "₪",   flag: "🇮🇱", rateToUsd: 3.65 },
  { code: "CLP", name: "Chilean Peso",       symbol: "$",   flag: "🇨🇱", rateToUsd: 900 },
  { code: "COP", name: "Colombian Peso",     symbol: "$",   flag: "🇨🇴", rateToUsd: 3900 },
  { code: "PEN", name: "Peruvian Sol",       symbol: "S/.", flag: "🇵🇪", rateToUsd: 3.72 },
  { code: "ARS", name: "Argentine Peso",     symbol: "$",   flag: "🇦🇷", rateToUsd: 850 },
  { code: "UAH", name: "Ukrainian Hryvnia",  symbol: "₴",   flag: "🇺🇦", rateToUsd: 39.5 },
  { code: "TWD", name: "Taiwan Dollar",      symbol: "NT$", flag: "🇹🇼", rateToUsd: 31.8 },
  { code: "QAR", name: "Qatari Riyal",       symbol: "QR",  flag: "🇶🇦", rateToUsd: 3.640 },
  { code: "KWD", name: "Kuwaiti Dinar",      symbol: "KD",  flag: "🇰🇼", rateToUsd: 0.308 },
  { code: "BHD", name: "Bahraini Dinar",     symbol: "BD",  flag: "🇧🇭", rateToUsd: 0.377 },
  { code: "OMR", name: "Omani Rial",         symbol: "RO",  flag: "🇴🇲", rateToUsd: 0.385 },
  { code: "JOD", name: "Jordanian Dinar",    symbol: "JD",  flag: "🇯🇴", rateToUsd: 0.709 },
  { code: "MAD", name: "Moroccan Dirham",    symbol: "MAD", flag: "🇲🇦", rateToUsd: 10.2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", flag: "🇹🇿", rateToUsd: 2580 },
];

export const CRYPTO_QUOTE_CURRENCIES = [
  { code: "USDT", name: "Tether",       symbol: "₮", flag: "💵", rateToUsd: 1 },
  { code: "USDC", name: "USD Coin",     symbol: "$", flag: "💵", rateToUsd: 1 },
  { code: "BTC",  name: "Bitcoin",      symbol: "₿", flag: "🟠", rateToUsd: 1 / 83000 },
  { code: "ETH",  name: "Ethereum",     symbol: "Ξ", flag: "🔷", rateToUsd: 1 / 1800 },
  { code: "BNB",  name: "BNB",          symbol: "B", flag: "🟡", rateToUsd: 1 / 580 },
  { code: "SOL",  name: "Solana",       symbol: "◎", flag: "🔵", rateToUsd: 1 / 130 },
  { code: "BSV",  name: "Bitcoin SV",   symbol: "Ƀ", flag: "🟡", rateToUsd: 1 / 55 },
];

export type QuoteCurrencyCode = string;

interface SettingsState {
  quoteCurrency: QuoteCurrencyCode;
  setQuoteCurrency: (code: QuoteCurrencyCode) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  // Browser/OS push notifications when tab is in background.
  desktopEnabled: boolean;
  setDesktopEnabled: (v: boolean) => void;
  // Do Not Disturb: timestamp until which sound/vibration/desktop are silenced.
  // null = off, Number.MAX_SAFE_INTEGER = indefinite.
  dndUntil: number | null;
  setDndUntil: (v: number | null) => void;
  // Categories the user has muted (no FX, no desktop, still appear in feed).
  mutedCategories: string[];
  setMutedCategories: (v: string[]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      quoteCurrency: "USDT",
      setQuoteCurrency: (code) => set({ quoteCurrency: code }),
      soundEnabled: true,
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      hapticsEnabled: true,
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      desktopEnabled: false,
      setDesktopEnabled: (v) => set({ desktopEnabled: v }),
      dndUntil: null,
      setDndUntil: (v) => set({ dndUntil: v }),
      mutedCategories: [],
      setMutedCategories: (v) => set({ mutedCategories: v }),
    }),
    { name: "orahdex-settings-v1" }
  )
);

export function getFxRate(code: string): number {
  const fiat = FIAT_CURRENCIES.find(c => c.code === code);
  if (fiat) return fiat.rateToUsd;
  const crypto = CRYPTO_QUOTE_CURRENCIES.find(c => c.code === code);
  if (crypto) return crypto.rateToUsd;
  return 1;
}

export function getCurrencySymbol(code: string): string {
  const fiat = FIAT_CURRENCIES.find(c => c.code === code);
  if (fiat) return fiat.symbol;
  const crypto = CRYPTO_QUOTE_CURRENCIES.find(c => c.code === code);
  if (crypto) return crypto.symbol;
  return "$";
}

export function convertFromUsd(usdAmount: number, code: string): number {
  const rate = getFxRate(code);
  if (code === "BTC" || code === "ETH" || code === "BNB" || code === "SOL" || code === "BSV") {
    return usdAmount * rate;
  }
  return usdAmount * rate;
}

export function formatQuoteAmount(usdAmount: number, code: string, compact = false): string {
  const converted = convertFromUsd(usdAmount, code);
  const sym = getCurrencySymbol(code);
  const isCrypto = CRYPTO_QUOTE_CURRENCIES.some(c => c.code === code);

  if (isCrypto) {
    if (converted >= 1000) return `${sym}${converted.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    if (converted >= 1)    return `${sym}${converted.toFixed(4)}`;
    if (converted >= 0.01) return `${sym}${converted.toFixed(6)}`;
    return `${sym}${converted.toFixed(8)}`;
  }

  if (compact) {
    if (converted >= 1e12) return `${sym}${(converted / 1e12).toFixed(2)}T`;
    if (converted >= 1e9)  return `${sym}${(converted / 1e9).toFixed(2)}B`;
    if (converted >= 1e6)  return `${sym}${(converted / 1e6).toFixed(1)}M`;
    if (converted >= 1e3)  return `${sym}${(converted / 1e3).toFixed(1)}K`;
  }
  if (converted >= 10000) return `${sym}${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (converted >= 100)   return `${sym}${converted.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (converted >= 1)     return `${sym}${converted.toFixed(2)}`;
  if (converted >= 0.01)  return `${sym}${converted.toFixed(4)}`;
  return `${sym}${converted.toFixed(6)}`;
}
