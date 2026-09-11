CREATE TABLE "evm_to_bsv_swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_evm_address" text NOT NULL,
	"bsv_receive_addr" text NOT NULL,
	"token_in" text NOT NULL,
	"token_address" text NOT NULL,
	"amount_in_raw" text NOT NULL,
	"amount_in_human" text NOT NULL,
	"chain_id" integer NOT NULL,
	"estimated_bsv_out" text,
	"evm_lock_tx_hash" text,
	"solver_bsv_txid" text,
	"status" text DEFAULT 'PENDING_LOCK' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "evm_to_bsv_user_idx" ON "evm_to_bsv_swaps" USING btree ("user_evm_address");--> statement-breakpoint
CREATE INDEX "evm_to_bsv_status_idx" ON "evm_to_bsv_swaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evm_to_bsv_chain_idx" ON "evm_to_bsv_swaps" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "evm_to_bsv_expires_idx" ON "evm_to_bsv_swaps" USING btree ("expires_at");
