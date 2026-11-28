import { BODIES, isBody, type BodyId } from "@/lib/bodies";
import { isPiece, PIECES, type PieceId } from "@/lib/pieces";

/**
 * A mashup character: the head of one game piece on a costume body, bobblehead style.
 * Stored as a self-contained piece string so it renders anywhere without a lookup:
 *   mash:<pieceId>:<bodyId>:<zoom x10>:<cx x100>:<cy x100>
 * zoom: how much the piece image is enlarged inside the head circle; cx/cy: which point of the
 * piece image sits in the middle of the circle (0–1).
 */
export type Mash = { head: PieceId; body: BodyId; zoom: number; cx: number; cy: number };

export const MASH_DEFAULT_CROP = { zoom: 2, cx: 0.5, cy: 0.33 };
export const MASH_LIMITS = { zoom: [1, 3.5], cx: [0.15, 0.85], cy: [0.1, 0.8] } as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export function mashPiece(m: Mash): string {
  return `mash:${m.head}:${m.body}:${Math.round(clamp(m.zoom, MASH_LIMITS.zoom) * 10)}:${Math.round(clamp(m.cx, MASH_LIMITS.cx) * 100)}:${Math.round(clamp(m.cy, MASH_LIMITS.cy) * 100)}`;
}

export function isMashPiece(v: string | null | undefined): v is string {
  return parseMash(v) !== null;
}

export function parseMash(v: string | null | undefined): Mash | null {
  if (typeof v !== "string" || !v.startsWith("mash:")) return null;
  const [, head, body, z, x, y] = v.split(":");
  if (!isPiece(head) || !isBody(body)) return null;
  const zoom = Number(z) / 10;
  const cx = Number(x) / 100;
  const cy = Number(y) / 100;
  if (![zoom, cx, cy].every(Number.isFinite)) return null;
  return { head, body, zoom: clamp(zoom, MASH_LIMITS.zoom), cx: clamp(cx, MASH_LIMITS.cx), cy: clamp(cy, MASH_LIMITS.cy) };
}

/** "Dino Superhero" — the default name for a mashup. */
export function mashLabel(m: Mash): string {
  const head = PIECES.find((p) => p.id === m.head)?.label ?? "Mystery";
  const body = BODIES.find((b) => b.id === m.body)?.label ?? "Hero";
  return `${head} ${body}`;
}
