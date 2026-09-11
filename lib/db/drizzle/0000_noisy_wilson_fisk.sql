CREATE TABLE "markets" (
	"symbol" text PRIMARY KEY NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"last_price" numeric(36, 18) DEFAULT '0' NOT NULL,
	"price_change_24h" numeric(36, 18) DEFAULT '0' NOT NULL,
	"price_change_percent_24h" numeric(10, 4) DEFAULT '0' NOT NULL,
	"volume_24h" numeric(36, 18) DEFAULT '0' NOT NULL,
	"high_24h" numeric(36, 18) DEFAULT '0' NOT NULL,
	"low_24h" numeric(36, 18) DEFAULT '0' NOT NULL,
	"market_cap" numeric(30, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"type" text DEFAULT 'spot' NOT NULL,
	"min_order_size" numeric(36, 18) DEFAULT '0.00000001' NOT NULL,
	"max_order_size" numeric(36, 18) DEFAULT '1000000' NOT NULL,
	"tick_size" numeric(36, 18) DEFAULT '0.01' NOT NULL,
	"maker_fee" numeric(10, 6) DEFAULT '0.001' NOT NULL,
	"taker_fee" numeric(10, 6) DEFAULT '0.001' NOT NULL,
	"contract_addresses" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"wallet_address" text NOT NULL,
	"network_type" text DEFAULT 'evm',
	"side" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"price" numeric(36, 18),
	"stop_price" numeric(36, 18),
	"quantity" numeric(36, 18) NOT NULL,
	"filled_quantity" numeric(36, 18) DEFAULT '0' NOT NULL,
	"remaining_quantity" numeric(36, 18) NOT NULL,
	"total" numeric(36, 18),
	"fee" numeric(36, 18) DEFAULT '0' NOT NULL,
	"fee_asset" text DEFAULT 'USDT' NOT NULL,
	"time_in_force" text DEFAULT 'GTC' NOT NULL,
	"txid" text,
	"signed_tx" text,
	"matched_order_id" text,
	"funding_ref" text,
	"nonce" text,
	"expiry" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidity_positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"pool_id" text NOT NULL,
	"asset_a" text NOT NULL,
	"asset_b" text NOT NULL,
	"amount_a" numeric(36, 18) NOT NULL,
	"amount_b" numeric(36, 18) NOT NULL,
	"lp_tokens" numeric(36, 18) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"asset_symbol" text NOT NULL,
	"available" numeric(36, 18) DEFAULT '0' NOT NULL,
	"locked" numeric(36, 18) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(36, 18) NOT NULL,
	"quantity" numeric(36, 18) NOT NULL,
	"total" numeric(36, 18) NOT NULL,
	"fee" numeric(36, 18) DEFAULT '0' NOT NULL,
	"fee_asset" text DEFAULT 'USDT' NOT NULL,
	"wallet_address" text,
	"txid" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"time" numeric(20, 0) NOT NULL,
	"open" numeric(20, 8) NOT NULL,
	"high" numeric(20, 8) NOT NULL,
	"low" numeric(20, 8) NOT NULL,
	"close" numeric(20, 8) NOT NULL,
	"volume" numeric(30, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futures_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"leverage" numeric(6, 2) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"mark_price" numeric(20, 8) NOT NULL,
	"liquidation_price" numeric(20, 8) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"margin" numeric(20, 8) NOT NULL,
	"unrealized_pnl" numeric(20, 8) DEFAULT '0' NOT NULL,
	"unrealized_pnl_percent" numeric(10, 4) DEFAULT '0' NOT NULL,
	"realized_pnl" numeric(20, 8) DEFAULT '0' NOT NULL,
	"funding_fee" numeric(20, 8) DEFAULT '0' NOT NULL,
	"margin_mode" text DEFAULT 'isolated' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"txid" text,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "htlc_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"secret_hash" text NOT NULL,
	"htlc_address" text NOT NULL,
	"redeem_script" text NOT NULL,
	"amount_bsv" numeric(20, 8) NOT NULL,
	"locktime_blocks" integer NOT NULL,
	"sender_bsv_address" text,
	"recipient_evm_address" text,
	"evm_chain_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"funding_txid" text,
	"mint_tx_hash" text,
	"created_at_block" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_nominations" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"contract_address" text,
	"chain" text,
	"website" text,
	"description" text,
	"votes" integer DEFAULT 0 NOT NULL,
	"nominated_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coin_vote_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"nomination_id" integer NOT NULL,
	"voter_ip" text,
	"voter_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"folder" text DEFAULT 'inbox' NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"network_type" text DEFAULT 'evm',
	"provider" text,
	"chain_id" text,
	"status" text DEFAULT 'active',
	"country" text DEFAULT 'US',
	"verified" text DEFAULT 'false',
	"balance_override" numeric(20, 8),
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cex_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_secret_enc" text NOT NULL,
	"passphrase_enc" text,
	"status" varchar(20) DEFAULT 'untested' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"permissions" jsonb,
	"last_tested_at" timestamp with time zone,
	"last_test_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_vault_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"follower_wallet" text NOT NULL,
	"shares_owned" numeric(30, 8) NOT NULL,
	"deposit_amount_usdt" numeric(30, 8) NOT NULL,
	"entry_share_price" numeric(20, 8) NOT NULL,
	"current_value" numeric(30, 8) NOT NULL,
	"unrealized_pnl" numeric(30, 8) DEFAULT '0' NOT NULL,
	"unrealized_pnl_pct" numeric(10, 4) DEFAULT '0' NOT NULL,
	"realized_pnl" numeric(30, 8) DEFAULT '0' NOT NULL,
	"fees_paid" numeric(20, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "copy_vault_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"leader_order_id" text,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"total" numeric(30, 8) NOT NULL,
	"pnl" numeric(30, 8),
	"pnl_pct" numeric(10, 4),
	"txid" text,
	"status" text DEFAULT 'executed' NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"leader_wallet" text NOT NULL,
	"leader_name" text NOT NULL,
	"leader_avatar" text,
	"name" text NOT NULL,
	"description" text,
	"trading_pairs" text DEFAULT 'BSV-USDT' NOT NULL,
	"fee_rate" numeric(6, 4) DEFAULT '0.10' NOT NULL,
	"min_deposit" numeric(20, 8) DEFAULT '10' NOT NULL,
	"max_capacity" numeric(20, 8),
	"tvl" numeric(30, 8) DEFAULT '0' NOT NULL,
	"total_shares" numeric(30, 8) DEFAULT '0' NOT NULL,
	"share_price" numeric(20, 8) DEFAULT '1' NOT NULL,
	"total_pnl" numeric(30, 8) DEFAULT '0' NOT NULL,
	"total_pnl_pct" numeric(10, 4) DEFAULT '0' NOT NULL,
	"month_pnl_pct" numeric(10, 4) DEFAULT '0' NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"win_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"order" serial NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"admin_reply" text,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keeper_earnings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"asset" text DEFAULT 'USDT' NOT NULL,
	"source" text NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"tx_ref" text DEFAULT '',
	"earned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keepers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"uri" text DEFAULT '',
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_name" text DEFAULT '',
	"avatar_url" text DEFAULT '',
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "p2p_intents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"maker_address" text NOT NULL,
	"taker_address" text,
	"token_in" text NOT NULL,
	"token_out" text NOT NULL,
	"amount_in" numeric(36, 18) NOT NULL,
	"min_amount_out" numeric(36, 18) NOT NULL,
	"filled_amount_out" numeric(36, 18),
	"price" numeric(36, 18),
	"fiat" text DEFAULT 'USD',
	"payment_methods" text DEFAULT '',
	"terms" text DEFAULT '',
	"signature" text DEFAULT '',
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "htlc_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_id" text NOT NULL,
	"htlc_address" text NOT NULL,
	"settlement_txid" text NOT NULL,
	"pair" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"spend_txid" text,
	"block_height" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "htlc_registry" (
	"trade_id" text PRIMARY KEY NOT NULL,
	"htlc_address" text NOT NULL,
	"secret_hash" text NOT NULL,
	"locktime_blocks" integer NOT NULL,
	"settlement_txid" text NOT NULL,
	"pair" text NOT NULL,
	"user_address" text NOT NULL,
	"status" text DEFAULT 'LOCKED' NOT NULL,
	"spend_txid" text,
	"terminal_at" timestamp,
	"next_check_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keeper_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"keeper_address" text NOT NULL,
	"htlc_address" text NOT NULL,
	"trade_id" text NOT NULL,
	"pair" text NOT NULL,
	"action" text NOT NULL,
	"txid" text,
	"block_height" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evm_htlc_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_id" text NOT NULL,
	"pair" text NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"secret" text NOT NULL,
	"secret_hash" text NOT NULL,
	"seller_address" text NOT NULL,
	"buyer_address" text NOT NULL,
	"seller_asset" text NOT NULL,
	"seller_amount" text NOT NULL,
	"seller_token" text,
	"buyer_asset" text NOT NULL,
	"buyer_amount" text NOT NULL,
	"buyer_token" text,
	"seller_lock_id" text NOT NULL,
	"buyer_lock_id" text NOT NULL,
	"seller_timelock_unix" integer NOT NULL,
	"buyer_timelock_unix" integer NOT NULL,
	"seller_lock_txid" text,
	"buyer_lock_txid" text,
	"reveal_seller_txid" text,
	"reveal_buyer_txid" text,
	"seller_locked" boolean DEFAULT false NOT NULL,
	"buyer_locked" boolean DEFAULT false NOT NULL,
	"seller_revealed" boolean DEFAULT false NOT NULL,
	"buyer_revealed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'PENDING_LOCKS' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(255) NOT NULL,
	"asset" varchar(32) NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"network" varchar(64) NOT NULL,
	"network_label" varchar(128) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"fee" varchar(32),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"txid" varchar(255),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "nft_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"nft_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"type" text NOT NULL,
	"from_address" text,
	"to_address" text,
	"price" numeric(20, 8),
	"currency" text,
	"price_usd" numeric(20, 2),
	"tx_hash" text,
	"chain" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"nft_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"bidder" text NOT NULL,
	"chain" text NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"currency" text DEFAULT 'ETH' NOT NULL,
	"price_usd" numeric(20, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"chain" text NOT NULL,
	"contract_address" text,
	"description" text,
	"image_url" text,
	"banner_url" text,
	"category" text DEFAULT 'art',
	"floor_price" numeric(20, 8) DEFAULT '0',
	"floor_currency" text DEFAULT 'ETH',
	"volume_24h" numeric(30, 8) DEFAULT '0',
	"volume_total" numeric(30, 8) DEFAULT '0',
	"total_supply" integer DEFAULT 0,
	"holders" integer DEFAULT 0,
	"is_verified" boolean DEFAULT false,
	"external_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nft_collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "nft_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"nft_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"seller" text NOT NULL,
	"chain" text NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"currency" text DEFAULT 'ETH' NOT NULL,
	"price_usd" numeric(20, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfts" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"chain" text NOT NULL,
	"contract_address" text,
	"token_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"animation_url" text,
	"metadata_uri" text,
	"owner" text,
	"traits" text,
	"rarity" text,
	"rarity_rank" integer,
	"last_sale_price" numeric(20, 8),
	"last_sale_currency" text,
	"is_wrapped" boolean DEFAULT false,
	"native_chain" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"coin_creator" text NOT NULL,
	"holder" text NOT NULL,
	"amount" numeric(30, 8) DEFAULT '0',
	"avg_buy_price_bsv" numeric(30, 12) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coin_holdings_creator_holder_uniq" UNIQUE("coin_creator","holder")
);
--> statement-breakpoint
CREATE TABLE "coin_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"coin_creator" text NOT NULL,
	"trader" text NOT NULL,
	"trade_type" text NOT NULL,
	"bsv_amount" numeric(30, 8),
	"token_amount" numeric(30, 8),
	"price_bsv" numeric(30, 12),
	"price_usd" numeric(30, 8),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_coins" (
	"creator_address" text PRIMARY KEY NOT NULL,
	"symbol" text,
	"name" text,
	"virtual_bsv" numeric(30, 8) DEFAULT '0',
	"virtual_tokens" numeric(30, 8) DEFAULT '0',
	"price_bsv" numeric(30, 12) DEFAULT '0',
	"price_usd" numeric(30, 8) DEFAULT '0',
	"market_cap_usd" numeric(30, 2) DEFAULT '0',
	"ath_usd" numeric(30, 8) DEFAULT '0',
	"volume_24h_usd" numeric(30, 2) DEFAULT '0',
	"holder_count" integer DEFAULT 0,
	"circulating_supply" numeric(30, 8) DEFAULT '0',
	"total_supply" numeric(30, 8) DEFAULT '0',
	"trade_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"address" text PRIMARY KEY NOT NULL,
	"username" text,
	"bio" text,
	"avatar_url" text,
	"cover_url" text,
	"website" text,
	"twitter" text,
	"instagram" text,
	"is_verified" boolean DEFAULT false,
	"follower_count" integer DEFAULT 0,
	"following_count" integer DEFAULT 0,
	"post_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"display_name" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	CONSTRAINT "post_likes_post_wallet_uniq" UNIQUE("post_id","wallet_address")
);
--> statement-breakpoint
CREATE TABLE "post_mints" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"minter" text NOT NULL,
	"price" numeric(30, 18),
	"currency" text,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_follows" (
	"id" text PRIMARY KEY NOT NULL,
	"follower" text NOT NULL,
	"following" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_follows_pair_uniq" UNIQUE("follower","following")
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"creator_name" text,
	"creator_avatar" text,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"mint_price" numeric(30, 18) DEFAULT '0',
	"mint_currency" text DEFAULT 'BSV',
	"mint_price_usd" numeric(20, 2),
	"max_supply" integer,
	"category" text DEFAULT 'art',
	"tags" text,
	"inscription_id" text,
	"chain" text DEFAULT 'BSV',
	"status" text DEFAULT 'active',
	"like_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"mint_count" integer DEFAULT 0,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "le_swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"coin_from" text NOT NULL,
	"coin_to" text NOT NULL,
	"network_from" text,
	"network_to" text,
	"deposit_amount" numeric(36, 18) NOT NULL,
	"withdrawal_amount" numeric(36, 18),
	"deposit_amount_usd" numeric(20, 4),
	"status" text DEFAULT 'waiting' NOT NULL,
	"withdrawal" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "routing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_symbol" text NOT NULL,
	"quote_symbol" text NOT NULL,
	"max_slippage_bps" integer DEFAULT 150 NOT NULL,
	"min_fill_fraction" numeric(5, 4) DEFAULT '0.9' NOT NULL,
	"max_internal_size" numeric(36, 18),
	"oracle_required" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"split_enabled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staking_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"coin" text NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"apy" numeric(10, 4) NOT NULL,
	"lock_days" text DEFAULT '30' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reward_accrued" numeric(36, 18) DEFAULT '0',
	"started_at" timestamp DEFAULT now() NOT NULL,
	"unlocks_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_symbol_status_idx" ON "orders" USING btree ("symbol","status");--> statement-breakpoint
CREATE INDEX "orders_wallet_status_idx" ON "orders" USING btree ("wallet_address","status");--> statement-breakpoint
CREATE INDEX "lp_positions_wallet_idx" ON "liquidity_positions" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "lp_positions_pool_idx" ON "liquidity_positions" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_balances_wallet_asset_idx" ON "user_balances" USING btree ("wallet_address","asset_symbol");--> statement-breakpoint
CREATE INDEX "user_balances_wallet_idx" ON "user_balances" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "cvp_vault_idx" ON "copy_vault_positions" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "cvp_follower_idx" ON "copy_vault_positions" USING btree ("follower_wallet");--> statement-breakpoint
CREATE INDEX "cvt_vault_idx" ON "copy_vault_trades" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "copy_vaults_leader_idx" ON "copy_vaults" USING btree ("leader_wallet");--> statement-breakpoint
CREATE INDEX "copy_vaults_status_idx" ON "copy_vaults" USING btree ("status");--> statement-breakpoint
CREATE INDEX "keeper_earnings_wallet_idx" ON "keeper_earnings" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "keeper_earnings_source_idx" ON "keeper_earnings" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "keepers_wallet_idx" ON "keepers" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "keepers_active_idx" ON "keepers" USING btree ("active");--> statement-breakpoint
CREATE INDEX "p2p_intents_intent_id_idx" ON "p2p_intents" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "p2p_intents_maker_idx" ON "p2p_intents" USING btree ("maker_address");--> statement-breakpoint
CREATE INDEX "p2p_intents_status_idx" ON "p2p_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "p2p_intents_tokens_idx" ON "p2p_intents" USING btree ("token_in","token_out");--> statement-breakpoint
CREATE INDEX "htlc_events_trade_idx" ON "htlc_events" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "htlc_events_address_idx" ON "htlc_events" USING btree ("htlc_address");--> statement-breakpoint
CREATE INDEX "htlc_events_created_idx" ON "htlc_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "htlc_registry_address_idx" ON "htlc_registry" USING btree ("htlc_address");--> statement-breakpoint
CREATE INDEX "htlc_registry_status_idx" ON "htlc_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "htlc_registry_user_idx" ON "htlc_registry" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "htlc_registry_next_check_idx" ON "htlc_registry" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "htlc_registry_terminal_idx" ON "htlc_registry" USING btree ("terminal_at");--> statement-breakpoint
CREATE INDEX "keeper_actions_keeper_idx" ON "keeper_actions" USING btree ("keeper_address");--> statement-breakpoint
CREATE INDEX "keeper_actions_htlc_idx" ON "keeper_actions" USING btree ("htlc_address");--> statement-breakpoint
CREATE INDEX "keeper_actions_created_idx" ON "keeper_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "keeper_actions_action_idx" ON "keeper_actions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "evm_htlc_trade_idx" ON "evm_htlc_sessions" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "evm_htlc_status_idx" ON "evm_htlc_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evm_htlc_seller_idx" ON "evm_htlc_sessions" USING btree ("seller_address");--> statement-breakpoint
CREATE INDEX "evm_htlc_buyer_idx" ON "evm_htlc_sessions" USING btree ("buyer_address");--> statement-breakpoint
CREATE INDEX "evm_htlc_expires_idx" ON "evm_htlc_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "evm_htlc_chain_idx" ON "evm_htlc_sessions" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "nft_activity_nft_idx" ON "nft_activity" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_activity_collection_idx" ON "nft_activity" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "nft_bids_nft_idx" ON "nft_bids" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_bids_bidder_idx" ON "nft_bids" USING btree ("bidder");--> statement-breakpoint
CREATE INDEX "nft_collections_chain_idx" ON "nft_collections" USING btree ("chain");--> statement-breakpoint
CREATE INDEX "nft_collections_slug_idx" ON "nft_collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "nft_listings_nft_idx" ON "nft_listings" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_listings_seller_idx" ON "nft_listings" USING btree ("seller");--> statement-breakpoint
CREATE INDEX "nft_listings_status_idx" ON "nft_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nfts_collection_idx" ON "nfts" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "nfts_owner_idx" ON "nfts" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "nfts_chain_contract_idx" ON "nfts" USING btree ("chain","contract_address");--> statement-breakpoint
CREATE INDEX "coin_holdings_creator_idx" ON "coin_holdings" USING btree ("coin_creator");--> statement-breakpoint
CREATE INDEX "coin_holdings_holder_idx" ON "coin_holdings" USING btree ("holder");--> statement-breakpoint
CREATE INDEX "coin_trades_creator_idx" ON "coin_trades" USING btree ("coin_creator");--> statement-breakpoint
CREATE INDEX "coin_trades_trader_idx" ON "coin_trades" USING btree ("trader");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_mints_post_idx" ON "post_mints" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_mints_minter_idx" ON "post_mints" USING btree ("minter");--> statement-breakpoint
CREATE INDEX "social_follows_follower_idx" ON "social_follows" USING btree ("follower");--> statement-breakpoint
CREATE INDEX "social_follows_following_idx" ON "social_follows" USING btree ("following");--> statement-breakpoint
CREATE INDEX "social_posts_creator_idx" ON "social_posts" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_posts_chain_idx" ON "social_posts" USING btree ("chain");--> statement-breakpoint
CREATE INDEX "le_swaps_created_idx" ON "le_swaps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "le_swaps_status_idx" ON "le_swaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "le_swaps_coin_from_idx" ON "le_swaps" USING btree ("coin_from");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_profiles_pair_idx" ON "routing_profiles" USING btree ("base_symbol","quote_symbol");--> statement-breakpoint
CREATE INDEX "staking_positions_wallet_idx" ON "staking_positions" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "staking_positions_status_idx" ON "staking_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staking_positions_coin_idx" ON "staking_positions" USING btree ("coin");