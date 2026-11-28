import { z } from "zod";
import { requireHost } from "@/server/auth";
import { json, route } from "@/server/http";
import { deleteQuiz } from "@/server/quizzes";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, ctx, db) => {
  await requireHost(db, req);
  const id = (await ctx.params).id;
  if (z.string().uuid().safeParse(id).success) await deleteQuiz(db, id);
  return json({ ok: true });
});
