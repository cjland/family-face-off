import { describe, expect, it } from "vitest";
import { pickDistractors } from "@/lib/generator";
import { PROMPT_BANK, seasonMatchesTheme } from "@/lib/promptBank";
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

describe("prompt bank (src/data/questions.json)", () => {
  it("loads 150 questions with the 4 common ones first", () => {
    expect(PROMPT_BANK).toHaveLength(150);
    expect(PROMPT_BANK.slice(0, 4).map((p) => p.id)).toEqual(["q001", "q002", "q017", "q053"]);
    expect(PROMPT_BANK.filter((p) => p.common)).toHaveLength(4);
  });
  it("has unique ids, a {name} template and unique option ids", () => {
    expect(new Set(PROMPT_BANK.map((p) => p.id)).size).toBe(PROMPT_BANK.length);
    const optionIds = PROMPT_BANK.flatMap((p) => p.options.map((o) => o.id));
    expect(new Set(optionIds).size).toBe(optionIds.length);
    for (const p of PROMPT_BANK) {
      expect(p.template).toContain("{name}");
      expect(p.template).not.toContain("{playerName}");
    }
  });
  it("can build 3 distinct wrong choices for every option", () => {
    for (const p of PROMPT_BANK) {
      for (const o of p.options) {
        const { picked } = pickDistractors(o.text, [p.fallback.filter((f) => f !== o.text)], 3);
        expect(picked, `${p.id}: ${o.text}`).toHaveLength(3);
      }
    }
  });
  it("only offers seasonal questions in the matching theme", () => {
    expect(seasonMatchesTheme(null, "classic")).toBe(true);
    expect(seasonMatchesTheme("Thanksgiving", "thanksgiving")).toBe(true);
    expect(seasonMatchesTheme("Thanksgiving", "classic")).toBe(false);
    expect(seasonMatchesTheme("Christmas", "thanksgiving")).toBe(false);
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

describe("splitQuestion", () => {
  it("separates the lead-in from the quoted question", async () => {
    const { splitQuestion } = await import("@/lib/questionText");
    expect(splitQuestion("How did Mock Morgan answer: “What would you most like to drink?”")).toEqual({
      lead: "How did Mock Morgan answer:",
      question: "What would you most like to drink?",
    });
    expect(splitQuestion("Who submitted this answer?")).toEqual({ lead: null, question: "Who submitted this answer?" });
  });
});
