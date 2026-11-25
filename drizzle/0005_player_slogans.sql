ALTER TABLE "players" ADD COLUMN "win_slogan" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "lose_slogan" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_slogan_len" CHECK (char_length(coalesce("players"."win_slogan", '')) <= 60 and char_length(coalesce("players"."lose_slogan", '')) <= 60);