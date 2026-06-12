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

function showFatalError(msg: string) {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e0f13;flex-direction:column;gap:12px;padding:24px;text-align:center;"><p style="color:#ef4444;font-size:14px;font-family:sans-serif;margin:0;max-width:320px;line-height:1.5;">${msg}</p><button onclick="location.reload()" style="margin-top:8px;padding:10px 22px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Reload</button></div>`;
}

try {
  const rootEl = document.getElementById("root")!;
  const root = createRoot(rootEl);

  if (wagmiConfig) {
    root.render(
      createElement(WagmiProvider, { config: wagmiConfig },
        createElement(App)
      )
    );
  } else {
    // Reown init failed — render without wallet provider (wallet features disabled)
    root.render(createElement(App));
  }
} catch (err) {
  console.error("[OrahDEX] Fatal render error:", err);
  const msg = err instanceof Error ? err.message : String(err);
  showFatalError(`Failed to start: ${msg}`);
}

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (e) => {
  console.warn("[OrahDEX] Unhandled promise rejection:", e.reason);
});
