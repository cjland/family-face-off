import { z } from "zod";
import { requirePlayer } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame, setReady } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ ready: z.boolean().default(true) });

export const POST = route<Ctx>(async (req, ctx, db) => {
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const player = await requirePlayer(db, req, game);
  const { ready } = await readJson(req, body);
  await setReady(db, game, player, ready);
  return json({ ok: true, ready });
});
