import { z } from "zod";
import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { deleteQuestionGroup, listQuestionGroups, uploadQuestions } from "@/server/questions";

/** Uploaded question groups (Custom mode). */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ groups: await listQuestionGroups(db) });
});

const upload = z.object({ csv: z.string().min(1).max(600_000), replace: z.boolean().default(false) });

/** Upload a filled-in template (CSV text). Bad rows are reported and skipped. */
export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const { csv, replace } = await readJson(req, upload, 650_000);
  return json(await uploadQuestions(db, csv, replace));
});

/** Delete one group: DELETE /api/questions?group=Name */
export const DELETE = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const group = new URL(req.url).searchParams.get("group");
  if (!group) return json({ error: { code: "VALIDATION", message: "Which group?" } }, { status: 400 });
  return json({ deleted: await deleteQuestionGroup(db, group) });
});
