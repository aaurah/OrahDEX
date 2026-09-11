import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";

export type WalletNetwork = "bsv" | "evm";

export interface ConnectedWallet {
  address: string;
  provider: string;
  network: WalletNetwork;
  balance?: string;
}

export interface ExchangeBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  available: number;
  valueUSD: number;
  price: number;
  change24hPercent: number;
  pnl24h: number;
}

interface WalletContextType {
  wallet: ConnectedWallet | null;
  isConnecting: boolean;
  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
  // Exchange balances
  exchangeBalances: ExchangeBalance[];
  isLoadingBalances: boolean;
  totalValueUSD: number;
  totalPnlPercent: number;
  refreshBalance: () => Promise<void>;
  // PIN / security
  pinEnabled: boolean;
  isLocked: boolean;
  hasBiometrics: boolean;
  biometricsEnabled: boolean;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  clearPin: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  toggleBiometrics: (enabled: boolean) => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
}

const STORAGE_KEYS = {
  WALLET: "aura_wallet",
  PIN_HASH: "aura_pin_hash",
  PIN_SALT: "aura_pin_salt",
  PIN_ENABLED: "aura_pin_enabled",
  BIOMETRICS_ENABLED: "aura_biometrics_enabled",
} as const;

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const COIN_COLORS: Record<string, string> = {
  BSV: "#EAB308", BTC: "#F97316", ETH: "#8B5CF6", SOL: "#06B6D4",
  USDT: "#22C55E", USDC: "#3B82F6", XRP: "#3B82F6", BNB: "#EAB308",
};

export function getCoinColor(asset: string): string {
  return COIN_COLORS[asset] ?? "#A78BFA";
}

/**
 * Derives a PIN hash using 100 000 rounds of SHA-256 (poor-man's PBKDF2).
 * Each round includes the round index and the salt to prevent pre-computation.
 * expo-crypto provides a native SHA-256 implementation; the iteration count
 * makes brute-forcing all 1 000 000 six-digit PINs non-trivial even with
 * physical device access.
 */
