import { describe, expect, it } from "vitest";
import { bonusSlots, interleave, pickBonus } from "@/lib/bonus";
import { BONUS_QUESTIONS } from "@/data/bonusQuestions";

const bank = BONUS_QUESTIONS.map((b) => ({ ...b, correctIndex: b.correct }));

describe("bonus questions", () => {
  it("never go first or last, and are spread out", () => {
    expect(bonusSlots(12, 3)).toEqual([3, 6, 9]);
    expect(bonusSlots(2, 5)).toEqual([1]);
    expect(bonusSlots(1, 3)).toEqual([]);
    for (const [n, k] of [[5, 4], [36, 3], [8, 2]]) {
      const s = bonusSlots(n, k);
      expect(s.every((x) => x >= 1 && x <= n - 1)).toBe(true);
    }
    const out = interleave([1, 2, 3, 4], ["b1", "b2"], bonusSlots(4, 2));
    expect(out.map((x) => x.item)).toEqual([1, "b1", 2, 3, "b2", 4]);
  });

  it("pick a spread of difficulties, easy first, no repeats, fresh ones before recent ones", () => {
    const p = pickBonus(bank, 6, "seed");
    expect(p).toHaveLength(6);
    expect(new Set(p.map((x) => x.id)).size).toBe(6);
    const order = { easy: 0, medium: 1, hard: 2 } as Record<string, number>;
    expect(p.map((x) => order[x.difficulty])).toEqual([...p.map((x) => order[x.difficulty])].sort());
    expect(new Set(p.map((x) => x.difficulty))).toEqual(new Set(["easy", "medium", "hard"]));
    const recent = new Set(bank.filter((b) => b.difficulty === "easy").slice(0, 5).map((b) => b.id));
    const q = pickBonus(bank, 3, "seed2", recent);
    expect(q.filter((x) => recent.has(x.id))).toHaveLength(0);
    expect(pickBonus(bank, 0, "s")).toEqual([]);
    expect(pickBonus(bank, 50, "s")).toHaveLength(20);
  });
});
