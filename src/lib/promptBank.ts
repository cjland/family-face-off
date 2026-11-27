/**
 * The personal-question bank, loaded from src/data/questions.json and validated at import.
 * Each question has a pool of curated options (at least six; up to 30 or so, roughly two
 * regular for every humorous one). Each player is shown six of them (four regular, two
 * humorous), a different six per player so the choices don't get stale. Players pick one or type
 * their own; the pool also supplies wrong choices in the quiz.
 *
 * To edit questions, change src/data/questions.json, then re-run the seed
 * (npm run db:seed, or regenerate neon-setup.sql with `npx tsx scripts/build-setup-sql.ts`).
 */
import { z } from "zod";
import raw from "../data/questions.json";
import { createRng } from "@/lib/prng";

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

/** How many options a player sees for a question: four regular and two humorous. */
export const SHOWN_REGULAR = 4;
export const SHOWN_HUMOROUS = 2;

/**
 * The six options this player sees for this question, picked from the pool with a stable seed
 * (so a refresh shows the same six). Their current pick is always included.
 */
export function pickShownOptions<T extends { id: string; humorous: boolean }>(pool: T[], seed: string, keepId?: string | null): T[] {
  if (pool.length <= SHOWN_REGULAR + SHOWN_HUMOROUS) return pool;
  const rng = createRng(seed);
  const shuffle = (a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const regular = shuffle(pool.filter((o) => !o.humorous)).slice(0, SHOWN_REGULAR);
  const funny = shuffle(pool.filter((o) => o.humorous)).slice(0, SHOWN_HUMOROUS);
  const keep = keepId ? pool.find((o) => o.id === keepId) : undefined;
  if (keep && !regular.includes(keep) && !funny.includes(keep)) {
    const list = keep.humorous ? funny : regular;
    if (list.length) list[list.length - 1] = keep;
    else list.push(keep);
  }
  // Too few of one kind? Top up from the other so there are still six.
  const shown = [...regular, ...funny];
  for (const o of shuffle(pool)) {
    if (shown.length >= SHOWN_REGULAR + SHOWN_HUMOROUS) break;
    if (!shown.includes(o)) shown.push(o);
  }
  return shown;
}

/** Seasonal questions are only handed out when the game's theme matches the season. */
export function seasonMatchesTheme(seasonal: string | null, theme: string): boolean {
  if (!seasonal) return true;
  return seasonal.toLowerCase() === theme.toLowerCase();
}
