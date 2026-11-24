import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { route } from "@/server/http";
import { getPhoto } from "@/server/photos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves a player's photo. Player ids are random UUIDs that are only ever shown to people in
 * that game (host, TV, players). The ?v= version in the URL changes on every upload.
 */
export const GET = route<Ctx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", "Photo not found.");
  const photo = await getPhoto(db, id);
  if (!photo) throw new ApiError("NOT_FOUND", "Photo not found.");
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
