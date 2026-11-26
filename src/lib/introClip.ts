import { hashString } from "@/lib/prng";

/**
 * Which "get ready" line the announcer says before a question's 5-4-3-2-1. The server and the TV
 * both work it out from the game code and question number, so the server can hold the countdown
 * until he's finished (it knows each clip's length) and the TV plays exactly that clip.
 */
export type IntroPool = "first" | "final" | "general";

export function introPool(number: number, total: number): IntroPool {
  if (number === 1) return "first";
  if (number === total) return "final";
  return "general";
}

/** Index into the pool; consecutive questions never get the same line. */
export function introIndex(code: string, number: number, poolLength: number): number {
  if (poolLength <= 0) return -1;
  return (hashString(code) + number) % poolLength;
}

/**
 * Bonus rounds: "It's time for a bonus question!" then a difficulty line ("This one's a little
 * tougher… and it's worth even more points!"). Picked from the round's position in the game.
 */
export function bonusIntroIndexes(code: string, ordinal: number, introLength: number, difficultyLength: number) {
  const h = hashString(`${code}:bonus`) + ordinal;
  return { intro: introLength > 0 ? h % introLength : -1, difficulty: difficultyLength > 0 ? h % difficultyLength : -1 };
}

/** Pause between the announcer's clips (matches manifest gapMs). */
export const ANNOUNCER_GAP_MS = 300;
