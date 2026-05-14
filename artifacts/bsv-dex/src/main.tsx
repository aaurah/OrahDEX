import "./polyfills";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";
import { migrateStaleDerivedAddresses } from "./lib/walletPin";
import { wagmiConfig } from "./lib/reown";

applyStoredTheme();
migrateStaleDerivedAddresses();

const root = createRoot(document.getElementById("root")!);

root.render(
  createElement(WagmiProvider, { config: wagmiConfig },
    createElement(App)
  )
);

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
