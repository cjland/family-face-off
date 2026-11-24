import { z } from "zod";
import { playerTokenFrom, setPlayerCookie } from "@/server/auth";
import { clientIp, json, normalizeCode, readJson, route } from "@/server/http";
import { joinGame } from "@/server/lobby";
import { rateLimit } from "@/server/rateLimit";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ name: z.string().max(100).default(""), piece: z.string().max(20).optional() });

export const POST = route<Ctx>(async (req, ctx, db) => {
  const code = normalizeCode((await ctx.params).code);
  const existing = playerTokenFrom(req, code);
  if (!existing) await rateLimit(db, `join:${clientIp(req)}`, 30, 60);
  const { name, piece } = await readJson(req, body);
  const result = await joinGame(db, code, name, existing, { piece });
  const res = json({ playerId: result.player.id, name: result.player.displayName, reconnected: result.reconnected });
  if (result.token) setPlayerCookie(res, code, result.token);
  return res;
});
