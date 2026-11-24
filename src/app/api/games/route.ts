import { z } from "zod";
import { settingsSchema } from "@/lib/settings";
import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { createGame, listGames } from "@/server/lobby";

const body = z.object({
  title: z.string().max(60).optional(),
  familyId: z.string().uuid().optional(),
  familyName: z.string().max(60).optional(),
  settings: settingsSchema.partial().optional(),
});

export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const input = await readJson(req, body);
  const game = await createGame(db, input);
  return json({ code: game.code }, { status: 201 });
});

export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ games: await listGames(db) });
});
