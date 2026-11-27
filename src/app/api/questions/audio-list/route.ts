import { requireHost } from "@/server/auth";
import { route } from "@/server/http";
import { csvResponse } from "@/server/csv";
import { questionAudioList } from "@/server/questions";

/** Which announcer clips to record for uploaded questions (?group=Name for one group). */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  const group = new URL(req.url).searchParams.get("group");
  return csvResponse(await questionAudioList(db, group), `audio-list${group ? `-${group.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}.csv`);
});
