CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "families_name_len" CHECK (char_length("families"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "families_name_uq" ON "families" USING btree ("normalized_name");--> statement-breakpoint
INSERT INTO "families" ("name", "normalized_name") VALUES ('Land', 'land') ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "family_id" uuid;--> statement-breakpoint
UPDATE "games" SET "family_id" = (SELECT "id" FROM "families" WHERE "normalized_name" = 'land') WHERE "family_id" IS NULL;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "piece" text;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_family_idx" ON "games" USING btree ("family_id");