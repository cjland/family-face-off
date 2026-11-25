import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODIES, DEFAULT_BODY, isBody } from "@/lib/bodies";
import { parsePhotoPiece, photoPiece, pieceSrc } from "@/lib/pieces";

describe("costume bodies", () => {
  it("has 20 costumes with art files and a sensible face hole", () => {
    expect(BODIES).toHaveLength(20);
    expect(isBody(DEFAULT_BODY)).toBe(true);
    for (const b of BODIES) {
      expect(existsSync(`public/bodies/${b.id}.webp`), b.id).toBe(true);
      expect(b.face.r).toBeGreaterThan(0.1);
      expect(b.face.r).toBeLessThan(0.25);
      expect(b.face.cy - b.face.r).toBeGreaterThanOrEqual(0);
      expect(b.face.cx).toBeGreaterThan(0.3);
      expect(b.face.cx).toBeLessThan(0.7);
    }
  });
  it("round-trips the photo piece format", () => {
    const p = photoPiece("11111111-1111-4111-8111-111111111111", 42, "chef");
    expect(parsePhotoPiece(p)).toEqual({ playerId: "11111111-1111-4111-8111-111111111111", version: "42", body: "chef" });
    expect(pieceSrc(p)).toBe("/api/photos/11111111-1111-4111-8111-111111111111?v=42");
  });
});
