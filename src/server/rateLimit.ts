import { lt, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { ApiError } from "@/lib/errors";

/**
 * Fixed-window rate limit stored in Postgres (no in-memory state, so it works across
 * serverless instances). One atomic upsert per check.
 */
export async function rateLimit(db: DB, key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = (await db.execute(sql`
    insert into ${rateLimits} (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})
                   then 1 else ${rateLimits.count} + 1 end,
      window_start = case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})
                   then now() else ${rateLimits.windowStart} end
    returning count
  `)) as unknown as { rows: { count: number }[] };
  const count = Number(rows.rows[0]?.count ?? 0);
  if (count > limit) {
    throw new ApiError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
  }
}

export async function cleanupRateLimits(db: DB): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
}
