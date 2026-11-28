CREATE TABLE "quiz_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🎯' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_presets_name_len" CHECK (char_length("quiz_presets"."name") between 1 and 40)
);
