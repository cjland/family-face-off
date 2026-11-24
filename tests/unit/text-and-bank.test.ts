import { describe, expect, it } from "vitest";
import { PROMPT_BANK } from "@/lib/promptBank";
import { DEFAULT_SETTINGS, parseSettings, settingsSchema } from "@/lib/settings";
import { cleanText, nearDuplicate, normalizeName, validateAnswer, validateDisplayName } from "@/lib/text";

describe("text handling", () => {
  it("normalizes names for case-insensitive uniqueness", () => {
    expect(normalizeName("  Grandma   JO ")).toBe(normalizeName("grandma jo"));
    expect(normalizeName("ＡＮＮ")).toBe("ann"); // full-width Unicode folds via NFKC
  });
  it("strips invisible and control characters", () => {
    expect(cleanText("Pi​zza\u0007")).toBe("Pizza");
  });
  it("validates names and answers with friendly reasons", () => {
    expect(validateDisplayName("").ok).toBe(false);
    expect(validateDisplayName("x".repeat(25)).ok).toBe(false);
    expect(validateDisplayName("Aunt Rosie").ok).toBe(true);
    expect(validateAnswer("   ").ok).toBe(false);
    expect(validateAnswer("x".repeat(121)).ok).toBe(false);
    expect(validateAnswer("<b>Pizza</b>").ok).toBe(true); // stored as text; React escapes on render
  });
  it("detects near-duplicate answers", () => {
    expect(nearDuplicate("Pizza", "pizzas")).toBe(true);
    expect(nearDuplicate("The beach", "beach")).toBe(true);
    expect(nearDuplicate("Chocolate cake", "chocolate cakes!")).toBe(true);
    expect(nearDuplicate("Pizza", "Tacos")).toBe(false);
    expect(nearDuplicate("Cat", "Car")).toBe(false);
  });
});

describe("prompt bank", () => {
  it("has 4 common prompts first and enough random prompts", () => {
    expect(PROMPT_BANK.slice(0, 4).every((p) => p.common)).toBe(true);
    expect(PROMPT_BANK.filter((p) => p.common)).toHaveLength(4);
    expect(PROMPT_BANK.filter((p) => !p.common).length).toBeGreaterThanOrEqual(40);
  });
  it("has unique ids, a {name} template and at least 6 distinct fallbacks per prompt", () => {
    expect(new Set(PROMPT_BANK.map((p) => p.id)).size).toBe(PROMPT_BANK.length);
    for (const p of PROMPT_BANK) {
      expect(p.template).toContain("{name}");
      expect(p.fallback.length).toBeGreaterThanOrEqual(6);
      for (let i = 0; i < p.fallback.length; i++) {
        for (let j = i + 1; j < p.fallback.length; j++) expect(nearDuplicate(p.fallback[i], p.fallback[j]), `${p.id}: ${p.fallback[i]} / ${p.fallback[j]}`).toBe(false);
      }
    }
  });
});

describe("settings", () => {
  it("applies spec defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ roundCount: 20, questionSeconds: 20, speedBonus: 0, autoReveal: false, autoNext: false, revealSeconds: 8 });
  });
  it("rejects out-of-range values and unknown keys", () => {
    expect(settingsSchema.safeParse({ roundCount: 81 }).success).toBe(false);
    expect(settingsSchema.safeParse({ speedBonus: 501 }).success).toBe(false);
    expect(settingsSchema.safeParse({ evil: true }).success).toBe(false);
    expect(parseSettings({ roundCount: "x" })).toEqual(DEFAULT_SETTINGS);
  });
});
