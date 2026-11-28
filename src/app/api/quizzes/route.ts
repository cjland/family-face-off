import { requireHost } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { createQuiz, listQuizzes, quizInput } from "@/server/quizzes";

/** Quiz types the host designed, plus how many trivia questions each category/difficulty has. */
export const GET = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json(await listQuizzes(db));
});

export const POST = route(async (req, _ctx, db) => {
  await requireHost(db, req);
  return json({ quiz: await createQuiz(db, await readJson(req, quizInput, 10_000)) });
});
