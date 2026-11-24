import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/**
 * Both drivers support interactive transactions (BEGIN ... SELECT FOR UPDATE ... COMMIT),
 * which the game state machine depends on. The Neon HTTP driver does NOT, so it is never used.
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = { db: DB; close: () => Promise<void> };

export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

let sharedPgPool: pg.Pool | null = null;
let sharedPgUrl: string | null = null;

/**
 * Creates a database handle.
 * - Neon (default when the URL host is *.neon.tech): a WebSocket Pool per request, closed after
 *   the response as Neon recommends for serverless functions.
 * - Anything else (local Postgres, CI): a shared node-postgres pool.
 */
export function createDb(url: string, driver: "auto" | "neon" | "pg" = "auto"): DbHandle {
  const useNeon = driver === "neon" || (driver === "auto" && isNeonUrl(url));
  if (useNeon) {
    const pool = new NeonPool({ connectionString: url, max: 3 });
    const db = drizzleNeon({ client: pool, schema }) as unknown as DB;
    return { db, close: () => pool.end() };
  }
  if (!sharedPgPool || sharedPgUrl !== url) {
    sharedPgPool = new pg.Pool({ connectionString: url, max: 10 });
    sharedPgUrl = url;
  }
  const db = drizzlePg({ client: sharedPgPool, schema }) as unknown as DB;
  return { db, close: async () => {} };
}

export async function closeSharedPool() {
  if (sharedPgPool) {
    await sharedPgPool.end();
    sharedPgPool = null;
    sharedPgUrl = null;
  }
}

export { schema };
