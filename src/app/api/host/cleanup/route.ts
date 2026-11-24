import { cleanupHostSessions, requireHost } from "@/server/auth";
import { json, route } from "@/server/http";
import { deleteExpiredGames } from "@/server/lobby";
import { cleanupRateLimits } from "@/server/rateLimit";

/** Host-triggered retention cleanup: deletes expired games and stale sessions/rate limits. */
export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const games = await deleteExpiredGames(db);
  await cleanupHostSessions(db);
  await cleanupRateLimits(db);
  return json({ ok: true, deletedGames: games });
});
