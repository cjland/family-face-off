import { requireHost } from "@/server/auth";
import { route } from "@/server/http";
import { csvResponse } from "@/server/csv";
import { exportQuestions } from "@/server/questions";

/** Download uploaded questions in the template format (?group=Name for one group). */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const group = new URL(req.url).searchParams.get("group");
  return csvResponse(await exportQuestions(db, group), `questions${group ? `-${group.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}.csv`);
});
