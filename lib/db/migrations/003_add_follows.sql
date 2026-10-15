CREATE TABLE IF NOT EXISTS follows (
  follower_address TEXT NOT NULL,
  followee_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_address, followee_address)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee_address);
