import type { NotifType } from "@/store/useNotificationStore";

/**
 * Higher-level UX categories that group related NotifTypes together.
 * Used for filter tabs in the panel and per-category mute preferences.
 */
export type NotifCategory = "trade" | "alert" | "wallet" | "support" | "system";

export const CATEGORY_OF: Record<NotifType, NotifCategory> = {
  order_placed:        "trade",
  order_filled:        "trade",
  order_cancelled:     "trade",
  trade:               "trade",
  price_alert:         "alert",
  wallet_connected:    "wallet",
  wallet_disconnected: "wallet",
  deposit:             "wallet",
  withdrawal:          "wallet",
  bridge:              "wallet",
  liquidity:           "wallet",
  support:             "support",
  support_reply:       "support",
  info:                "system",
  warning:             "system",
  success:             "system",
  error:               "system",
};

export const CATEGORY_META: Record<NotifCategory, { label: string; description: string }> = {
  trade:   { label: "Trades & Orders", description: "Order fills, placements, cancellations, swaps" },
  alert:   { label: "Price Alerts",    description: "Triggered price targets you've set" },
  wallet:  { label: "Wallet & Funds",  description: "Connections, deposits, withdrawals, bridges" },
  support: { label: "Support",         description: "Replies from the support team" },
  system:  { label: "System",          description: "Info, warnings, errors, announcements" },
};

export const ALL_CATEGORIES: NotifCategory[] = ["trade", "alert", "wallet", "support", "system"];
