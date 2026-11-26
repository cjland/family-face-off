import { notInArray, sql } from "drizzle-orm";
import { BONUS_QUESTIONS } from "@/data/bonusQuestions";
import { PROMPT_BANK } from "@/lib/promptBank";
import type { DB } from "./client";
import { bonusQuestions, prompts } from "./schema";

/** Idempotently upserts the prompt bank. Safe to run on every deploy. */
export async function seedPrompts(db: DB): Promise<number> {
  const rows = PROMPT_BANK.map((pr, i) => ({
    id: pr.id,
    text: pr.text,
    questionTemplate: pr.template,
    category: pr.category,
    common: pr.common,
    sortOrder: i,
    fallbackOptions: pr.fallback,
    options: pr.options,
    active: pr.active,
    seasonal: pr.seasonal,
  }));
  await db
    .insert(prompts)
    .values(rows)
    .onConflictDoUpdate({
      target: prompts.id,
      set: {
        text: sql`excluded.text`,
        questionTemplate: sql`excluded.question_template`,
        category: sql`excluded.category`,
        common: sql`excluded.common`,
        sortOrder: sql`excluded.sort_order`,
        fallbackOptions: sql`excluded.fallback_options`,
        options: sql`excluded.options`,
        active: sql`excluded.active`,
        seasonal: sql`excluded.seasonal`,
      },
    });
  // Questions removed from the bank are retired (kept for old games' answers, never assigned again).
  await db
    .update(prompts)
    .set({ active: false, common: false })
    .where(notInArray(prompts.id, rows.map((r) => r.id)));
  await seedBonusQuestions(db);
  return rows.length;
}

/** Idempotently upserts the bonus trivia questions. */
export async function seedBonusQuestions(db: DB): Promise<number> {
  const rows = BONUS_QUESTIONS.map((b, i) => ({
    id: b.id,
    question: b.question,
    options: [...b.options],
    correctIndex: b.correct,
    difficulty: b.difficulty,
    points: b.points,
    timeSeconds: b.timeSeconds,
    category: b.category,
    active: b.active,
    seasonal: b.seasonal,
    sortOrder: i,
  }));
  await db
    .insert(bonusQuestions)
    .values(rows)
    .onConflictDoUpdate({
      target: bonusQuestions.id,
      set: {
        question: sql`excluded.question`,
        options: sql`excluded.options`,
        correctIndex: sql`excluded.correct_index`,
        difficulty: sql`excluded.difficulty`,
        points: sql`excluded.points`,
        timeSeconds: sql`excluded.time_seconds`,
        category: sql`excluded.category`,
        active: sql`excluded.active`,
        seasonal: sql`excluded.seasonal`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
  return rows.length;
}
