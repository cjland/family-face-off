import { requireHost } from "@/server/auth";
import { previewRounds } from "@/server/engine";
import { json, normalizeCode, route } from "@/server/http";
import { findGame } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };

/** Lobby preview of how many questions can be built from ready players' answers. */
export const GET = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  return json(await previewRounds(db, game));
});
