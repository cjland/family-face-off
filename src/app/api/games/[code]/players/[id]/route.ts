import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { requireHost } from "@/server/auth";
import { json, normalizeCode, route } from "@/server/http";
import { removePlayer } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string; id: string }> };

export const DELETE = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const { code, id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", "Player not found.");
  await removePlayer(db, normalizeCode(code), id);
  return json({ ok: true });
});
