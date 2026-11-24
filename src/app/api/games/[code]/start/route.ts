import { z } from "zod";
import { requireHost } from "@/server/auth";
import { prepareOptions } from "@/server/context";
import { startGame } from "@/server/engine";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({
  excludeUnready: z.boolean().default(false),
  perPlayer: z.number().int().min(1).max(8).optional(),
});

export const maxDuration = 60;

export const POST = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const { excludeUnready, perPlayer } = await readJson(req, body);
  const result = await startGame(db, game.id, { excludeUnready, perPlayer }, prepareOptions());
  return json(result);
});
