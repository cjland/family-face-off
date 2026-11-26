CREATE TABLE "bonus_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"points" integer NOT NULL,
	"time_seconds" integer NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"seasonal" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bonus_difficulty" CHECK ("bonus_questions"."difficulty" in ('easy', 'medium', 'hard')),
	CONSTRAINT "bonus_options_count" CHECK (jsonb_array_length("bonus_questions"."options") = 4),
	CONSTRAINT "bonus_correct_index" CHECK ("bonus_questions"."correct_index" between 0 and 3),
	CONSTRAINT "bonus_points_pos" CHECK ("bonus_questions"."points" > 0 and "bonus_questions"."time_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "score_events" DROP CONSTRAINT "score_events_points_range";--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "subject_player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "source_player_prompt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "bonus_question_id" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "bonus_points" integer;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "bonus_difficulty" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_bonus_question_id_bonus_questions_id_fk" FOREIGN KEY ("bonus_question_id") REFERENCES "public"."bonus_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_subject_or_bonus" CHECK (("rounds"."bonus_question_id" is null and "rounds"."subject_player_id" is not null and "rounds"."source_player_prompt_id" is not null) or ("rounds"."bonus_question_id" is not null and "rounds"."bonus_points" > 0));--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_points_range" CHECK ("score_events"."points" between 0 and 3000);