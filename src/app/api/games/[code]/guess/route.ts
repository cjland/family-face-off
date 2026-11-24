import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { submitGuess } from "@/server/engine";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame } from "@/server/lobby";
import { rateLimit } from "@/server/rateLimit";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ roundId: z.string().uuid(), optionId: z.string().min(1).max(40) });

export const POST = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  await rateLimit(db, `guess:${player.id}`, 30, 60);
  const { roundId, optionId } = await readJson(req, body);
  return json(await submitGuess(db, game.id, player, roundId, optionId));
});
