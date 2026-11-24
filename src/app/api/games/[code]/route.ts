import { ApiError } from "@/lib/errors";
import { requireHost } from "@/server/auth";
import { json, normalizeCode, route } from "@/server/http";
import { deleteGame } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };

/** Immediately deletes a game and all its players, answers, rounds and scores. */
export const DELETE = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const code = normalizeCode((await ctx.params).code);
  if (!(await deleteGame(db, code))) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
  return json({ ok: true });
});
