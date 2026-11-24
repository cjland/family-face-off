import { clearHostCookie, destroyHostSession } from "@/server/auth";
import { json, route } from "@/server/http";

export const POST = route(async (req, _ctx, db) => {
  await destroyHostSession(db, req);
  const res = json({ ok: true });
  clearHostCookie(res);
  return res;
});
