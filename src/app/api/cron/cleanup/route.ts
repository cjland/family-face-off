import { ApiError } from "@/lib/errors";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { cleanupHostSessions } from "@/server/auth";
import { json, route } from "@/server/http";
import { deleteExpiredGames } from "@/server/lobby";
import { cleanupRateLimits } from "@/server/rateLimit";

/**
 * Optional scheduled cleanup. Only active when CRON_SECRET is set; Vercel Cron sends it as a
 * Bearer token. Nothing runs automatically unless you add a cron schedule (see README).
 */
export const GET = route(async (req, _ctx, db) => {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new ApiError("UNAUTHENTICATED", "Not authorized.");
  const games = await deleteExpiredGames(db);
  await cleanupHostSessions(db);
  await cleanupRateLimits(db);
  return json({ ok: true, deletedGames: games });
});
