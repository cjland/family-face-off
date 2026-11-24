import { requireHost } from "@/server/auth";
import { aiAvailable, demoToolsEnabled } from "@/server/context";
import { json, route } from "@/server/http";

export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ host: true, aiAvailable: aiAvailable(), demoTools: demoToolsEnabled() });
});
