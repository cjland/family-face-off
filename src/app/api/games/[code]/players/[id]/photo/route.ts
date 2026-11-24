import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { requireHost } from "@/server/auth";
import { json, normalizeCode, route } from "@/server/http";
import { findGame } from "@/server/lobby";
import { removePhoto } from "@/server/photos";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** Host removes someone's photo (e.g. if it isn't appropriate). */
export const DELETE = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const { code, id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", "Player not found.");
  const game = await findGame(db, normalizeCode(code));
  await removePhoto(db, game.id, id);
  return json({ ok: true });
});
