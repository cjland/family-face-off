import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { env, envProblems } from "@/lib/env";
import { json } from "@/server/http";

/**
 * Liveness + configuration + database check. Reports which settings are wrong by name only;
 * never exposes values.
 */
export async function GET() {
  const problems = envProblems();
  if (problems.length) {
    return json({ ok: false, config: "invalid", problems, database: false }, { status: 503 });
  }
  const e = env();
  const handle = createDb(e.DATABASE_URL, e.DATABASE_DRIVER);
  let database = false;
  let databaseError: string | undefined;
  try {
    await handle.db.execute(sql`select 1`);
    const [tables] = (
      (await handle.db.execute(sql`select count(*)::int as n from prompts where active`)) as unknown as { rows: { n: number }[] }
    ).rows;
    // Newest schema pieces: if any is missing, the latest neon-setup.sql hasn't been run.
    const [schema] = (
      (await handle.db.execute(sql`
        select to_regclass('public.player_photos') is not null as photos,
               to_regclass('public.families') is not null as families,
               exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                       where t.typname = 'game_phase' and e.enumlabel = 'LEADERBOARD') as leaderboard,
               exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'players' and column_name = 'win_slogan') as slogans,
               exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'rounds' and column_name = 'bonus_question_id') as bonus
      `)) as unknown as { rows: { photos: boolean; families: boolean; leaderboard: boolean; slogans: boolean; bonus: boolean }[] }
    ).rows;
    database = true;
    if (!tables?.n) databaseError = "connected, but no questions loaded: run neon-setup.sql in the Neon SQL Editor";
    else if (!schema?.photos || !schema?.families || !schema?.leaderboard || !schema?.slogans || !schema?.bonus) {
      databaseError = "connected, but the database is out of date: run the latest neon-setup.sql in the Neon SQL Editor";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    databaseError = /relation .* does not exist/.test(msg)
      ? "connected, but tables are missing: run neon-setup.sql in the Neon SQL Editor"
      : /password authentication|authentication failed/i.test(msg)
        ? "DATABASE_URL credentials were rejected"
        : /ENOTFOUND|getaddrinfo/i.test(msg)
          ? "DATABASE_URL host not found"
          : "could not connect to the database";
    database = false;
  } finally {
    await handle.close().catch(() => {});
  }
  const ok = database && !databaseError;
  return json({ ok, config: "valid", database, ...(databaseError ? { databaseError } : {}) }, { status: ok ? 200 : 503 });
}
