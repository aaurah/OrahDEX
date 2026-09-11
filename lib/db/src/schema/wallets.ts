import { pgTable, text, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";

export const walletsTable = pgTable("wallets", {
  address:         text("address").primaryKey(),
  networkType:     text("network_type").default("evm"),
  provider:        text("provider"),
  chainId:         text("chain_id"),
  status:          text("status").default("active"),
  country:         text("country").default("US"),
  verified:        text("verified").default("false"),
  balanceOverride: numeric("balance_override", { precision: 20, scale: 8 }),
  firstSeen:       timestamp("first_seen").defaultNow().notNull(),
  lastSeen:        timestamp("last_seen").defaultNow().notNull(),
});

export type Wallet = typeof walletsTable.$inferSelect;

// ── Quantum-resistant key registry ────────────────────────────────────────────
// Stores forward-compatible CRYSTALS-Dilithium2 public keys associated with
// EVM/BSV wallet addresses. Ownership is proven via the existing ECDSA signature
// at registration time, making this a commitment store for future post-quantum
// authentication schemes.

export const quantumKeysTable = pgTable(
  "quantum_keys",
  {
    id:            text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    publicKey:     text("public_key").notNull(),
    algorithm:     text("algorithm").notNull().default("dilithium2"),
    createdAt:     timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quantum_keys_wallet_uidx").on(t.walletAddress)],
);

export type QuantumKey = typeof quantumKeysTable.$inferSelect;
