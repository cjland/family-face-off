import { z } from "zod";
import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { getOrCreateFamily, listFamilies } from "@/server/lobby";

export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ families: await listFamilies(db) });
});

const body = z.object({ name: z.string().min(1).max(60) });

/** Adds a family (or returns the existing one with the same name). */
export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const { name } = await readJson(req, body);
  const family = await getOrCreateFamily(db, name);
  return json({ family: { id: family.id, name: family.name } }, { status: 201 });
});
