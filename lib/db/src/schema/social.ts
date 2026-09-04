import { pgTable, text, numeric, timestamp, boolean, integer, unique, index } from "drizzle-orm/pg-core";

export const socialPostsTable = pgTable("social_posts", {
  id:             text("id").primaryKey(),
  creator:        text("creator").notNull(),
  creatorName:    text("creator_name"),
  creatorAvatar:  text("creator_avatar"),
  title:          text("title").notNull(),
  description:    text("description"),
  imageUrl:       text("image_url"),
  mintPrice:      numeric("mint_price", { precision: 30, scale: 18 }).default("0"),
  mintCurrency:   text("mint_currency").default("BSV"),
  mintPriceUsd:   numeric("mint_price_usd", { precision: 20, scale: 2 }),
  maxSupply:      integer("max_supply"),
  category:       text("category").default("art"),
  tags:           text("tags"),
  inscriptionId:  text("inscription_id"),
  chain:          text("chain").default("BSV"),
  status:         text("status").default("active"),
  likeCount:      integer("like_count").default(0),
  commentCount:   integer("comment_count").default(0),
  mintCount:      integer("mint_count").default(0),
  isVerified:     boolean("is_verified").default(false),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("social_posts_creator_idx").on(t.creator),
  index("social_posts_status_idx").on(t.status),
  index("social_posts_chain_idx").on(t.chain),
]);

export const creatorProfilesTable = pgTable("creator_profiles", {
  address:          text("address").primaryKey(),
  username:         text("username"),
  bio:              text("bio"),
  avatarUrl:        text("avatar_url"),
  coverUrl:         text("cover_url"),
  website:          text("website"),
  twitter:          text("twitter"),
  instagram:        text("instagram"),
  isVerified:       boolean("is_verified").default(false),
  followerCount:    integer("follower_count").default(0),
  followingCount:   integer("following_count").default(0),
  postCount:        integer("post_count").default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export const creatorCoinsTable = pgTable("creator_coins", {
  creatorAddress:   text("creator_address").primaryKey(),
  symbol:           text("symbol"),
  name:             text("name"),
  virtualBsv:       numeric("virtual_bsv", { precision: 30, scale: 8 }).default("0"),
  virtualTokens:    numeric("virtual_tokens", { precision: 30, scale: 8 }).default("0"),
  priceBsv:         numeric("price_bsv", { precision: 30, scale: 12 }).default("0"),
  priceUsd:         numeric("price_usd", { precision: 30, scale: 8 }).default("0"),
  marketCapUsd:     numeric("market_cap_usd", { precision: 30, scale: 2 }).default("0"),
  athUsd:           numeric("ath_usd", { precision: 30, scale: 8 }).default("0"),
  volume24hUsd:     numeric("volume_24h_usd", { precision: 30, scale: 2 }).default("0"),
  holderCount:      integer("holder_count").default(0),
  circulatingSupply: numeric("circulating_supply", { precision: 30, scale: 8 }).default("0"),
  totalSupply:      numeric("total_supply", { precision: 30, scale: 8 }).default("0"),
  tradeCount:       integer("trade_count").default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export const coinHoldingsTable = pgTable("coin_holdings", {
  id:             text("id").primaryKey(),
  coinCreator:    text("coin_creator").notNull(),
  holder:         text("holder").notNull(),
  amount:         numeric("amount", { precision: 30, scale: 8 }).default("0"),
  avgBuyPriceBsv: numeric("avg_buy_price_bsv", { precision: 30, scale: 12 }).default("0"),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("coin_holdings_creator_holder_uniq").on(t.coinCreator, t.holder),
  index("coin_holdings_creator_idx").on(t.coinCreator),
  index("coin_holdings_holder_idx").on(t.holder),
]);

export const coinTradesTable = pgTable("coin_trades", {
  id:           text("id").primaryKey(),
  coinCreator:  text("coin_creator").notNull(),
  trader:       text("trader").notNull(),
  tradeType:    text("trade_type").notNull(),
  bsvAmount:    numeric("bsv_amount", { precision: 30, scale: 8 }),
  tokenAmount:  numeric("token_amount", { precision: 30, scale: 8 }),
  priceBsv:     numeric("price_bsv", { precision: 30, scale: 12 }),
  priceUsd:     numeric("price_usd", { precision: 30, scale: 8 }),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("coin_trades_creator_idx").on(t.coinCreator),
  index("coin_trades_trader_idx").on(t.trader),
]);

export const postCommentsTable = pgTable("post_comments", {
  id:            text("id").primaryKey(),
  postId:        text("post_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  displayName:   text("display_name"),
  content:       text("content").notNull(),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("post_comments_post_idx").on(t.postId),
]);

export const postMintsTable = pgTable("post_mints", {
  id:        text("id").primaryKey(),
  postId:    text("post_id").notNull(),
  minter:    text("minter").notNull(),
  price:     numeric("price", { precision: 30, scale: 18 }),
  currency:  text("currency"),
  txHash:    text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("post_mints_post_idx").on(t.postId),
  index("post_mints_minter_idx").on(t.minter),
]);

export const postLikesTable = pgTable("post_likes", {
  id:            text("id").primaryKey(),
  postId:        text("post_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
}, (t) => [
  unique("post_likes_post_wallet_uniq").on(t.postId, t.walletAddress),
]);

export const socialFollowsTable = pgTable("social_follows", {
  id:        text("id").primaryKey(),
  follower:  text("follower").notNull(),
  following: text("following").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("social_follows_pair_uniq").on(t.follower, t.following),
  index("social_follows_follower_idx").on(t.follower),
  index("social_follows_following_idx").on(t.following),
]);
