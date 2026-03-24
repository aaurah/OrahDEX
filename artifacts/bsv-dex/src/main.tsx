import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";
import { setupReown, getWagmiConfig } from "./lib/reown";

applyStoredTheme();

/* Initialize Reown AppKit synchronously before render so WagmiProvider has a config */
const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";
if (reownProjectId) {
  setupReown(reownProjectId);
} else {
  console.warn("[OrahDEX] VITE_REOWN_PROJECT_ID is not set — Reown/WalletConnect will be disabled.");
}

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const wagmiConfig = getWagmiConfig();
const root = createRoot(document.getElementById("root")!);

root.render(
  wagmiConfig ? (
    <WagmiProvider config={wagmiConfig}>
      <App />
    </WagmiProvider>
  ) : (
    <App />
  )
);
