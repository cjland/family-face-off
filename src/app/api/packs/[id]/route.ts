import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { deletePack, packInput, updatePack } from "@/server/packs";

type Ctx = { params: Promise<{ id: string }> };
const id = async (ctx: Ctx) => {
  const v = (await ctx.params).id;
  if (!z.string().uuid().safeParse(v).success) throw new ApiError("NOT_FOUND", "That pack is gone.");
  return v;
};

export const PATCH = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  return json({ pack: await updatePack(db, await id(ctx), await readJson(req, packInput, 40_000)) });
});

export const DELETE = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  await deletePack(db, await id(ctx));
  return json({ ok: true });
});
