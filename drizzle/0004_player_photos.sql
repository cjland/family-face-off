CREATE TABLE "player_photos" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"previous_piece" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_photos_size" CHECK (octet_length("player_photos"."data") <= 200000)
);
--> statement-breakpoint
ALTER TABLE "player_photos" ADD CONSTRAINT "player_photos_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;