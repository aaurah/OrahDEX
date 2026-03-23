import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

applyStoredTheme();

window.addEventListener("error", (e) => {
  if (e.message === "ResizeObserver loop limit exceeded" || e.message === "") {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
