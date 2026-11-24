import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { requireHost } from "@/server/auth";
import { demoToolsEnabled } from "@/server/context";
import { json, normalizeCode, readJson, route } from "@/server/http";
import { addDemoPlayers } from "@/server/lobby";

type Ctx = { params: Promise<{ code: string }> };
const body = z.object({ count: z.number().int().min(1).max(8).default(4) });

/** Adds clearly-labelled fictional bot players for solo testing. Dev/opt-in only. */
export const POST = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  if (!demoToolsEnabled()) throw new ApiError("FORBIDDEN", "Demo tools are turned off. Set ENABLE_DEMO_TOOLS=true to use them.");
  const { count } = await readJson(req, body);
  const added = await addDemoPlayers(db, normalizeCode((await ctx.params).code), count);
  return json({ added });
});
