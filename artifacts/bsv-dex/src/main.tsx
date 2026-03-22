import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

applyStoredTheme();

// Suppress the benign "ResizeObserver loop limit exceeded" browser error.
// It fires as a global error event (not an exception) and is caught by Vite's
// runtime-error overlay even though it has no real stack or impact.
window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
