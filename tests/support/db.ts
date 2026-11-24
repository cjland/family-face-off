import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { seedPrompts } from "@/db/seedPrompts";

let pool: pg.Pool | null = null;
let db: DB | null = null;

export async function testDb(): Promise<DB> {
  if (db) return db;
  const url = process.env.DATABASE_URL!;
  if (!/test/.test(url)) throw new Error("Refusing to run integration tests against a non-test database URL.");
  pool = new pg.Pool({ connectionString: url, max: 20 });
  db = drizzle({ client: pool, schema }) as unknown as DB;
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  await seedPrompts(db);
  return db;
}

export async function resetGames(d: DB) {
  await d.execute(sql`truncate games, host_sessions, rate_limits cascade`);
}

export async function closeTestDb() {
  await pool?.end();
  pool = null;
  db = null;
}
