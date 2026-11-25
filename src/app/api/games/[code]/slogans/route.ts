import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame, setSlogans } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
// Generous here; the real limit (and the family-friendly check) is in validateSlogan.
const body = z.object({ win: z.string().max(200).nullable().optional(), lose: z.string().max(200).nullable().optional() });

/** A player sets their own win / lose catchphrases. */
export const PATCH = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  await setSlogans(db, game, player, await readJson(req, body));
  return json({ ok: true });
});
