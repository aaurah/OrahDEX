/**
 * nlOrderParser.ts — AI-powered natural language order intent parser.
 *
 * Uses Claude claude-sonnet-4-6 tool_use to extract structured trade intent from free-form text.
 * Supports market, limit, stop_limit, trailing_stop, TWAP, and OCO order types.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger.js";
import { isPositiveDecimalString } from "./orderIntent.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedOrderIntent =
  | { type: "market"; symbol: string; side: "buy" | "sell"; quantity?: string; quoteAmount?: string }
  | { type: "limit"; symbol: string; side: "buy" | "sell"; quantity?: string; quoteAmount?: string; price: string }
  | { type: "stop_limit"; symbol: string; side: "buy" | "sell"; quantity: string; stopPrice: string; limitPrice: string }
  | { type: "trailing_stop"; symbol: string; side: "buy" | "sell"; quantity: string; trailPercent: number }
  | { type: "twap"; symbol: string; side: "buy" | "sell"; totalAmount: string; durationMinutes: number; slices: number }
  | { type: "oco"; symbol: string; side: "buy" | "sell"; quantity: string; limitPrice: string; stopPrice: string }
  | { type: "unknown"; reason: string };

interface MarketContextEntry {
  symbol: string;
  lastPrice: number;
}

// ── Tool definition ───────────────────────────────────────────────────────────

const PARSE_TRADE_INTENT_TOOL = {
  name: "parse_trade_intent",
  description:
    "Extract structured trade intent from natural language. Return the parsed order parameters " +
    "as one of the supported order types. If the intent is ambiguous or incomplete, return type=unknown " +
    "with a clear reason explaining what information is missing.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["market", "limit", "stop_limit", "trailing_stop", "twap", "oco", "unknown"],
        description: "The order type to place",
      },
      symbol: {
        type: "string",
        description: "Trading pair symbol, e.g. BTC/USDT, ETH/USDT. Normalise to ASSET/USDT format.",
      },
      side: {
        type: "string",
        enum: ["buy", "sell"],
        description: "Order direction",
      },
      quantity: {
        type: "string",
        description: "Base asset quantity as a decimal string (e.g. '0.5'). Null if user said 'all' or is ambiguous.",
      },
      quoteAmount: {
        type: "string",
        description: "Quote currency amount as a decimal string (e.g. '500'). Provide instead of quantity when user specifies a dollar amount.",
      },
      price: {
        type: "string",
        description: "Limit price per unit as a decimal string (for limit orders)",
      },
      stopPrice: {
        type: "string",
        description: "Stop trigger price as a decimal string (for stop_limit and oco orders)",
      },
      limitPrice: {
        type: "string",
        description: "Limit price after stop triggers as a decimal string (for stop_limit and oco orders)",
      },
      trailPercent: {
        type: "number",
        description: "Trailing stop distance as a percentage of current price (for trailing_stop orders)",
      },
      totalAmount: {
        type: "string",
        description: "Total quote amount to execute via TWAP as a decimal string (for twap orders)",
      },
      durationMinutes: {
        type: "number",
        description: "Total duration for TWAP execution in minutes",
      },
      slices: {
        type: "number",
        description: "Number of equal slices to split the TWAP order into",
      },
      reason: {
        type: "string",
        description: "Explanation of why the intent is unknown or ambiguous (for type=unknown only)",
      },
    },
    required: ["type"],
  },
};

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a natural language trading instruction into a structured order intent.
 *
 * @param text           The raw user message, e.g. "buy half an eth at market"
 * @param marketContext  Live market prices so the model can resolve relative values
 */
