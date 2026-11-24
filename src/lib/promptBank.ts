/**
 * The personal-question bank, loaded from src/data/questions.json and validated at import.
 * Each question has six curated options (four regular, two humorous). Players pick one to
 * answer about themselves, or type their own; the other options become wrong choices in the quiz.
 *
 * To edit questions, change src/data/questions.json, then re-run the seed
 * (npm run db:seed, or regenerate neon-setup.sql with `npx tsx scripts/build-setup-sql.ts`).
 */
import { z } from "zod";
import raw from "../data/questions.json";

const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/i),
  category: z.string().min(1),
  personal_question: z.string().min(1).max(200),
  multiplayer_question: z.string().includes("{playerName}"),
  active: z.boolean(),
  seasonal: z.string().nullable(),
  options: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1).max(120), is_humorous: z.boolean() }))
    .min(4),
});

export type PromptOption = { id: string; text: string; humorous: boolean };

export type PromptSeed = {
  id: string;
  text: string;
  template: string;
  category: string;
  common: boolean;
  active: boolean;
  seasonal: string | null;
  options: PromptOption[];
  /** Option texts, used as curated wrong choices. */
  fallback: string[];
};

/** Everyone answers these four (spec: food, dessert, dream destination, superpower). */
export const COMMON_PROMPT_IDS = ["q001", "q002", "q017", "q053"];

const parsed = z.array(questionSchema).parse(raw);

export const PROMPT_BANK: PromptSeed[] = [
  ...COMMON_PROMPT_IDS.map((id) => parsed.find((q) => q.id === id)!),
  ...parsed.filter((q) => !COMMON_PROMPT_IDS.includes(q.id)),
].map((q) => ({
  id: q.id,
  text: q.personal_question,
  template: q.multiplayer_question.replaceAll("{playerName}", "{name}"),
  category: q.category,
  common: COMMON_PROMPT_IDS.includes(q.id),
  active: q.active,
  seasonal: q.seasonal,
  options: q.options.map((o) => ({ id: o.id, text: o.text, humorous: o.is_humorous })),
  fallback: q.options.map((o) => o.text),
}));

/** Seasonal questions are only handed out when the game's theme matches the season. */
export function seasonMatchesTheme(seasonal: string | null, theme: string): boolean {
  if (!seasonal) return true;
  return seasonal.toLowerCase() === theme.toLowerCase();
}
