-- OrahDEX Cloudflare D1
-- Staging market-data replica, schema version 0001
-- Decimal values are stored as TEXT.

CREATE TABLE IF NOT EXISTS markets (
  symbol TEXT PRIMARY KEY NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,

  last_price TEXT NOT NULL,
  price_change_24h TEXT NOT NULL,
  price_change_percent_24h TEXT NOT NULL,
  volume_24h TEXT NOT NULL,
  high_24h TEXT NOT NULL,
  low_24h TEXT NOT NULL,
  market_cap TEXT,

  status TEXT NOT NULL,
  type TEXT NOT NULL,

  min_order_size TEXT NOT NULL,
  max_order_size TEXT NOT NULL,
  tick_size TEXT NOT NULL,
  maker_fee TEXT NOT NULL,
  taker_fee TEXT NOT NULL,

  updated_at TEXT NOT NULL,
  contract_addresses TEXT,

  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_markets_base
  ON markets(base_asset);

CREATE INDEX IF NOT EXISTS idx_markets_quote
  ON markets(quote_asset);

CREATE INDEX IF NOT EXISTS idx_markets_status
  ON markets(status);

CREATE INDEX IF NOT EXISTS idx_markets_enabled
  ON markets(enabled);

CREATE INDEX IF NOT EXISTS idx_markets_updated
  ON markets(updated_at);

CREATE INDEX IF NOT EXISTS idx_markets_pinned
  ON markets(pinned);
