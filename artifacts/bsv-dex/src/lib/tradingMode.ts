export const WORKSPACE_TRADING_PAUSED_MESSAGE =
  "New orderbook trades are paused in the Replit preview while escrow recovery is checked. Existing orders remain available to review or cancel.";

export function isWorkspaceOrderbookTradingPaused(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return import.meta.env.DEV || host === "localhost" || host === "127.0.0.1" || host.endsWith(".replit.dev");
}
