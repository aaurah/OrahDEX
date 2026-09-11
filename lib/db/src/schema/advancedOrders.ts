import { pgTable, text, numeric, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ocoOrdersTable = pgTable("oco_orders", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  quantity: numeric("quantity", { precision: 36, scale: 18 }).notNull(),
  limitPrice: numeric("limit_price", { precision: 36, scale: 18 }).notNull(),
  stopPrice: numeric("stop_price", { precision: 36, scale: 18 }).notNull(),
  limitOrderId: text("limit_order_id").notNull(),
  stopOrderId: text("stop_order_id").notNull(),
  status: text("status").notNull().default("open"),
  networkType: text("network_type").default("evm"),
  chainId: integer("chain_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("oco_orders_wallet_idx").on(t.walletAddress),
  index("oco_orders_status_idx").on(t.status),
]);

export const insertOcoOrderSchema = createInsertSchema(ocoOrdersTable).omit({ createdAt: true });
export type InsertOcoOrder = z.infer<typeof insertOcoOrderSchema>;
export type OcoOrder = typeof ocoOrdersTable.$inferSelect;

export const trailingStopOrdersTable = pgTable("trailing_stop_orders", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  quantity: numeric("quantity", { precision: 36, scale: 18 }).notNull(),
  trailPercent: numeric("trail_percent", { precision: 10, scale: 4 }).notNull(),
  activationPrice: numeric("activation_price", { precision: 36, scale: 18 }),
  currentStopPrice: numeric("current_stop_price", { precision: 36, scale: 18 }).notNull(),
  highWatermark: numeric("high_watermark", { precision: 36, scale: 18 }).notNull(),
  lowWatermark: numeric("low_watermark", { precision: 36, scale: 18 }).notNull(),
  status: text("status").notNull().default("active"),
  triggeredOrderId: text("triggered_order_id"),
  networkType: text("network_type").default("evm"),
  chainId: integer("chain_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("trailing_stop_wallet_idx").on(t.walletAddress),
  index("trailing_stop_status_idx").on(t.status),
]);

export const insertTrailingStopOrderSchema = createInsertSchema(trailingStopOrdersTable).omit({ createdAt: true, updatedAt: true });
export type InsertTrailingStopOrder = z.infer<typeof insertTrailingStopOrderSchema>;
export type TrailingStopOrder = typeof trailingStopOrdersTable.$inferSelect;

export const twapOrdersTable = pgTable("twap_orders", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  totalQuantity: numeric("total_quantity", { precision: 36, scale: 18 }).notNull(),
  filledQuantity: numeric("filled_quantity", { precision: 36, scale: 18 }).notNull().default("0"),
  slices: integer("slices").notNull(),
  completedSlices: integer("completed_slices").notNull().default(0),
  intervalSeconds: integer("interval_seconds").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  maxSlippagePercent: numeric("max_slippage_percent", { precision: 10, scale: 4 }).notNull().default("1.0"),
  averageFillPrice: numeric("average_fill_price", { precision: 36, scale: 18 }),
  status: text("status").notNull().default("active"),
  networkType: text("network_type").default("evm"),
  chainId: integer("chain_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("twap_orders_wallet_idx").on(t.walletAddress),
  index("twap_orders_status_idx").on(t.status),
]);

export const insertTwapOrderSchema = createInsertSchema(twapOrdersTable).omit({ createdAt: true });
export type InsertTwapOrder = z.infer<typeof insertTwapOrderSchema>;
export type TwapOrder = typeof twapOrdersTable.$inferSelect;

export const icebergOrdersTable = pgTable("iceberg_orders", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 36, scale: 18 }).notNull(),
  totalQuantity: numeric("total_quantity", { precision: 36, scale: 18 }).notNull(),
  filledQuantity: numeric("filled_quantity", { precision: 36, scale: 18 }).notNull().default("0"),
  visibleQuantity: numeric("visible_quantity", { precision: 36, scale: 18 }).notNull(),
  activeOrderId: text("active_order_id"),
  status: text("status").notNull().default("active"),
  networkType: text("network_type").default("evm"),
  chainId: integer("chain_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("iceberg_orders_wallet_idx").on(t.walletAddress),
  index("iceberg_orders_status_idx").on(t.status),
]);

export const insertIcebergOrderSchema = createInsertSchema(icebergOrdersTable).omit({ createdAt: true });
export type InsertIcebergOrder = z.infer<typeof insertIcebergOrderSchema>;
export type IcebergOrder = typeof icebergOrdersTable.$inferSelect;
