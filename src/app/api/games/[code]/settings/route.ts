import { settingsSchema } from "@/lib/settings";
import { requireHost } from "@/server/auth";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { updateSettings } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };

export const PATCH = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const patch = await readJson(req, settingsSchema.partial());
  const game = await updateSettings(db, normalizeCode((await ctx.params).code), patch);
  return json({ ok: true, version: game.version });
});
