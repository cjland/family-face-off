CREATE TABLE "character_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_packs_name_len" CHECK (char_length("character_packs"."name") between 1 and 40),
	CONSTRAINT "character_packs_size" CHECK (jsonb_array_length("character_packs"."characters") <= 40)
);
