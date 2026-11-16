CREATE TABLE IF NOT EXISTS orderbook_quote_candles (
  symbol TEXT NOT NULL,
  bucket_sec BIGINT NOT NULL,
  open NUMERIC(56, 30) NOT NULL,
  high NUMERIC(56, 30) NOT NULL,
  low NUMERIC(56, 30) NOT NULL,
  close NUMERIC(56, 30) NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, bucket_sec)
);

CREATE INDEX IF NOT EXISTS orderbook_quote_candles_symbol_bucket_idx
  ON orderbook_quote_candles (symbol, bucket_sec);
