import { pgTable, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const overlayRecordsTable = pgTable("overlay_records", {
  id:          text("id").primaryKey(),
  txid:        text("txid").notNull(),
  blockHeight: integer("block_height"),
  orderId:     text("order_id"),
  secretHash:  text("secret_hash"),
  amountsJson: text("amounts_json"),
  evmAddress:  text("evm_address"),
  rawPayload:  text("raw_payload"),
  indexedAt:   timestamp("indexed_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("overlay_records_txid_idx").on(t.txid),
  index("overlay_records_order_id_idx").on(t.orderId),
  index("overlay_records_block_height_idx").on(t.blockHeight),
  index("overlay_records_indexed_at_idx").on(t.indexedAt),
]);
