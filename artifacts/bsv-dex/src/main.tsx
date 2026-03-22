import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";
import { setupReown, getWagmiConfig } from "./lib/reown";

applyStoredTheme();

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

async function bootstrap() {
  const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  let projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";
  if (!projectId || projectId === "YOUR_REOWN_PROJECT_ID_HERE") {
    try {
      const res = await fetch(`${BASE}/api/settings/public`);
      if (res.ok) {
        const data = await res.json();
        projectId = data?.reown_project_id ?? "";
      }
    } catch {
      // No network — skip Reown; app still works without it
    }
  }

  if (projectId) {
    setupReown(projectId);
  }

  const wagmiConfig = getWagmiConfig();
  const root = createRoot(document.getElementById("root")!);

  if (wagmiConfig) {
    root.render(
      <WagmiProvider config={wagmiConfig}>
        <App />
      </WagmiProvider>
    );
  } else {
    root.render(<App />);
  }
}

bootstrap();
