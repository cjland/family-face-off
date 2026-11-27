CREATE TABLE "custom_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_name" text NOT NULL,
	"genre" text DEFAULT '' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"seconds" integer,
	"audio_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_questions_audio_id_unique" UNIQUE("audio_id"),
	CONSTRAINT "custom_difficulty" CHECK ("custom_questions"."difficulty" in ('easy', 'medium', 'hard')),
	CONSTRAINT "custom_options_count" CHECK (jsonb_array_length("custom_questions"."options") = 4),
	CONSTRAINT "custom_correct_index" CHECK ("custom_questions"."correct_index" between 0 and 3),
	CONSTRAINT "custom_seconds" CHECK ("custom_questions"."seconds" is null or "custom_questions"."seconds" between 5 and 120),
	CONSTRAINT "custom_lengths" CHECK (char_length("custom_questions"."question") <= 300 and char_length("custom_questions"."group_name") <= 60 and char_length("custom_questions"."genre") <= 60)
);
--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_subject_or_bonus";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "phase_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "away_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "away_reason" text;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "custom_question_id" uuid;--> statement-breakpoint
UPDATE "rounds" SET "kind" = 'bonus' WHERE "bonus_question_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "custom_questions_group_idx" ON "custom_questions" USING btree ("group_name");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_custom_question_id_custom_questions_id_fk" FOREIGN KEY ("custom_question_id") REFERENCES "public"."custom_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_kind" CHECK ("rounds"."kind" in ('personal', 'bonus', 'trivia', 'speed'));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_personal_source" CHECK ("rounds"."kind" <> 'personal' or ("rounds"."subject_player_id" is not null and "rounds"."source_player_prompt_id" is not null));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_bonus_points" CHECK ("rounds"."kind" <> 'bonus' or "rounds"."bonus_points" > 0);