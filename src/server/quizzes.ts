import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { bonusQuestions, quizPresets } from "@/db/schema";
import type { QuizPreset } from "@/lib/quizPresets";
import { cleanText } from "@/lib/text";

export const quizInput = z.object({
  name: z.string().trim().min(1, "Give the quiz a name.").max(40),
  emoji: z.string().trim().min(1).max(8).default("🎯"),
  about: z.string().trim().max(120).default(""),
  categories: z.array(z.string().max(60)).max(40).default([]),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  questions: z.number().int().min(1).max(80).default(15),
});

const toPreset = (r: typeof quizPresets.$inferSelect): QuizPreset => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  about: r.about,
  categories: r.config.categories,
  difficulty: r.config.difficulty,
  questions: r.config.questions,
});

export async function listQuizzes(db: DB) {
  const [rows, counts] = await Promise.all([
    db.select().from(quizPresets).orderBy(asc(quizPresets.name)),
    db
      .select({ category: bonusQuestions.category, difficulty: bonusQuestions.difficulty, n: sql<number>`count(*)::int` })
      .from(bonusQuestions)
      .where(and(eq(bonusQuestions.active, true), isNull(bonusQuestions.seasonal)))
      .groupBy(bonusQuestions.category, bonusQuestions.difficulty),
  ]);
  return { quizzes: rows.map(toPreset), counts };
}

export async function createQuiz(db: DB, input: z.infer<typeof quizInput>): Promise<QuizPreset> {
  const [row] = await db
    .insert(quizPresets)
    .values({
      name: cleanText(input.name),
      emoji: input.emoji,
      about: cleanText(input.about),
      config: { categories: input.categories, difficulty: input.difficulty, questions: input.questions },
    })
    .returning();
  return toPreset(row);
}

export async function deleteQuiz(db: DB, id: string): Promise<void> {
  await db.delete(quizPresets).where(eq(quizPresets.id, id));
}
