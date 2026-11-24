import { describe, expect, it } from "vitest";
import { generateQuiz, validateRound, type GenAnswer, type GenPlayer } from "@/lib/generator";
import { PROMPT_BANK } from "@/lib/promptBank";

const fallbackByPrompt = Object.fromEntries(PROMPT_BANK.map((p) => [p.id, p.fallback]));
const bank = new Map(PROMPT_BANK.map((p) => [p.id, p]));

function makeInput(n: number, answerFn: (player: number, prompt: string) => string) {
  const players: GenPlayer[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
  const promptIds = PROMPT_BANK.slice(0, 8).map((p) => p.id);
  const answers: GenAnswer[] = [];
  for (const pl of players) {
    for (const pid of promptIds) {
      const pr = bank.get(pid)!;
      answers.push({
        playerPromptId: `${pl.id}:${pid}`,
        playerId: pl.id,
        promptId: pid,
        promptText: pr.text,
        template: pr.template,
        answer: answerFn(Number(pl.id.slice(1)), pid),
      });
    }
  }
  return { players, answers };
}

const distinct = (i: number, pid: string) => `${pid.split("-")[0]} answer ${i}`;

describe("generateQuiz", () => {
  it("produces valid rounds with exactly four distinct options and one correct answer", () => {
    const { players, answers } = makeInput(5, distinct);
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 20, seed: 1 });
    expect(res.rounds).toHaveLength(20);
    const active = new Set(players.map((p) => p.id));
    for (const r of res.rounds) {
      expect(validateRound(r, active)).toBeNull();
      // The correct option is exactly the submitted answer (capitalised).
      const correct = r.options.find((o) => o.id === r.correctOptionId)!;
      if (r.type === "WHAT_ANSWER") expect(correct.label.toLowerCase()).toBe(r.answerText.toLowerCase());
      else expect(correct.label).toBe(players.find((p) => p.id === r.subjectPlayerId)!.name);
    }
  });

  it("never repeats a source answer", () => {
    const { players, answers } = makeInput(4, distinct);
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 80, reserveCount: 10, seed: 2 });
    const all = [...res.rounds, ...res.reserves];
    expect(new Set(all.map((r) => r.sourcePlayerPromptId)).size).toBe(all.length);
    expect(res.rounds.length).toBeLessThanOrEqual(res.achievable);
  });

  it("balances subject appearances to within one and avoids back-to-back subjects", () => {
    const { players, answers } = makeInput(7, distinct);
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 20, seed: 3 });
    const counts = Object.values(res.subjectCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    for (let i = 1; i < res.rounds.length; i++) {
      expect(res.rounds[i].subjectPlayerId).not.toBe(res.rounds[i - 1].subjectPlayerId);
    }
  });

  it("is deterministic for a given seed", () => {
    const { players, answers } = makeInput(5, distinct);
    const a = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 10, seed: "same" });
    const b = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 10, seed: "same" });
    expect(a).toEqual(b);
  });

  it("never offers a near-duplicate of the correct answer as a distractor", () => {
    // Everyone loves pizza in slightly different words.
    const { players, answers } = makeInput(5, (i, pid) => (pid === "q001" ? ["Pizza", "pizza!", "Pizzas", "PIZZA", "Tacos"][i] : distinct(i, pid)));
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 40, seed: 4 });
    for (const r of res.rounds.filter((x) => x.type === "WHAT_ANSWER")) {
      const labels = r.options.map((o) => o.label.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, ""));
      expect(new Set(labels).size).toBe(4);
    }
  });

  it("works without any AI and with only three players (no 'who answered' rounds)", () => {
    const { players, answers } = makeInput(3, distinct);
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 20, seed: 5 });
    expect(res.rounds.length).toBe(20);
    expect(res.rounds.every((r) => r.type === "WHAT_ANSWER")).toBe(true);
  });

  it("uses 'Who submitted this answer?' for unusual answers when 4+ players", () => {
    const long = "the little bakery on the corner near grandma's old house";
    const { players, answers } = makeInput(4, (i, pid) => (i === 0 && pid === "q001" ? long : distinct(i, pid)));
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 32, seed: 6 });
    const r = res.rounds.find((x) => x.sourcePlayerPromptId === "p0:q001");
    expect(r?.type).toBe("WHO_ANSWERED");
    expect(r?.questionText).toBe("Who submitted this answer?");
  });

  it("reports achievable count instead of repeating when asked for too many", () => {
    const { players, answers } = makeInput(3, distinct);
    const res = generateQuiz({ players, answers, fallbackByPrompt, roundCount: 80, seed: 7 });
    expect(res.rounds.length).toBe(res.achievable);
    expect(res.achievable).toBeLessThanOrEqual(24);
  });

  it("uses extra (AI) distractors only as wrong choices", () => {
    const { players, answers } = makeInput(3, distinct);
    const noFallback = Object.fromEntries(Object.keys(fallbackByPrompt).map((k) => [k, []]));
    const extra = Object.fromEntries(answers.map((a) => [a.playerPromptId, ["Alpha", "Bravo", "Charlie"]]));
    const res = generateQuiz({ players, answers, fallbackByPrompt: noFallback, extraDistractors: extra, roundCount: 5, seed: 8 });
    for (const r of res.rounds) {
      const correct = r.options.find((o) => o.id === r.correctOptionId)!;
      expect(["Alpha", "Bravo", "Charlie"]).not.toContain(correct.label);
    }
  });
});
