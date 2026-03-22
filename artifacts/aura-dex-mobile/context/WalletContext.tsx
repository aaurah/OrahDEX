import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";

export type WalletNetwork = "bsv" | "evm";

export interface ConnectedWallet {
  address: string;
  provider: string;
  network: WalletNetwork;
  balance?: string;
}

interface WalletContextType {
  wallet: ConnectedWallet | null;
  isConnecting: boolean;
  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("aura_wallet").then((raw) => {
      if (raw) {
        try {
          setWallet(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  const connect = useCallback((w: ConnectedWallet) => {
    setWallet(w);
    AsyncStorage.setItem("aura_wallet", JSON.stringify(w));
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    AsyncStorage.removeItem("aura_wallet");
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, isConnecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
