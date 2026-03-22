import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyStoredTheme } from "./store/useThemeStore";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(<App />);
