import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";
import { migrateStaleDerivedAddresses } from "./lib/walletPin";
import { wagmiAdapter } from "./lib/reown-appkit";

const STAGING =
  import.meta.env.VITE_ORAHDEX_STAGING_CATALOG === "true";

const root = createRoot(document.getElementById("root")!);

root.render(
  // AppKit and Wagmi hooks must share the adapter config so connected wallet
  // connectors are available to DEX transaction signing.
  createElement(WagmiProvider, { config: wagmiAdapter.wagmiConfig },
    createElement(App)
  )
);

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  await import("./production-main");
}

start().catch(console.error);
