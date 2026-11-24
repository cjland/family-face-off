import { ApiError } from "@/lib/errors";
import { getPlayer, isHost } from "@/server/auth";
import { canViewDisplay } from "@/server/context";
import { json, normalizeCode, route } from "@/server/http";
import { findGame } from "@/server/lobby";
import { getResults } from "@/server/state";

type Ctx = { params: Promise<{ code: string }> };

/** Final standings: available to the host, the display, and players of this game. */
export const GET = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const allowed = (await isHost(db, req)) || (await canViewDisplay(db, req, game)) || Boolean(await getPlayer(db, req, game));
  if (!allowed) throw new ApiError("FORBIDDEN", "You don't have access to these results.");
  return json(await getResults(db, game.code));
});
