import { describe, expect, it } from "vitest";
import { pickShownOptions } from "@/lib/promptBank";

const pool = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, humorous: false })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, humorous: true })),
];

describe("pickShownOptions", () => {
  it("shows 4 regular + 2 humorous, stable per seed", () => {
    const a = pickShownOptions(pool, "pp-1");
    expect(a).toHaveLength(6);
    expect(a.filter((o) => o.humorous)).toHaveLength(2);
    expect(pickShownOptions(pool, "pp-1")).toEqual(a);
  });
  it("differs between players", () => {
    const sets = new Set(["a", "b", "c", "d", "e"].map((s) => pickShownOptions(pool, s).map((o) => o.id).sort().join()));
    expect(sets.size).toBeGreaterThan(1);
  });
  it("always keeps the player's current pick", () => {
    for (const keep of ["r19", "h9", "r0"]) expect(pickShownOptions(pool, "x", keep).map((o) => o.id)).toContain(keep);
  });
  it("returns small pools whole", () => {
    expect(pickShownOptions(pool.slice(0, 6), "x")).toHaveLength(6);
  });
});