async function hashPin(pin: string, salt: string): Promise<string> {
  let current = `${pin}:${salt}`;
  const ROUNDS = 100_000;
  for (let i = 0; i < ROUNDS; i++) {
    current = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${current}:${i}:${salt}`,
    );
  }
  return current;
}

function genSalt(): string {
  // Use Crypto.getRandomValues for a high-entropy salt
  const bytes = new Uint8Array(16);
  Crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {},
  exchangeBalances: [],
  isLoadingBalances: false,
  totalValueUSD: 0,
  totalPnlPercent: 0,
  refreshBalance: async () => {},
  pinEnabled: false,
  isLocked: false,
  hasBiometrics: false,
  biometricsEnabled: false,
  setPin: async () => {},
  verifyPin: async () => false,
  clearPin: async () => {},
  unlock: () => {},
  lock: () => {},
  toggleBiometrics: async () => {},
  authenticateWithBiometrics: async () => false,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [isConnecting] = useState(false);
  const [exchangeBalances, setExchangeBalances] = useState<ExchangeBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [totalValueUSD, setTotalValueUSD] = useState(0);
  const [totalPnlPercent, setTotalPnlPercent] = useState(0);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinSalt, setPinSalt] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  // Keep a ref so AppState listener can read current wallet without stale closure
  const walletRef = useRef<ConnectedWallet | null>(null);
  const pinEnabledRef = useRef(false);

  // Detect device biometric capability once
  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then((has) => {
      if (has) LocalAuthentication.isEnrolledAsync().then(setHasBiometrics);
    });
  }, []);

  // Hydrate persisted state on mount
  useEffect(() => {
    (async () => {
      const [rawWallet, storedHash, storedSalt, storedPinEnabled, storedBio] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.WALLET),
          AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH),
          AsyncStorage.getItem(STORAGE_KEYS.PIN_SALT),
          AsyncStorage.getItem(STORAGE_KEYS.PIN_ENABLED),
          AsyncStorage.getItem(STORAGE_KEYS.BIOMETRICS_ENABLED),
        ]);

      if (rawWallet) {
        try {
          const w: ConnectedWallet = JSON.parse(rawWallet);
          setWallet(w);
          walletRef.current = w;
          if (storedPinEnabled === "true" && storedHash) {
            setIsLocked(true);
          }
        } catch {
          // corrupted storage — ignore
        }
      }
      if (storedHash) setPinHash(storedHash);
      if (storedSalt) setPinSalt(storedSalt);
      if (storedPinEnabled === "true") {
        setPinEnabled(true);
        pinEnabledRef.current = true;
      }
      if (storedBio === "true") setBiometricsEnabled(true);
    })();
  }, []);

  // Auto-lock when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if ((state === "background" || state === "inactive") && pinEnabledRef.current && walletRef.current) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Fetch exchange balance from the API server
  const refreshBalance = useCallback(async () => {
    const w = walletRef.current;
    if (!w) return;
    setIsLoadingBalances(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/portfolio?walletAddress=${encodeURIComponent(w.address)}`
      );
      if (r.ok) {
        const data = await r.json();
        setExchangeBalances(data.balances ?? []);
        setTotalValueUSD(data.totalValueUSD ?? 0);
        setTotalPnlPercent(data.totalPnlPercent ?? 0);
      }
    } catch {
      // silently ignore – show stale data
    } finally {
      setIsLoadingBalances(false);
    }
  }, []);

  // Re-fetch whenever wallet changes
  useEffect(() => {
    if (wallet) {
      walletRef.current = wallet;
      refreshBalance();
    } else {
      setExchangeBalances([]);
      setTotalValueUSD(0);
      setTotalPnlPercent(0);
    }
  }, [wallet, refreshBalance]);

  const connect = useCallback((w: ConnectedWallet) => {
    setWallet(w);
    walletRef.current = w;
    AsyncStorage.setItem(STORAGE_KEYS.WALLET, JSON.stringify(w));
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    walletRef.current = null;
    setExchangeBalances([]);
    setTotalValueUSD(0);
    setTotalPnlPercent(0);
    setIsLocked(false);
    setPinEnabled(false);
    pinEnabledRef.current = false;
    setPinHash(null);
    setPinSalt(null);
    setBiometricsEnabled(false);
    AsyncStorage.removeItem(STORAGE_KEYS.WALLET);
    AsyncStorage.removeItem(STORAGE_KEYS.PIN_HASH);
    AsyncStorage.removeItem(STORAGE_KEYS.PIN_SALT);
    AsyncStorage.removeItem(STORAGE_KEYS.PIN_ENABLED);
    AsyncStorage.removeItem(STORAGE_KEYS.BIOMETRICS_ENABLED);
  }, []);

  const setPin = useCallback(async (pin: string) => {
    const salt = genSalt();
    const hash = await hashPin(pin, salt);
    setPinHash(hash);
    setPinSalt(salt);
    setPinEnabled(true);
    pinEnabledRef.current = true;
    setIsLocked(false);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH, hash),
      AsyncStorage.setItem(STORAGE_KEYS.PIN_SALT, salt),
      AsyncStorage.setItem(STORAGE_KEYS.PIN_ENABLED, "true"),
    ]);
  }, []);

  const verifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!pinHash || !pinSalt) return false;
      const candidate = await hashPin(pin, pinSalt);
      return candidate === pinHash;
    },
    [pinHash, pinSalt]
  );

  const clearPin = useCallback(async () => {
    setPinEnabled(false);
    pinEnabledRef.current = false;
    setPinHash(null);
    setPinSalt(null);
    setIsLocked(false);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.PIN_HASH),
      AsyncStorage.removeItem(STORAGE_KEYS.PIN_SALT),
      AsyncStorage.setItem(STORAGE_KEYS.PIN_ENABLED, "false"),
    ]);
  }, []);

  const unlock = useCallback(() => setIsLocked(false), []);

  const lock = useCallback(() => {
    if (pinEnabledRef.current) setIsLocked(true);
  }, []);

  const toggleBiometrics = useCallback(async (enabled: boolean) => {
    setBiometricsEnabled(enabled);
    await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRICS_ENABLED, enabled ? "true" : "false");
  }, []);

  const authenticateWithBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to unlock Orah DEX",
        fallbackLabel: "Use PIN",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isConnecting,
        connect,
        disconnect,
        exchangeBalances,
        isLoadingBalances,
        totalValueUSD,
        totalPnlPercent,
        refreshBalance,
        pinEnabled,
        isLocked,
        hasBiometrics,
        biometricsEnabled,
        setPin,
        verifyPin,
        clearPin,
        unlock,
        lock,
        toggleBiometrics,
        authenticateWithBiometrics,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
