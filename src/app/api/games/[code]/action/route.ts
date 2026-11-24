import { z } from "zod";
import { requireHost } from "@/server/auth";
import { prepareOptions } from "@/server/context";
import { ACTIONS, performAction } from "@/server/engine";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { findGame } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ action: z.enum(ACTIONS), expectedVersion: z.number().int().min(0) });

export const maxDuration = 60;

export const POST = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const game = await findGame(db, normalizeCode((await ctx.params).code));
  const { action, expectedVersion } = await readJson(req, body);
  const result = await performAction(db, game.id, action, expectedVersion, action === "prepare" ? prepareOptions() : undefined);
  return json(result);
});
