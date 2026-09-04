import { pgTable, uuid, text, integer, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * routing_profiles — per-pair routing configuration for the hybrid swap router.
 *
 * Rows override the router's tiered defaults (MAJOR/ALT/STABLE).
 * Missing rows fall back to the in-code tier config.
 * enabled=false disables internal routing for the pair entirely → always LE.
 *
 * To tune live without a deploy:
 *   UPDATE routing_profiles SET max_slippage_bps = 200 WHERE base_symbol = 'BSV' AND quote_symbol = 'USDT';
 */
export const routingProfilesTable = pgTable("routing_profiles", {
  id:               uuid("id").primaryKey().defaultRandom(),
  baseSymbol:       text("base_symbol").notNull(),
  quoteSymbol:      text("quote_symbol").notNull(),
  /** Maximum slippage in basis points (1 bps = 0.01%).  e.g. 150 = 1.5% */
  maxSlippageBps:   integer("max_slippage_bps").notNull().default(150),
  /** Minimum fraction (0–1) of requested amount that must be fillable internally */
  minFillFraction:  numeric("min_fill_fraction", { precision: 5, scale: 4 }).notNull().default("0.9"),
  /**
   * Optional cap on internal notional (in base asset units).
   * If amountIn > maxInternalSize → route external regardless of depth/slippage.
   * NULL = no cap.
   */
  maxInternalSize:  numeric("max_internal_size", { precision: 36, scale: 18 }),
  /**
   * If true: oracle price is required to approve internal routing.
   * Missing/stale oracle → route external.
   * If false: internal routing is allowed without a valid oracle (e.g. stable pairs).
   */
  oracleRequired:   boolean("oracle_required").notNull().default(true),
  /**
   * Feature flag: set to false to disable internal routing for this pair entirely.
   * All swaps will be sent to LetsExchange.
   */
  enabled:          boolean("enabled").notNull().default(true),
  /**
   * Allow split routing for this pair (internal fill + LE for remainder).
   * Requires the client to pass allowSplit=true on /swap/execute.
   */
  splitEnabled:     boolean("split_enabled").notNull().default(false),
  /** Notes for operators — not used by routing logic */
  notes:            text("notes"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("routing_profiles_pair_idx").on(t.baseSymbol, t.quoteSymbol),
]);

export const insertRoutingProfileSchema = createInsertSchema(routingProfilesTable).omit({ createdAt: true, updatedAt: true });
export type InsertRoutingProfile = z.infer<typeof insertRoutingProfileSchema>;
export type RoutingProfile = typeof routingProfilesTable.$inferSelect;
