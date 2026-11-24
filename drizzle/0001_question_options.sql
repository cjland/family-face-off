ALTER TABLE "player_prompts" ADD COLUMN "answer_option_id" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "seasonal" text;