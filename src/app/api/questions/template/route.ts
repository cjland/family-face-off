import { templateCsv } from "@/lib/customCsv";
import { requireHost } from "@/server/auth";
import { route } from "@/server/http";
import { csvResponse } from "@/server/csv";

/** The blank template (with clearly-marked sample rows) to fill in. */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return csvResponse(templateCsv(), "family-face-off-questions-template.csv");
});
