import { sql } from "drizzle-orm";
import { route, json } from "@/server/http";

/** Liveness + database check. Exposes no configuration or secrets. */
export const GET = route(async (_req, _ctx, db) => {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  return json({ ok: database, database }, { status: database ? 200 : 503 });
});
