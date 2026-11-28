import { describe, expect, it } from "vitest";
import { mashLabel, mashPiece, parseMash } from "@/lib/mash";

describe("mashup pieces", () => {
  it("round-trip and clamp", () => {
    const s = mashPiece({ head: "unicorn", body: "chef", zoom: 9, cx: 0.4, cy: 0.3 });
    expect(s).toBe("mash:unicorn:chef:35:40:30");
    expect(parseMash(s)).toEqual({ head: "unicorn", body: "chef", zoom: 3.5, cx: 0.4, cy: 0.3 });
    expect(mashLabel(parseMash(s)!)).toBe("Unicorn Chef");
  });
  it("rejects unknown parts", () => {
    expect(parseMash("mash:nope:chef:20:50:33")).toBeNull();
    expect(parseMash("dino")).toBeNull();
  });
});
