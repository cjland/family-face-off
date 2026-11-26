import { hashString } from "@/lib/prng";

/**
 * What the announcer says before a question's 5-4-3-2-1: a warm-up line ("I hope everyone's
 * ready…", or "Let the fun begin!" for question 1), then "Okay, here comes question twelve!"
 * ("…the first question!" / "…the last question!"). The server and the TV both work it out from
 * the game code and question number, so the server can hold the countdown until he's finished
 * (it knows each clip's length) and the TV plays exactly those clips.
 */
export type IntroPool = "first" | "general";

export function introPool(number: number, _total: number): IntroPool {
  void _total;
  // The "final question!" lead-ins would double up with "here comes the last question", so the
  // last question gets a normal warm-up line.
  return number === 1 ? "first" : "general";
}

/** Key into manifest.hereComes: "first", "last", or the number (clips exist for 1–50). */
export function hereComesKey(number: number, total: number): { special: "first" | "last" } | { number: string } | null {
  if (number === 1) return { special: "first" };
  if (number === total) return { special: "last" };
  if (number >= 1 && number <= 50) return { number: String(number) };
  return null;
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
