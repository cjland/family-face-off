import "server-only";
import manifest from "../../public/audio/manifest.json";
import { ANNOUNCER_GAP_MS, bonusIntroIndexes, introIndex, introPool, type IntroPool } from "@/lib/introClip";

type Clip = { durationMs: number };
const pools: Record<IntroPool, Clip[]> = {
  first: manifest.leadin.first,
  final: manifest.leadin.final,
  general: manifest.countdown.intro,
};

/** How long the announcer's "get ready" line for this question lasts (0 if there's none). */
export function introDurationMs(code: string, number: number, total: number): number {
  const pool = pools[introPool(number, total)];
  const i = introIndex(code, number, pool.length);
  return i >= 0 ? pool[i].durationMs : 0;
}

/** How long the bonus intro + difficulty line lasts for this bonus round. */
export function bonusIntroDurationMs(code: string, ordinal: number, difficulty: string): number {
  const b = manifest.bonus;
  if (!b) return 0;
  const diff = (b as Record<string, Clip[]>)[difficulty] ?? [];
  const i = bonusIntroIndexes(code, ordinal, b.intro.length, diff.length);
  const a = i.intro >= 0 ? b.intro[i.intro].durationMs : 0;
  const d = i.difficulty >= 0 ? diff[i.difficulty].durationMs : 0;
  return a + (a && d ? ANNOUNCER_GAP_MS : 0) + d;
}
