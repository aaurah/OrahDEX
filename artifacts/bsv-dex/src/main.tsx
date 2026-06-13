import "./polyfills";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";
import { migrateStaleDerivedAddresses } from "./lib/walletPin";
import { wagmiConfig } from "./lib/reown";

applyStoredTheme();
migrateStaleDerivedAddresses();

const root = createRoot(document.getElementById("root")!);

const effectiveConfig = wagmiConfig ?? createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

root.render(
  createElement(WagmiProvider, { config: effectiveConfig },
    createElement(App)
  )
);

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
