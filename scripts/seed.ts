import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema";
import { seedPrompts } from "../src/db/seedPrompts";
import type { DB } from "../src/db/client";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL before seeding.");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle({ client: pool, schema }) as unknown as DB;
    const n = await seedPrompts(db);
    console.log(`Seeded ${n} prompts.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
