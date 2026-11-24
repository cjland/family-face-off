import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame, getQuestionnaire, saveAnswers } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };

export const GET = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  return json({ items: await getQuestionnaire(db, player), ready: Boolean(player.readyAt), locked: Boolean(game.rosterLockedAt) });
});

const body = z.object({
  answers: z.array(z.object({ slot: z.number().int().min(1).max(8), answer: z.string().max(400) })).min(1).max(8),
});

export const PATCH = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  const { answers } = await readJson(req, body);
  return json({ items: await saveAnswers(db, game, player, answers) });
});
