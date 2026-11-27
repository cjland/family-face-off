import { requireHost } from "@/server/auth";
import { json, route } from "@/server/http";
import { libraryContents } from "@/server/questions";

/** All questions (about-you, built-in trivia, uploaded) for the host's library page. */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json(await libraryContents(db));
});
