import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

applyStoredTheme();

const root = createRoot(document.getElementById("root")!);

/* ── Step 1: Render immediately — fast first paint ── */
root.render(createElement(App));

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

/* ── Step 2: Load Reown/Wagmi asynchronously, then re-render with WagmiProvider ──
   Admin pages use Wagmi hooks so WagmiProvider must be available, but it's only
   needed after the user navigates to /admin. We get it ready within ~100ms. */
const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";
if (reownProjectId) {
  const initReown = async () => {
    try {
      const [{ WagmiProvider }, { setupReown, getWagmiConfig }] = await Promise.all([
        import("wagmi"),
        import("./lib/reown"),
      ]);
      setupReown(reownProjectId);
      const cfg = getWagmiConfig();
      if (cfg) {
        /* Re-render the whole tree with WagmiProvider — React reconciles, not a full remount */
        root.render(
          createElement(WagmiProvider, { config: cfg }, createElement(App))
        );
      }
    } catch (e) {
      console.warn("[OrahDEX] Reown init failed:", e);
    }
  };

  /* Defer until after first paint — but not too long */
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(initReown, { timeout: 2000 });
  } else {
    setTimeout(initReown, 50);
  }
} else {
  console.warn("[OrahDEX] VITE_REOWN_PROJECT_ID not set — WalletConnect disabled.");
}
