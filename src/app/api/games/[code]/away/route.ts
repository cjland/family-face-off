import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame, setAway } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ away: z.boolean() });

/** A player steps away (skipped until they're back) or says "I'm back". */
export const POST = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  const { away } = await readJson(req, body);
  await setAway(db, game, player, away);
  return json({ ok: true, away });
});
