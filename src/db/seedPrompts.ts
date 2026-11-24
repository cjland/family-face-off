import { notInArray, sql } from "drizzle-orm";
import { PROMPT_BANK } from "@/lib/promptBank";
import type { DB } from "./client";
import { prompts } from "./schema";

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
  return rows.length;
}
