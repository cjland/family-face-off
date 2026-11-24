import { ApiError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getPlayer, isHost } from "@/server/auth";
import { aiAvailable, canViewDisplay, demoToolsEnabled } from "@/server/context";
import { json, normalizeCode, route } from "@/server/http";
import { findGame } from "@/server/lobby";
import { getGameState } from "@/server/state";

type Ctx = { params: Promise<{ code: string }> };

export const GET = route<Ctx>(async (req, ctx, db) => {
  const code = normalizeCode((await ctx.params).code);
  const view = req.nextUrl.searchParams.get("view") ?? "player";
  if (view !== "player" && view !== "display" && view !== "host") throw new ApiError("VALIDATION", "Unknown view.");
  const game = await findGame(db, code);

  let host = false;
  let player = null;
  if (view === "host" || view === "display") host = await isHost(db, req);
  if (view === "display" && !(await canViewDisplay(db, req, game))) {
    throw new ApiError("FORBIDDEN", "Open the TV display from the host screen to get a valid link.");
  }
  if (view === "player") player = await getPlayer(db, req, game);

  const state = await getGameState(db, code, {
    view,
    player,
    isHost: host,
    secret: env().SESSION_SECRET,
    demoTools: demoToolsEnabled(),
    aiAvailable: aiAvailable(),
  });
  return json(state);
});
