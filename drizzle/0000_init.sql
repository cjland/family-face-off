CREATE TYPE "public"."game_phase" AS ENUM('LOBBY', 'PREPARING', 'QUESTION', 'REVEAL', 'FINISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('PENDING', 'RESERVE', 'OPEN', 'REVEALED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."round_type" AS ENUM('WHAT_ANSWER', 'WHO_ANSWERED');--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"phase" "game_phase" DEFAULT 'LOBBY' NOT NULL,
	"settings" jsonb NOT NULL,
	"current_round_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"roster_locked_at" timestamp with time zone,
	"prepare_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_code_format" CHECK ("games"."code" ~ '^[A-Z0-9]{6}$'),
	CONSTRAINT "games_version_nonneg" CHECK ("games"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"option_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"elapsed_ms" integer NOT NULL,
	CONSTRAINT "guesses_elapsed_nonneg" CHECK ("guesses"."elapsed_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "host_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"prompt_id" text NOT NULL,
	"slot" integer NOT NULL,
	"answer_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_prompts_slot_range" CHECK ("player_prompts"."slot" between 1 and 8),
	CONSTRAINT "player_prompts_answer_len" CHECK ("player_prompts"."answer_text" is null or char_length("player_prompts"."answer_text") <= 120)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"ready_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_name_len" CHECK (char_length("players"."display_name") between 1 and 24)
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"question_template" text NOT NULL,
	"category" text NOT NULL,
	"common" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"fallback_options" jsonb NOT NULL,
	CONSTRAINT "prompts_template_has_name" CHECK ("prompts"."question_template" like '%{name}%')
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"subject_player_id" uuid NOT NULL,
	"source_player_prompt_id" uuid NOT NULL,
	"type" "round_type" NOT NULL,
	"question_text" text NOT NULL,
	"prompt_text" text NOT NULL,
	"answer_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_id" text NOT NULL,
	"excluded_player_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "round_status" DEFAULT 'PENDING' NOT NULL,
	"duration_ms" integer NOT NULL,
	"opened_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"remaining_ms" integer,
	"revealed_at" timestamp with time zone,
	CONSTRAINT "rounds_options_count" CHECK (jsonb_array_length("rounds"."options") = 4),
	CONSTRAINT "rounds_duration_pos" CHECK ("rounds"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "score_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_events_points_range" CHECK ("score_events"."points" between 0 and 1500)
);
--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_prompts" ADD CONSTRAINT "player_prompts_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_prompts" ADD CONSTRAINT "player_prompts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_prompts" ADD CONSTRAINT "player_prompts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_subject_player_id_players_id_fk" FOREIGN KEY ("subject_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_source_player_prompt_id_player_prompts_id_fk" FOREIGN KEY ("source_player_prompt_id") REFERENCES "public"."player_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_code_uq" ON "games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "games_expires_idx" ON "games" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guesses_round_player_uq" ON "guesses" USING btree ("round_id","player_id");--> statement-breakpoint
CREATE INDEX "guesses_round_idx" ON "guesses" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_sessions_token_uq" ON "host_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "player_prompts_slot_uq" ON "player_prompts" USING btree ("player_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "player_prompts_prompt_uq" ON "player_prompts" USING btree ("player_id","prompt_id");--> statement-breakpoint
CREATE INDEX "player_prompts_game_idx" ON "player_prompts" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_game_name_uq" ON "players" USING btree ("game_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "players_token_uq" ON "players" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "players_game_idx" ON "players" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_game_ordinal_uq" ON "rounds" USING btree ("game_id","ordinal");--> statement-breakpoint
CREATE INDEX "rounds_game_idx" ON "rounds" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_events_round_player_uq" ON "score_events" USING btree ("round_id","player_id");--> statement-breakpoint
CREATE INDEX "score_events_round_idx" ON "score_events" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "score_events_player_idx" ON "score_events" USING btree ("player_id");