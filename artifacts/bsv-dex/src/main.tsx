import "./polyfills";
import { createRoot } from "react-dom/client";
import { createElement, Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

try { applyStoredTheme(); } catch {}

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
    console.warn("[Orah] Root boundary caught error, re-rendering without WagmiProvider:", err.message);
    /* Fall back to plain App on next tick */
    setTimeout(() => root.render(createElement(App)), 0);
  }
  render() {
    if (this.state.crashed) return null; /* Briefly blank; App re-renders on next tick */
    return this.props.children;
  }
}

/* ── Inline crash fallback — shows something instead of blank white ── */
function showCrashFallback(msg: string) {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#f1f5f9;font-family:sans-serif;padding:2rem;text-align:center"><div><div style="font-size:2rem;margin-bottom:1rem">⚠️</div><h1 style="font-size:1.2rem;font-weight:700;margin-bottom:0.5rem">Something went wrong</h1><p style="font-size:0.85rem;color:#94a3b8;margin-bottom:1.5rem">${msg}</p><button onclick="location.reload()" style="padding:0.6rem 1.5rem;background:#22c55e;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem">Reload</button></div></div>`;
}

let root: ReturnType<typeof createRoot>;

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found");
  root = createRoot(rootEl);

  /* ── Step 1: Render immediately — fast first paint ── */
  root.render(createElement(App));
} catch (e) {
  console.error("[Orah] Fatal boot error:", e);
  showCrashFallback(e instanceof Error ? e.message : "Startup failed");
}

/* ── Suppress benign resize-observer noise only — do NOT suppress empty messages
   as those hide real Safari/iOS errors ── */
window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded") {
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
      if (cfg && root) {
        root.render(
          createElement(
            RootErrorBoundary,
            null,
            createElement(WagmiProvider, { config: cfg }, createElement(App))
          )
        );
      }
    } catch (e) {
      console.warn("[Orah] Reown init failed — running without WagmiProvider:", e);
      /* App is already rendered from Step 1, nothing to do */
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(initReown, { timeout: 2000 });
  } else {
    setTimeout(initReown, 50);
  }
} else {
  console.warn("[Orah] VITE_REOWN_PROJECT_ID not set — WalletConnect disabled.");
}
