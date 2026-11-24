import { describe, expect, it } from "vitest";
import { pointsFor, rankStandings, remainingActiveMs } from "@/lib/scoring";

describe("pointsFor", () => {
  it("awards 1000 for correct, 0 otherwise, no bonus by default", () => {
    expect(pointsFor({ correct: true, speedBonus: 0, remainingMs: 15000, durationMs: 20000 })).toBe(1000);
    expect(pointsFor({ correct: false, speedBonus: 500, remainingMs: 15000, durationMs: 20000 })).toBe(0);
  });
  it("adds a floored, clamped speed bonus", () => {
    expect(pointsFor({ correct: true, speedBonus: 500, remainingMs: 10000, durationMs: 20000 })).toBe(1250);
    expect(pointsFor({ correct: true, speedBonus: 500, remainingMs: 30000, durationMs: 20000 })).toBe(1500);
    expect(pointsFor({ correct: true, speedBonus: 500, remainingMs: -5, durationMs: 20000 })).toBe(1000);
    expect(pointsFor({ correct: true, speedBonus: 300, remainingMs: 6667, durationMs: 20000 })).toBe(1100);
  });
});

describe("rankStandings", () => {
  it("shares ranks on ties and sorts ties by name", () => {
    const r = rankStandings([
      { playerId: "a", name: "Zed", points: 2000, correct: 2, eligible: 3 },
      { playerId: "b", name: "Amy", points: 2000, correct: 2, eligible: 2 },
      { playerId: "c", name: "Bo", points: 1000, correct: 1, eligible: 3 },
      { playerId: "d", name: "Cy", points: 0, correct: 0, eligible: 0 },
    ]);
    expect(r.map((x) => [x.name, x.rank])).toEqual([
      ["Amy", 1],
      ["Zed", 1],
      ["Bo", 3],
      ["Cy", 4],
    ]);
    expect(r[0].accuracy).toBe(1);
    expect(r[3].accuracy).toBe(0);
  });
});

describe("remainingActiveMs", () => {
  it("uses stored remaining time while paused", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    expect(remainingActiveMs({ deadlineAt: new Date("2026-01-01T00:00:05Z"), pausedAt: now, remainingMs: 7000 }, now)).toBe(7000);
    expect(remainingActiveMs({ deadlineAt: new Date("2026-01-01T00:00:15Z"), pausedAt: null, remainingMs: null }, now)).toBe(5000);
    expect(remainingActiveMs({ deadlineAt: new Date("2026-01-01T00:00:05Z"), pausedAt: null, remainingMs: null }, now)).toBe(0);
  });
});
