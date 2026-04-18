import { createRoot } from "react-dom/client";
import { createElement, Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

applyStoredTheme();

/* ── Root-level error boundary that keeps the app alive even if WagmiProvider crashes ── */
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { crashed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[OrahDEX] Root boundary caught error, re-rendering without WagmiProvider:", err.message);
    /* Fall back to plain App on next tick */
    setTimeout(() => root.render(createElement(App)), 0);
  }
  render() {
    if (this.state.crashed) return null; /* Briefly blank; App re-renders on next tick */
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root")!);

/* ── Step 1: Render immediately — fast first paint ── */
root.render(createElement(App));

/* ── Suppress benign resize-observer noise ── */
window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

/* ── Step 2: Load Reown/Wagmi asynchronously, then re-render with WagmiProvider ──
   If WagmiProvider throws for any reason (mobile Safari quirks, Wagmi init failure, etc.)
   the RootErrorBoundary catches it and falls back to the plain App render. ── */
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
        root.render(
          createElement(
            RootErrorBoundary,
            null,
            createElement(WagmiProvider, { config: cfg }, createElement(App))
          )
        );
      }
    } catch (e) {
      console.warn("[OrahDEX] Reown init failed — running without WagmiProvider:", e);
      /* App is already rendered from Step 1, nothing to do */
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(initReown, { timeout: 2000 });
  } else {
    setTimeout(initReown, 50);
  }
} else {
  console.warn("[OrahDEX] VITE_REOWN_PROJECT_ID not set — WalletConnect disabled.");
}
