import { ApiError } from "@/lib/errors";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, route } from "@/server/http";
import { findGame } from "@/server/lobby";
import { z } from "zod";
import { readJson } from "@/server/http";
import { MAX_PHOTO_BYTES, removePhoto, setPhoto, setPhotoBody } from "@/server/photos";
import { rateLimit } from "@/server/rateLimit";

type Ctx = { params: Promise<{ code: string }> };

/** Upload my photo: body {image: "data:image/jpeg;base64,..."} (resized on the phone first). */
export const POST = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  await rateLimit(db, `photo:${player.id}`, 10, 60);
  const text = await req.text();
  if (text.length > MAX_PHOTO_BYTES * 1.4 + 200) throw new ApiError("PAYLOAD_TOO_LARGE", "That photo is too large.");
  let image = "";
  let body: string | undefined;
  try {
    const parsed = JSON.parse(text) as { image?: unknown; body?: unknown };
    image = String(parsed.image ?? "");
    body = typeof parsed.body === "string" ? parsed.body : undefined;
  } catch {
    throw new ApiError("VALIDATION", "Request body must be JSON.");
  }
  const piece = await setPhoto(db, game, player, image, body);
  return json({ ok: true, piece });
});

/** Remove my photo (I get a game piece back). */
export const DELETE = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  await removePhoto(db, game.id, player.id);
  return json({ ok: true });
});

/** Pick a different cartoon body for my face. */
export const PATCH = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  const { body } = await readJson(req, z.object({ body: z.string().max(20) }));
  return json({ ok: true, piece: await setPhotoBody(db, game, player, body) });
});
