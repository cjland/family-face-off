ALTER TABLE "bonus_questions" DROP CONSTRAINT "bonus_options_count";--> statement-breakpoint
ALTER TABLE "bonus_questions" DROP CONSTRAINT "bonus_correct_index";--> statement-breakpoint
ALTER TABLE "bonus_questions" ADD CONSTRAINT "bonus_options_count" CHECK (jsonb_array_length("bonus_questions"."options") between 4 and 12);--> statement-breakpoint
ALTER TABLE "bonus_questions" ADD CONSTRAINT "bonus_correct_index" CHECK ("bonus_questions"."correct_index" >= 0 and "bonus_questions"."correct_index" < jsonb_array_length("bonus_questions"."options"));