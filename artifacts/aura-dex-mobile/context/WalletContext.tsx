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
  verifyPin: (pin: string) => boolean;
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
 * FNV-1a based PIN hash. Not cryptographically strong enough for
 * server-side use, but adequate for a local device PIN lock where
 * the salt lives on the same device. Production apps should use
 * expo-crypto / PBKDF2.
 */
function hashPin(pin: string, salt: string): string {
  const combined = pin + salt + pin.split("").reverse().join("");
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < combined.length; i++) {
    h = (h ^ combined.charCodeAt(i)) >>> 0;
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  for (let i = 0; i < salt.length; i++) {
    h = (h ^ salt.charCodeAt(i)) >>> 0;
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16).padStart(8, "0") + btoa(salt).slice(0, 8);
}

function genSalt(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  verifyPin: () => false,
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
    const hash = hashPin(pin, salt);
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
    (pin: string): boolean => {
      if (!pinHash || !pinSalt) return false;
      return hashPin(pin, pinSalt) === pinHash;
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
