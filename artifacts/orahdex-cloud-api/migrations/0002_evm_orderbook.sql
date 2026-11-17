-- Additive, staging-only orderbook schema. Existing market rows are untouched.
CREATE TABLE IF NOT EXISTS evm_orders (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL CHECK (order_type = 'limit'),
  price TEXT NOT NULL,
  quantity TEXT NOT NULL,
  filled_quantity TEXT NOT NULL DEFAULT '0',
  remaining_quantity TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'settling', 'filled', 'cancelled')),
  nonce TEXT NOT NULL,
  auth_expiry INTEGER NOT NULL,
  order_expiry INTEGER NOT NULL,
  signature TEXT NOT NULL,
  order_key TEXT NOT NULL UNIQUE,
  escrow_address TEXT NOT NULL,
  lock_tx_hash TEXT NOT NULL UNIQUE,
  cancel_tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (wallet_address, nonce)
);

CREATE INDEX IF NOT EXISTS idx_evm_orders_market_book
  ON evm_orders(symbol, status, side, order_expiry);
CREATE INDEX IF NOT EXISTS idx_evm_orders_wallet_created
  ON evm_orders(wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS evm_settlements (
  id TEXT PRIMARY KEY NOT NULL,
  buy_order_id TEXT NOT NULL,
  sell_order_id TEXT NOT NULL,
  base_amount TEXT NOT NULL,
  gross_quote_amount TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'submitted', 'finalizing', 'confirmed', 'failed', 'needs_review')),
  tx_hash TEXT,
  fee_amount TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (buy_order_id) REFERENCES evm_orders(id),
  FOREIGN KEY (sell_order_id) REFERENCES evm_orders(id)
);

CREATE TABLE IF NOT EXISTS evm_order_claims (
  settlement_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  PRIMARY KEY (settlement_id, order_id),
  FOREIGN KEY (settlement_id) REFERENCES evm_settlements(id),
  FOREIGN KEY (order_id) REFERENCES evm_orders(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evm_order_one_active_settlement
  ON evm_order_claims(order_id)
  WHERE status IN ('pending', 'submitted');

CREATE TABLE IF NOT EXISTS evm_fills (
  settlement_id TEXT PRIMARY KEY NOT NULL,
  symbol TEXT NOT NULL,
  buy_order_id TEXT NOT NULL,
  sell_order_id TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  price TEXT NOT NULL,
  quantity TEXT NOT NULL,
  quote_amount TEXT NOT NULL,
  fee_amount TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (settlement_id) REFERENCES evm_settlements(id)
);

CREATE INDEX IF NOT EXISTS idx_evm_fills_market_created
  ON evm_fills(symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS evm_recovery_rate_limits (
  wallet_address TEXT PRIMARY KEY NOT NULL,
  last_run INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS evm_order_claim_requires_open_order
BEFORE INSERT ON evm_order_claims
FOR EACH ROW
WHEN COALESCE((SELECT status FROM evm_orders WHERE id = NEW.order_id), '') != 'open'
BEGIN
  SELECT RAISE(ABORT, 'order is not open');
END;
