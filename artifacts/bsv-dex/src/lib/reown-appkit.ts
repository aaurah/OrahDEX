import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
} from "@reown/appkit/networks";

const projectId =
  (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) ||
  "04663615251cf13fb1b043d754e7a17f";

const networks = [
  mainnet, polygon, arbitrum, optimism, base, bsc, avalanche,
  linea, zkSync, scroll, sepolia,
] as const;

export const wagmiAdapter = new WagmiAdapter({ projectId, networks });

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: "OrahDEX",
    description: "OrahDEX — Multi-chain Exchange",
    url: typeof window !== "undefined" ? window.location.origin : "https://orahdex.io",
    icons: ["/favicon.ico"],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "dark",
});

export function openReownModal(): void {
  try {
    appKit.open({ view: "Connect" });
  } catch (e) {
    console.error("[OrahDEX] Failed to open Reown modal:", e);
  }
}

export function disconnectReown(): void {
  try {
    appKit.disconnect();
  } catch { /* */ }
}

export function subscribeReownAccount(
  cb: (address: string | null, chainId: number) => void
): () => void {
  try {
    return appKit.subscribeAccount((acc: any) => {
      if (acc?.isConnected && acc?.address) {
        cb(acc.address as string, typeof acc.chainId === "number" ? acc.chainId : 1);
      } else {
        cb(null, 1);
      }
    });
  } catch {
    return () => {};
  }
}
