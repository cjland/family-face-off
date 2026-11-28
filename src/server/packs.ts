import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { characterPacks } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { isMashPiece } from "@/lib/mash";
import { isPiece, pieceLabel, piecesForGroups } from "@/lib/pieces";
import type { GameSettings } from "@/lib/settings";
import { cleanText } from "@/lib/text";

export const packInput = z.object({
  name: z.string().trim().min(1, "Give the pack a name.").max(40),
  characters: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(24),
        piece: z.string().max(60).refine((p) => isMashPiece(p) || isPiece(p), "Unknown character."),
      }),
    )
    .max(40, "A pack holds up to 40 characters."),
});
export type PackInput = z.infer<typeof packInput>;
export type PackDTO = { id: string; name: string; characters: { name: string; piece: string }[]; updatedAt: string };

const toDto = (p: typeof characterPacks.$inferSelect): PackDTO => ({
  id: p.id,
  name: p.name,
  characters: p.characters,
  updatedAt: p.updatedAt.toISOString(),
});

const clean = (input: PackInput): PackInput => {
  const seen = new Set<string>();
  return {
    name: cleanText(input.name),
    // One of each character per pack.
    characters: input.characters
      .map((c) => ({ name: cleanText(c.name), piece: c.piece }))
      .filter((c) => c.name && !seen.has(c.piece) && seen.add(c.piece)),
  };
};

export async function listPacks(db: DB): Promise<PackDTO[]> {
  return (await db.select().from(characterPacks).orderBy(asc(characterPacks.name))).map(toDto);
}

export async function createPack(db: DB, input: PackInput): Promise<PackDTO> {
  const [row] = await db.insert(characterPacks).values(clean(input)).returning();
  return toDto(row);
}

export async function updatePack(db: DB, id: string, input: PackInput): Promise<PackDTO> {
  const [row] = await db
    .update(characterPacks)
    .set({ ...clean(input), updatedAt: new Date() })
    .where(eq(characterPacks.id, id))
    .returning();
  if (!row) throw new ApiError("NOT_FOUND", "That pack is gone.");
  return toDto(row);
}

export async function deletePack(db: DB, id: string): Promise<void> {
  await db.delete(characterPacks).where(eq(characterPacks.id, id));
}

/**
 * The characters players can choose from in a game: the built-in groups that are ticked, plus
 * any character packs. No groups and no packs = every built-in piece.
 */
export async function allowedPieces(db: DB, settings: GameSettings): Promise<{ id: string; label: string }[]> {
  const packs = settings.characterPacks.length
    ? await db.select().from(characterPacks).where(inArray(characterPacks.id, settings.characterPacks))
    : [];
  const fromPacks = packs.flatMap((p) => p.characters.map((c) => ({ id: c.piece, label: c.name })));
  const builtIn = settings.pieceGroups.length || !fromPacks.length ? piecesForGroups(settings.pieceGroups).map((p) => ({ id: p.id as string, label: p.label as string })) : [];
  const seen = new Set<string>();
  return [...fromPacks, ...builtIn].filter((p) => !seen.has(p.id) && seen.add(p.id)).map((p) => ({ id: p.id, label: p.label || pieceLabel(p.id) }));
}