export async function parseNaturalLanguageOrder(
  text: string,
  marketContext: MarketContextEntry[],
): Promise<ParsedOrderIntent> {
  const contextLines = marketContext
    .slice(0, 50)
    .map((m) => `${m.symbol}: $${m.lastPrice}`)
    .join(", ");

  const systemPrompt =
    "You are a trade intent parser. Extract structured order parameters from natural language. " +
    "Use the market context for current prices. If the user says 'half my ETH', quantity is null " +
    "and they must specify in the frontend. Be conservative — if intent is ambiguous, return unknown. " +
    "Normalise all symbols to ASSET/USDT format (e.g. 'eth' → 'ETH/USDT'). " +
    `Current market prices: ${contextLines || "unavailable"}.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [PARSE_TRADE_INTENT_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: text }],
    });

    // Extract the tool_use block from the response
    const toolUseBlock = response.content.find((b) => b.type === "tool_use");

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      logger.warn({ text }, "NL order parser: no tool_use block in response");
      return { type: "unknown", reason: "AI did not produce a structured response. Please rephrase your order." };
    }

    const raw = toolUseBlock.input as Record<string, unknown>;
    return buildIntent(raw);
  } catch (err) {
    logger.error({ err, text }, "NL order parser: Anthropic call failed");
    return { type: "unknown", reason: "Order parsing service temporarily unavailable. Please use the order form." };
  }
}

// ── Intent builder ────────────────────────────────────────────────────────────

function toDecimalString(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return isPositiveDecimalString(s) ? s : null;
}
function optionalDecimalString(value: unknown): string | undefined {
  const s = toDecimalString(value);
  return s ?? undefined;
}

function buildIntent(raw: Record<string, unknown>): ParsedOrderIntent {
  const type = raw.type as string | undefined;

  switch (type) {
    case "market": {
      if (!raw.symbol || !raw.side) return { type: "unknown", reason: "Missing symbol or side for market order." };
      return {
        type: "market",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        ...(optionalDecimalString(raw.quantity) !== undefined && { quantity: optionalDecimalString(raw.quantity)! }),
        ...(optionalDecimalString(raw.quoteAmount) !== undefined && { quoteAmount: optionalDecimalString(raw.quoteAmount)! }),
      };
    }

    case "limit": {
      if (!raw.symbol || !raw.side || raw.price == null) {
        return { type: "unknown", reason: "Limit orders require symbol, side, and price." };
      }
      const price = toDecimalString(raw.price);
      if (!price) return { type: "unknown", reason: "Limit price must be a positive decimal string." };
      return {
        type: "limit",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        price,
        ...(optionalDecimalString(raw.quantity) !== undefined && { quantity: optionalDecimalString(raw.quantity)! }),
        ...(optionalDecimalString(raw.quoteAmount) !== undefined && { quoteAmount: optionalDecimalString(raw.quoteAmount)! }),
      };
    }

    case "stop_limit": {
      if (!raw.symbol || !raw.side || raw.quantity == null || raw.stopPrice == null || raw.limitPrice == null) {
        return { type: "unknown", reason: "Stop-limit orders require symbol, side, quantity, stopPrice, and limitPrice." };
      }
      const quantity = toDecimalString(raw.quantity);
      const stopPrice = toDecimalString(raw.stopPrice);
      const limitPrice = toDecimalString(raw.limitPrice);
      if (!quantity || !stopPrice || !limitPrice) {
        return { type: "unknown", reason: "Stop-limit orders require positive decimal string quantity, stopPrice, and limitPrice." };
      }
      return {
        type: "stop_limit",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        quantity,
        stopPrice,
        limitPrice,
      };
    }

    case "trailing_stop": {
      if (!raw.symbol || !raw.side || raw.quantity == null || raw.trailPercent == null) {
        return { type: "unknown", reason: "Trailing stop orders require symbol, side, quantity, and trailPercent." };
      }
      const quantity = toDecimalString(raw.quantity);
      const trailPercent = Number(raw.trailPercent);
      if (!quantity || !Number.isFinite(trailPercent) || trailPercent <= 0) {
        return { type: "unknown", reason: "Trailing stop orders require positive decimal string quantity and positive trailPercent." };
      }
      return {
        type: "trailing_stop",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        quantity,
        trailPercent,
      };
    }

    case "twap": {
      if (!raw.symbol || !raw.side || raw.totalAmount == null || raw.durationMinutes == null || raw.slices == null) {
        return { type: "unknown", reason: "TWAP orders require symbol, side, totalAmount, durationMinutes, and slices." };
      }
      const totalAmount = toDecimalString(raw.totalAmount);
      const durationMinutes = Number(raw.durationMinutes);
      const slices = Math.max(2, Math.round(Number(raw.slices)));
      if (!totalAmount || !Number.isFinite(durationMinutes) || durationMinutes <= 0 || !Number.isFinite(slices) || slices < 2) {
        return { type: "unknown", reason: "TWAP orders require positive decimal string totalAmount, durationMinutes, and slices >= 2." };
      }
      return {
        type: "twap",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        totalAmount,
        durationMinutes,
        slices,
      };
    }

    case "oco": {
      if (!raw.symbol || !raw.side || raw.quantity == null || raw.limitPrice == null || raw.stopPrice == null) {
        return { type: "unknown", reason: "OCO orders require symbol, side, quantity, limitPrice, and stopPrice." };
      }
      const quantity = toDecimalString(raw.quantity);
      const limitPrice = toDecimalString(raw.limitPrice);
      const stopPrice = toDecimalString(raw.stopPrice);
      if (!quantity || !limitPrice || !stopPrice) {
        return { type: "unknown", reason: "OCO orders require positive decimal string quantity, limitPrice, and stopPrice." };
      }
      return {
        type: "oco",
        symbol: String(raw.symbol),
        side: raw.side as "buy" | "sell",
        quantity,
        limitPrice,
        stopPrice,
      };
    }

    case "unknown": {
      return { type: "unknown", reason: String(raw.reason ?? "Intent unclear. Please rephrase your order.") };
    }

    default:
      return { type: "unknown", reason: `Unrecognised order type '${type}'. Please rephrase your order.` };
  }
}

// ── Confirmation formatter ────────────────────────────────────────────────────

/**
 * Build a human-readable order confirmation string for display in the UI.
 *
 * @param intent        The parsed order intent
 * @param currentPrice  Current market price of the base asset in USD
 */
export function formatOrderConfirmation(intent: ParsedOrderIntent, currentPrice: number): string {
  if (intent.type === "unknown") return intent.reason;

  const symbol = intent.symbol;
  const side = intent.side.toUpperCase();
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const num = (s: string) => Number(s); // display-only conversion


  switch (intent.type) {
    case "market": {
      if (intent.quantity != null) {
        const estimatedValue = (num(intent.quantity) * currentPrice).toFixed(2);
        return `${side} ${intent.quantity} ${symbol} at market (~$${estimatedValue} at current price)`;
      }
      if (intent.quoteAmount != null) {
        const estimatedQty = (num(intent.quoteAmount) / currentPrice).toFixed(6);
        return `${side} ~${estimatedQty} ${symbol} for $${fmt(num(intent.quoteAmount))} at market`;
      }
      return `${side} ${symbol} at market`;
    }

    case "limit": {
      const estimatedValue =
        intent.quantity != null
          ? `~$${(num(intent.quantity) * num(intent.price)).toFixed(2)} total`
          : intent.quoteAmount != null
          ? `$${fmt(num(intent.quoteAmount))} total`
          : "";
      return `${side} ${intent.quantity ?? ""} ${symbol} at limit $${fmt(num(intent.price))}${estimatedValue ? ` (${estimatedValue})` : ""}`.trim();
    }

    case "stop_limit":
      return (
        `${side} ${intent.quantity} ${symbol} — stop at $${fmt(num(intent.stopPrice))}, ` +
        `limit at $${fmt(num(intent.limitPrice))}`
      );

    case "trailing_stop":
      return (
        `${side} ${intent.quantity} ${symbol} with ${intent.trailPercent}% trailing stop ` +
        `(trail distance ~$${fmt((currentPrice * intent.trailPercent) / 100)})`
      );

    case "twap":
      return (
        `${side} $${fmt(num(intent.totalAmount))} of ${symbol} via TWAP over ` +
        `${intent.durationMinutes} min in ${intent.slices} slices ` +
        `(~$${fmt(num(intent.totalAmount) / intent.slices)} per slice)`
      );

    case "oco":
      return (
        `${side} ${intent.quantity} ${symbol} — OCO: limit at $${fmt(num(intent.limitPrice))}, ` +
        `stop at $${fmt(num(intent.stopPrice))}`
      );
  }
}
