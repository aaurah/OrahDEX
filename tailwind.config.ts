import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx}", "./pages/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "#020617",
        foreground: "#f9fafb",
        card: "#020617",
        "card-foreground": "#f9fafb",
        popover: "#020617",
        "popover-foreground": "#f9fafb",
        primary: "#22c55e",
        "primary-foreground": "#020617",
        secondary: "#0f172a",
        "secondary-foreground": "#e5e7eb",
        muted: "#0b1220",
        "muted-foreground": "#9ca3af",
        accent: "#4f46e5",
        "accent-foreground": "#e5e7eb",
        border: "#1f2933",
        input: "#1f2933",
        ring: "#22c55e",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
