import "server-only";
import { randomBytes } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { customQuestions } from "@/db/schema";
import { audioListCsv, readQuestions, TEMPLATE_HEADERS, toCsv, type RowError } from "@/lib/customCsv";
import { ApiError } from "@/lib/errors";

export type QuestionGroupDTO = { name: string; count: number; genres: string[]; easy: number; medium: number; hard: number };

/** The host's uploaded question groups (Custom mode), with how many questions each has. */
export async function listQuestionGroups(db: DB): Promise<QuestionGroupDTO[]> {
  const rows = await db
    .select({ name: customQuestions.groupName, genre: customQuestions.genre, difficulty: customQuestions.difficulty, n: sql<number>`count(*)::int` })
    .from(customQuestions)
    .groupBy(customQuestions.groupName, customQuestions.genre, customQuestions.difficulty)
    .orderBy(asc(customQuestions.groupName));
  const groups = new Map<string, QuestionGroupDTO>();
  for (const r of rows) {
    const g = groups.get(r.name) ?? { name: r.name, count: 0, genres: [], easy: 0, medium: 0, hard: 0 };
    g.count += r.n;
    if (r.genre && !g.genres.includes(r.genre)) g.genres.push(r.genre);
    if (r.difficulty === "easy" || r.difficulty === "medium" || r.difficulty === "hard") g[r.difficulty] += r.n;
    groups.set(r.name, g);
  }
  return [...groups.values()];
}

const MAX_QUESTIONS = 2000;
const newAudioId = () => `cq-${randomBytes(4).toString("hex")}`;

/**
 * Adds questions from an uploaded CSV. Questions already in the same group (same wording) are
 * skipped; with `replace`, the groups in the file are emptied first.
 */
export async function uploadQuestions(
  db: DB,
  csv: string,
  replace: boolean,
): Promise<{ added: number; skipped: number; groups: string[]; errors: RowError[] }> {
  const { questions, errors } = readQuestions(csv);
  if (!questions.length) return { added: 0, skipped: 0, groups: [], errors: errors.length ? errors : [{ row: 1, message: "No questions found." }] };
  const groups = [...new Set(questions.map((q) => q.groupName))];
  return db.transaction(async (tx) => {
    if (replace) await tx.delete(customQuestions).where(inArray(customQuestions.groupName, groups));
    const existing = await tx
      .select({ groupName: customQuestions.groupName, question: customQuestions.question })
      .from(customQuestions)
      .where(inArray(customQuestions.groupName, groups));
    const seen = new Set(existing.map((e) => `${e.groupName}\u0000${e.question.toLowerCase()}`));
    const fresh = questions.filter((q) => {
      const k = `${q.groupName}\u0000${q.question.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customQuestions);
    if (n + fresh.length > MAX_QUESTIONS) throw new ApiError("VALIDATION", `That would be more than ${MAX_QUESTIONS} uploaded questions. Delete a group first.`);
    if (fresh.length) {
      await tx.insert(customQuestions).values(
        fresh.map((q) => ({
          groupName: q.groupName,
          genre: q.genre,
          difficulty: q.difficulty,
          question: q.question,
          options: [...q.options],
          correctIndex: q.correctIndex,
          seconds: q.seconds,
          audioId: newAudioId(),
        })),
      );
    }
    return { added: fresh.length, skipped: questions.length - fresh.length, groups, errors };
  });
}

export async function deleteQuestionGroup(db: DB, name: string): Promise<number> {
  const rows = await db.delete(customQuestions).where(eq(customQuestions.groupName, name)).returning({ id: customQuestions.id });
  return rows.length;
}

/** The audio list (CSV) for one group, or all groups. */
export async function questionAudioList(db: DB, group: string | null): Promise<string> {
  const rows = await db
    .select()
    .from(customQuestions)
    .where(group ? eq(customQuestions.groupName, group) : undefined)
    .orderBy(asc(customQuestions.groupName), asc(customQuestions.createdAt));
  return audioListCsv(rows.map((r) => ({ audioId: r.audioId, groupName: r.groupName, question: r.question, answer: r.options[r.correctIndex] ?? "" })));
}

/** Everything in one group (or all), as a CSV in the template's format, for editing and re-uploading. */
export async function exportQuestions(db: DB, group: string | null): Promise<string> {
  const rows = await db
    .select()
    .from(customQuestions)
    .where(group ? eq(customQuestions.groupName, group) : undefined)
    .orderBy(asc(customQuestions.groupName), asc(customQuestions.createdAt));
  return toCsv([
    [...TEMPLATE_HEADERS],
    ...rows.map((r) => [r.groupName, r.genre, r.difficulty, r.question, ...r.options, "ABCD"[r.correctIndex], r.seconds ? String(r.seconds) : ""]),
  ]);
}
