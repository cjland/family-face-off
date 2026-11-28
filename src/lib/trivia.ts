import { createRng } from "@/lib/prng";
import { bonusSlots } from "@/lib/bonus";

/**
 * Quiz and Custom modes play trivia (one right answer, everyone plays). Speed questions, in any
 * mode, have a short timer and pay by finishing place.
 */
export const SPEED_TOP_POINTS = 1000;
export const SPEED_STEP = 200;
export const SPEED_MIN_POINTS = 200;

export function speedPlacePoints(place: number): number {
  return Math.max(SPEED_MIN_POINTS, SPEED_TOP_POINTS - SPEED_STEP * (place - 1));
}

const RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

/** Picks `count` trivia questions at random, then orders them easy → hard. */
export function pickTrivia<T extends { difficulty: string }>(items: T[], count: number, seed: string): T[] {
  const rng = createRng(`${seed}:trivia`);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, count)).sort((x, y) => (RANK[x.difficulty] ?? 1) - (RANK[y.difficulty] ?? 1));
}

/** Default number of speed questions: about one in six, at least one. */
export function defaultSpeedCount(questions: number): number {
  return Math.max(1, Math.round(questions / 6));
}

/**
 * Which questions (0-based positions among the numbered ones) become speed questions: spread out,
 * never the first or the last.
 */
export function speedPositions(questions: number, count: number): number[] {
  // bonusSlots gives "after how many questions" (1..n-1), which is exactly a middle position.
  return [...new Set(bonusSlots(questions, count))];
}

/**
 * The four choices shown for a trivia question: the right answer plus three others picked at
 * random from its answer pool (questions with exactly four answers keep them as written).
 */
export function fourChoices(options: string[], correctIndex: number, rng: () => number): { options: string[]; correctIndex: number } {
  if (options.length <= 4) return { options, correctIndex };
  const wrong = options.filter((_, i) => i !== correctIndex);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  const at = Math.floor(rng() * 4);
  const shown = wrong.slice(0, 3);
  shown.splice(at, 0, options[correctIndex]);
  return { options: shown, correctIndex: at };
}
