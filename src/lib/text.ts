import { ANSWER_MAX, NAME_MAX } from "./settings";

// Control characters, zero-width characters and bidi overrides are stripped from user text.
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g;

/** Unicode-normalizes, strips invisible characters and collapses whitespace. */
export function cleanText(input: string): string {
  return input.normalize("NFKC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Comparison key: cleaned, case-folded, punctuation-light. */
export function normalizeKey(input: string): string {
  return cleanText(input)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/^(the|a|an) /, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Loose singular form used for near-duplicate detection. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("es") && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function stemKey(input: string): string {
  return normalizeKey(input).split(" ").map(stem).join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * True when two answers are too similar to be separate multiple-choice options
 * (same words, plural forms, small typos, or one containing the other).
 */
export function nearDuplicate(a: string, b: string): boolean {
  const ka = stemKey(a);
  const kb = stemKey(b);
  if (!ka || !kb) return true;
  if (ka === kb) return true;
  const short = ka.length <= kb.length ? ka : kb;
  const long = ka.length <= kb.length ? kb : ka;
  if (short.length >= 4 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(long)) {
    return true;
  }
  // Typo tolerance only for longer words that start the same ("Hiking" vs "Biking" stay distinct).
  if (ka[0] !== kb[0]) return false;
  const maxEdits = short.length >= 10 ? 2 : short.length >= 6 ? 1 : 0;
  return levenshtein(ka, kb) <= maxEdits;
}

export type TextCheck = { ok: true; value: string } | { ok: false; reason: string };

export function validateDisplayName(raw: string): TextCheck {
  const value = cleanText(raw);
  if (!value) return { ok: false, reason: "Please enter a name." };
  if (value.length > NAME_MAX) return { ok: false, reason: `Names can be at most ${NAME_MAX} characters.` };
  if (!normalizeKey(value)) return { ok: false, reason: "Please use at least one letter or number." };
  if (isInappropriate(value)) return { ok: false, reason: "Let's keep names family-friendly. Try another one." };
  return { ok: true, value };
}

export function normalizeName(name: string): string {
  return cleanText(name).toLocaleLowerCase("en-US");
}

export function validateAnswer(raw: string): TextCheck {
  const value = cleanText(raw);
  if (!value) return { ok: false, reason: "Please write an answer." };
  if (value.length > ANSWER_MAX) return { ok: false, reason: `Answers can be at most ${ANSWER_MAX} characters.` };
  if (!normalizeKey(value)) return { ok: false, reason: "Please use at least one letter or number." };
  if (isInappropriate(value)) {
    return { ok: false, reason: "Let's keep it family-friendly. You can rephrase or swap this question." };
  }
  return { ok: true, value };
}

// A small, deliberately conservative list. The host can also remove players before the game.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "asshole", "bastard", "slut", "whore",
  "nigger", "nigga", "faggot", "retard", "porn", "nazi",
];

export function isInappropriate(value: string): boolean {
  const key = normalizeKey(value).replace(/\s+/g, "");
  return BLOCKED.some((w) => key.includes(w));
}
