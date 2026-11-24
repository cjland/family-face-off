import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame, replacePrompt } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ slot: z.number().int().min(1).max(8) });

export const POST = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  const { slot } = await readJson(req, body);
  return json({ items: await replacePrompt(db, game, player, slot) });
});
