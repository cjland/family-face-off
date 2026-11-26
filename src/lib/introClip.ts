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
