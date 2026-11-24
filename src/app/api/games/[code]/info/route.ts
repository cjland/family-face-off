import { json, normalizeCode, route } from "@/server/http";
import { joinInfo } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };

/** Public join-page info: title, family, theme, whether joining is open, and taken pieces (no names). */
export const GET = route<Ctx>(async (_req, ctx, db) => {
  return json(await joinInfo(db, normalizeCode((await ctx.params).code)));
});
