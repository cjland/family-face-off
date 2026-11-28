import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { createPack, listPacks, packInput } from "@/server/packs";

/** Character packs (mashups) for the host's Characters page and game setup. */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ packs: await listPacks(db) });
});

export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ pack: await createPack(db, await readJson(req, packInput, 40_000)) });
});
