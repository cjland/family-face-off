import "server-only";
import manifest from "../../public/audio/manifest.json";
import { introIndex, introPool, type IntroPool } from "@/lib/introClip";

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
