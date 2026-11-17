import "./polyfills";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import "./lib/fetchRetry";
import { applyStoredTheme } from "./store/useThemeStore";
import { migrateStaleDerivedAddresses } from "./lib/walletPin";
import { wagmiAdapter } from "./lib/reown-appkit";

applyStoredTheme();
migrateStaleDerivedAddresses();

const root = createRoot(document.getElementById("root")!);

root.render(
  createElement(WagmiProvider, { config: wagmiAdapter.wagmiConfig },
    createElement(App)
  )
);

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
