import { describe, expect, it } from "vitest";
import { bonusPlacePoints, bonusPlaces, bonusSlots, interleave, pickBonus } from "@/lib/bonus";
import { BONUS_QUESTIONS } from "@/data/bonusQuestions";

const bank = BONUS_QUESTIONS.filter((b) => b.seasonal === "Thanksgiving").map((b) => ({ ...b, correctIndex: b.correct }));

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

describe("bonus points by place", () => {
  it("pays 1,500, 1,200, 900… down to 300, fastest right answer first; ties share; late answers unranked", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((p) => bonusPlacePoints(1500, p))).toEqual([1500, 1200, 900, 600, 300, 300, 300]);
    const g = (playerId: string, correct: boolean, elapsedMs: number) => ({ playerId, correct, elapsedMs });
    const places = bonusPlaces([g("a", true, 4000), g("b", true, 2000), g("c", false, 1000), g("d", true, 4000), g("e", true, 30000), g("f", true, 6000)], 20000);
    expect(Object.fromEntries(places)).toEqual({ b: 1, a: 2, d: 2, f: 4 });
  });
});


import { parseCsv, readQuestions, templateCsv } from "@/lib/customCsv";

describe("question template", () => {
  it("parses quoted CSV, and the template reads back as valid questions", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
    const { questions, errors } = readQuestions(templateCsv());
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(3);
    expect(questions[1]).toMatchObject({ correctIndex: 1, seconds: 25, difficulty: "medium" });
  });
  it("reports bad rows by spreadsheet row number and accepts the correct answer as a letter, number or text", () => {
    const csv = ["Group,Question,A,B,C,D,Correct", "G,Q1,x,y,z,w,2", "G,Q2,x,y,z,w,z", "G,Q3,x,x,z,w,A", ",Q4,x,y,z,w,A"].join("\n");
    const { questions, errors } = readQuestions(csv);
    expect(questions.map((q) => q.correctIndex)).toEqual([1, 2]);
    expect(errors.map((e) => e.row)).toEqual([4, 5]);
    expect(readQuestions("Question,Answer\nhi,there").errors[0].message).toContain("Missing column");
  });
});

describe("fourChoices", () => {
  it("keeps the right answer and picks 3 others from the pool", async () => {
    const { fourChoices } = await import("@/lib/trivia");
    const { createRng } = await import("@/lib/prng");
    const pool = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    const seen = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const r = fourChoices(pool, 7, createRng(`s${s}`));
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options).size).toBe(4);
      expect(r.options[r.correctIndex]).toBe("h");
      seen.add(r.correctIndex);
    }
    expect(seen.size).toBe(4); // the right answer moves around
    expect(fourChoices(["w", "x", "y", "z"], 2, createRng("x"))).toEqual({ options: ["w", "x", "y", "z"], correctIndex: 2 });
  });
});
