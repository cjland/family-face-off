import { createRng } from "@/lib/prng";

/**
 * Bonus trivia rounds: one right answer, everyone plays (nobody sits out), worth more than a
 * normal question. They go in the middle of the game (never first or last), easy → hard, so the
 * big points land late and keep it close.
 */
export type BonusDifficulty = "easy" | "medium" | "hard";

/** Points for a right bonus answer (a normal right answer is 1,000). */
export const BONUS_POINTS: Record<BonusDifficulty, number> = { easy: 1500, medium: 2000, hard: 2500 };

/** Stand-in "game piece" for bonus rounds in history and leaderboard pages (drawn as a 🎁). */
export const BONUS_PIECE = "bonus:gift";
export const BONUS_PERSON = { playerId: "bonus", name: "Bonus", piece: BONUS_PIECE };

export const DIFFICULTY_ORDER: BonusDifficulty[] = ["easy", "medium", "hard"];

export type BonusBankItem = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: string;
  timeSeconds: number;
};

/** Default number of bonus questions: one each time through everyone (questions per person). */
export function defaultBonusCount(perPlayer: number | undefined): number {
  return Math.max(1, Math.min(8, perPlayer ?? 3));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks `count` bonus questions with a spread of difficulties, returned easy → hard. Questions
 * this family saw recently are used only if there aren't enough others.
 */
export function pickBonus<T extends BonusBankItem>(bank: T[], count: number, seed: string, recentIds: Set<string> = new Set()): T[] {
  if (count <= 0 || bank.length === 0) return [];
  const rng = createRng(`${seed}:bonus`);
  const n = Math.min(count, bank.length);
  // Roughly a third each, leaning easy for small games (1 → easy, 2 → easy + hard, 3 → one each…).
  const hard = n >= 2 ? Math.round(n / 3) || 1 : 0;
  const easy = Math.ceil((n - hard) / 2);
  const want: Record<BonusDifficulty, number> = { easy, medium: n - hard - easy, hard };
  const byDiff = (d: string) => {
    const pool = shuffle(
      bank.filter((b) => b.difficulty === d),
      rng,
    );
    return [...pool.filter((b) => !recentIds.has(b.id)), ...pool.filter((b) => recentIds.has(b.id))];
  };
  const chosen: T[] = [];
  const leftovers: T[] = [];
  for (const d of DIFFICULTY_ORDER) {
    const pool = byDiff(d);
    chosen.push(...pool.slice(0, want[d]));
    leftovers.push(...pool.slice(want[d]));
  }
  // Not enough of some difficulty? Fill from whatever is left (fresh ones first).
  const rest = [...leftovers.filter((b) => !recentIds.has(b.id)), ...leftovers.filter((b) => recentIds.has(b.id))];
  while (chosen.length < n && rest.length) chosen.push(rest.shift()!);
  const rank = (d: string) => Math.max(0, DIFFICULTY_ORDER.indexOf(d as BonusDifficulty));
  return chosen.sort((a, b) => rank(a.difficulty) - rank(b.difficulty));
}

/**
 * Where bonus questions go: after how many regular questions each one is asked. Spread evenly,
 * never before the first or after the last regular question. Fewer than 2 regular questions
 * means there's no middle, so no bonus.
 */
export function bonusSlots(regularCount: number, bonusCount: number): number[] {
  const k = Math.min(bonusCount, Math.max(0, regularCount - 1));
  const slots: number[] = [];
  for (let i = 1; i <= k; i++) slots.push(Math.min(regularCount - 1, Math.max(1, Math.round((i * regularCount) / (k + 1)))));
  return slots;
}

/** Interleaves bonus items into the regular list at the given slots (both lists keep their order). */
export function interleave<R, B>(regular: R[], bonus: B[], slots: number[]): ({ kind: "regular"; item: R } | { kind: "bonus"; item: B })[] {
  const out: ({ kind: "regular"; item: R } | { kind: "bonus"; item: B })[] = [];
  let b = 0;
  regular.forEach((item, i) => {
    out.push({ kind: "regular", item });
    while (b < bonus.length && b < slots.length && slots[b] === i + 1) out.push({ kind: "bonus", item: bonus[b++] });
  });
  return out;
}

/** "Question 3 of 24", or "Bonus question" for bonus rounds (they don't count toward the numbers). */
export function roundLabel(round: { number: number; total: number; bonus?: { points: number } | null }): string {
  return round.bonus ? "🎁 Bonus question" : `Question ${round.number} of ${round.total}`;
}

export const DIFFICULTY_LABEL: Record<BonusDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
