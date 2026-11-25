import { cleanText, isInappropriate, normalizeKey } from "./text";

/** Catchphrases shown on the TV when a player wins or loses a round (and for the champion). */
export const SLOGAN_MAX = 40;

export const WIN_SLOGANS = [
  "Never doubt me!",
  "Too easy!",
  "I know you better than you do!",
  "Read 'em and weep!",
  "Bow down!",
  "Call me the family genius",
  "Mic drop! 🎤",
  "Was there ever any doubt?",
  "I'm kind of a big deal",
  "Winner winner, turkey dinner!",
  "Somebody frame this moment",
  "Practice makes perfect",
];

export const LOSE_SLOGANS = [
  "I meant to do that",
  "I'm just warming up",
  "Let's call it a practice round",
  "Who even knows that?",
  "My phone lagged!",
  "I demand a recount!",
  "Wait, we're keeping score?",
  "Clearly a trick question",
  "I was being nice",
  "Next one's mine!",
  "That answer was rigged",
  "I blame the cat",
];

export type SloganKind = "win" | "lose";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** The player's own catchphrase, or a stable picked-for-you one so there's always something fun. */
export function sloganFor(playerId: string, kind: SloganKind, custom: string | null | undefined): string {
  if (custom && custom.trim()) return custom;
  const list = kind === "win" ? WIN_SLOGANS : LOSE_SLOGANS;
  return list[hash(`${playerId}:${kind}`) % list.length];
}

export type SloganCheck = { ok: true; value: string | null } | { ok: false; reason: string };

/** Empty means "pick one for me". */
export function validateSlogan(raw: string | null | undefined): SloganCheck {
  const value = cleanText(raw ?? "");
  if (!value) return { ok: true, value: null };
  if (value.length > SLOGAN_MAX) return { ok: false, reason: `Keep it short: ${SLOGAN_MAX} characters or less.` };
  if (!normalizeKey(value)) return { ok: false, reason: "Please use at least one letter or number." };
  if (isInappropriate(value)) return { ok: false, reason: "Let's keep it family-friendly." };
  return { ok: true, value };
}
