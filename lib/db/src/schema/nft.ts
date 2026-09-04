import { pgTable, text, numeric, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nftCollectionsTable = pgTable("nft_collections", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  slug:          text("slug").notNull().unique(),
  chain:         text("chain").notNull(),
  contractAddress: text("contract_address"),
  description:   text("description"),
  imageUrl:      text("image_url"),
  bannerUrl:     text("banner_url"),
  category:      text("category").default("art"),
  floorPrice:    numeric("floor_price", { precision: 20, scale: 8 }).default("0"),
  floorCurrency: text("floor_currency").default("ETH"),
  volume24h:     numeric("volume_24h", { precision: 30, scale: 8 }).default("0"),
  volumeTotal:   numeric("volume_total", { precision: 30, scale: 8 }).default("0"),
  totalSupply:   integer("total_supply").default(0),
  holders:       integer("holders").default(0),
  isVerified:    boolean("is_verified").default(false),
  externalUrl:   text("external_url"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nft_collections_chain_idx").on(t.chain),
  index("nft_collections_slug_idx").on(t.slug),
]);

export const nftsTable = pgTable("nfts", {
  id:              text("id").primaryKey(),
  collectionId:    text("collection_id").notNull(),
  chain:           text("chain").notNull(),
  contractAddress: text("contract_address"),
  tokenId:         text("token_id").notNull(),
  name:            text("name").notNull(),
  description:     text("description"),
  imageUrl:        text("image_url"),
  animationUrl:    text("animation_url"),
  metadataUri:     text("metadata_uri"),
  owner:           text("owner"),
  traits:          text("traits"),
  rarity:          text("rarity"),
  rarityRank:      integer("rarity_rank"),
  lastSalePrice:   numeric("last_sale_price", { precision: 20, scale: 8 }),
  lastSaleCurrency: text("last_sale_currency"),
  isWrapped:       boolean("is_wrapped").default(false),
  nativeChain:     text("native_chain"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nfts_collection_idx").on(t.collectionId),
  index("nfts_owner_idx").on(t.owner),
  index("nfts_chain_contract_idx").on(t.chain, t.contractAddress),
]);

export const nftListingsTable = pgTable("nft_listings", {
  id:           text("id").primaryKey(),
  nftId:        text("nft_id").notNull(),
  collectionId: text("collection_id").notNull(),
  seller:       text("seller").notNull(),
  chain:        text("chain").notNull(),
  price:        numeric("price", { precision: 20, scale: 8 }).notNull(),
  currency:     text("currency").notNull().default("ETH"),
  priceUsd:     numeric("price_usd", { precision: 20, scale: 2 }),
  status:       text("status").notNull().default("active"),
  expiresAt:    timestamp("expires_at"),
  txHash:       text("tx_hash"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nft_listings_nft_idx").on(t.nftId),
  index("nft_listings_seller_idx").on(t.seller),
  index("nft_listings_status_idx").on(t.status),
]);

export const nftBidsTable = pgTable("nft_bids", {
  id:           text("id").primaryKey(),
  nftId:        text("nft_id").notNull(),
  collectionId: text("collection_id").notNull(),
  bidder:       text("bidder").notNull(),
  chain:        text("chain").notNull(),
  price:        numeric("price", { precision: 20, scale: 8 }).notNull(),
  currency:     text("currency").notNull().default("ETH"),
  priceUsd:     numeric("price_usd", { precision: 20, scale: 2 }),
  status:       text("status").notNull().default("active"),
  expiresAt:    timestamp("expires_at"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("nft_bids_nft_idx").on(t.nftId),
  index("nft_bids_bidder_idx").on(t.bidder),
]);

export const nftActivityTable = pgTable("nft_activity", {
  id:           text("id").primaryKey(),
  nftId:        text("nft_id").notNull(),
  collectionId: text("collection_id").notNull(),
  type:         text("type").notNull(),
  fromAddress:  text("from_address"),
  toAddress:    text("to_address"),
  price:        numeric("price", { precision: 20, scale: 8 }),
  currency:     text("currency"),
  priceUsd:     numeric("price_usd", { precision: 20, scale: 2 }),
  txHash:       text("tx_hash"),
  chain:        text("chain"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("nft_activity_nft_idx").on(t.nftId),
  index("nft_activity_collection_idx").on(t.collectionId),
]);

export const insertNftCollectionSchema = createInsertSchema(nftCollectionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertNftCollection = z.infer<typeof insertNftCollectionSchema>;
export type NftCollection = typeof nftCollectionsTable.$inferSelect;

export const insertNftSchema = createInsertSchema(nftsTable).omit({ createdAt: true, updatedAt: true });
export type InsertNft = z.infer<typeof insertNftSchema>;
export type Nft = typeof nftsTable.$inferSelect;

export const insertNftListingSchema = createInsertSchema(nftListingsTable).omit({ createdAt: true, updatedAt: true });
export type InsertNftListing = z.infer<typeof insertNftListingSchema>;
export type NftListing = typeof nftListingsTable.$inferSelect;

export const insertNftBidSchema = createInsertSchema(nftBidsTable).omit({ createdAt: true });
export type InsertNftBid = z.infer<typeof insertNftBidSchema>;
export type NftBid = typeof nftBidsTable.$inferSelect;
