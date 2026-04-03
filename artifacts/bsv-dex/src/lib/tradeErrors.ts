/**
 * Canonical trade error taxonomy.
 *
 * Every failure in the system maps to one of three categories:
 *   USER   — something the user must fix (balance, signature, network)
 *   PROTOCOL — the chain/contract rejected it (revert, slippage, no route)
 *   INFRA  — our infrastructure or the node failed (timeout, unreachable)
 *
 * Each code maps to a human-readable sentence shown in the UI.
 */

export type TradeErrorCategory = "USER" | "PROTOCOL" | "INFRA";

export interface TradeError {
  code: TradeErrorCode;
  category: TradeErrorCategory;
  message: string;
  detail?: string;
}

export type TradeErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ALLOWANCE"
  | "WRONG_NETWORK"
  | "REJECTED_SIGNATURE"
  | "AMOUNT_TOO_SMALL"
  | "AMOUNT_TOO_LARGE"
  | "PRICE_REQUIRED"
  | "NO_ROUTE"
  | "LOW_LIQUIDITY"
  | "SLIPPAGE_TOO_HIGH"
  | "PRICE_IMPACT_HIGH"
  | "PAIR_DISABLED"
  | "REVERT"
  | "NODE_UNREACHABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export type TradeWarningCode =
  | "LOW_LIQUIDITY"
  | "HIGH_VOLATILITY"
  | "PRICE_IMPACT_MODERATE"
  | "LARGE_ORDER";

export interface TradeWarning {
  code: TradeWarningCode;
  message: string;
}

const ERROR_MESSAGES: Record<TradeErrorCode, string> = {
  INSUFFICIENT_BALANCE:    "Your balance is too low for this order. Add funds or reduce the amount.",
  INSUFFICIENT_ALLOWANCE:  "You need to approve this token before trading. Click to approve.",
  WRONG_NETWORK:           "Your wallet is on the wrong network. Switch to the correct chain and try again.",
  REJECTED_SIGNATURE:      "You rejected the signature request. Try again when ready.",
  AMOUNT_TOO_SMALL:        "Amount is below the minimum order size for this pair.",
  AMOUNT_TOO_LARGE:        "Amount exceeds the maximum position size allowed.",
  PRICE_REQUIRED:          "A limit price is required for this order type.",
  NO_ROUTE:                "No liquidity path found for this pair right now. Try a different pair or amount.",
  LOW_LIQUIDITY:           "Liquidity is too low to fill this order. Reduce the size or try later.",
  SLIPPAGE_TOO_HIGH:       "Price would move more than your slippage tolerance. Increase slippage or reduce size.",
  PRICE_IMPACT_HIGH:       "This trade would move the market price significantly. Split into smaller orders.",
  PAIR_DISABLED:           "This trading pair is temporarily unavailable. Try another pair.",
  REVERT:                  "The transaction was reverted by the contract. The price may have moved — retry.",
  NODE_UNREACHABLE:        "The chain node is unreachable right now. Check your connection and retry.",
  TIMEOUT:                 "The transaction timed out waiting for confirmation. Check explorer for status.",
  UNKNOWN:                 "An unexpected error occurred. Please try again.",
};

const WARNING_MESSAGES: Record<TradeWarningCode, string> = {
  LOW_LIQUIDITY:          "Liquidity is thin — you may experience higher slippage than shown.",
  HIGH_VOLATILITY:        "This market is highly volatile right now. Price may move during execution.",
  PRICE_IMPACT_MODERATE:  "Your order will move the market price by more than 1%. Consider splitting.",
  LARGE_ORDER:            "Large order — consider splitting into smaller chunks for better fills.",
};

export function makeError(code: TradeErrorCode, detail?: string): TradeError {
  const category: TradeErrorCategory =
    ["INSUFFICIENT_BALANCE", "INSUFFICIENT_ALLOWANCE", "WRONG_NETWORK",
     "REJECTED_SIGNATURE", "AMOUNT_TOO_SMALL", "AMOUNT_TOO_LARGE", "PRICE_REQUIRED"].includes(code)
      ? "USER"
      : ["NO_ROUTE", "LOW_LIQUIDITY", "SLIPPAGE_TOO_HIGH", "PRICE_IMPACT_HIGH",
         "PAIR_DISABLED", "REVERT"].includes(code)
      ? "PROTOCOL"
      : "INFRA";

  return { code, category, message: ERROR_MESSAGES[code], detail };
}

export function makeWarning(code: TradeWarningCode): TradeWarning {
  return { code, message: WARNING_MESSAGES[code] };
}
