import { isMashPiece } from "@/lib/mash";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { games, playerPhotos, players, type Game, type Player } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { DEFAULT_BODY, isBody } from "@/lib/bodies";
import { PIECES, isPiece, parsePhotoPiece, photoPiece } from "@/lib/pieces";

export const MAX_PHOTO_BYTES = 150_000;

/** Accepts only real JPEG / PNG / WebP bytes (checked by magic number, not by the claimed type). */
export function decodePhoto(dataUrl: string): { mime: string; data: Buffer } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) throw new ApiError("VALIDATION", "That photo couldn't be read. Try a different picture.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > MAX_PHOTO_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "That photo is too large.");
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP";
  const mime = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!mime) throw new ApiError("VALIDATION", "Please choose a JPEG, PNG or WebP photo.");
  return { mime, data };
}

/** Stores the player's photo and shows it in place of their game piece. */
export async function setPhoto(db: DB, game: Game, player: Player, dataUrl: string, body?: string): Promise<string> {
  const { mime, data } = decodePhoto(dataUrl);
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(games).where(eq(games.id, game.id)).for("share");
    if (!g || g.phase === "FINISHED") throw new ApiError("WRONG_PHASE", "This game has ended.");
    const [current] = await tx.select().from(players).where(and(eq(players.id, player.id), eq(players.gameId, game.id)));
    if (!current) throw new ApiError("NOT_FOUND", "Player not found.");
    const previous = isPiece(current.piece) || isMashPiece(current.piece) ? current.piece : null;
    const keptBody = current.piece && current.piece.startsWith("photo:") ? parsePhotoPiece(current.piece).body : null;
    const chosenBody = isBody(body) ? body : isBody(keptBody) ? keptBody : DEFAULT_BODY;
    await tx
      .insert(playerPhotos)
      .values({ playerId: player.id, mime, data, previousPiece: previous })
      .onConflictDoUpdate({
        target: playerPhotos.playerId,
        set: { mime, data, updatedAt: new Date(), ...(previous ? { previousPiece: previous } : {}) },
      });
    const piece = photoPiece(player.id, Date.now(), chosenBody);
    await tx.update(players).set({ piece }).where(eq(players.id, player.id));
    return piece;
  });
}

/** Removes a photo and gives the player their game piece back (or a free one). */
export async function removePhoto(db: DB, gameId: string, playerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(players).where(and(eq(players.id, playerId), eq(players.gameId, gameId)));
    if (!p) throw new ApiError("NOT_FOUND", "Player not found.");
    const [photo] = await tx.select({ previous: playerPhotos.previousPiece }).from(playerPhotos).where(eq(playerPhotos.playerId, playerId));
    if (!photo) return;
    const taken = new Set(
      (await tx.select({ piece: players.piece }).from(players).where(and(eq(players.gameId, gameId), eq(players.active, true)))).map((r) => r.piece),
    );
    let piece = photo.previous && !taken.has(photo.previous) ? photo.previous : null;
    if (!piece) {
      const free = PIECES.map((x) => x.id).filter((id) => !taken.has(id));
      const pool = free.length ? free : PIECES.map((x) => x.id);
      piece = pool[randomInt(pool.length)];
    }
    await tx.delete(playerPhotos).where(eq(playerPhotos.playerId, playerId));
    await tx.update(players).set({ piece }).where(eq(players.id, playerId));
  });
}

export async function getPhoto(db: DB, playerId: string) {
  const [row] = await db
    .select({ mime: playerPhotos.mime, data: playerPhotos.data })
    .from(playerPhotos)
    .innerJoin(players, eq(players.id, playerPhotos.playerId))
    .innerJoin(games, eq(games.id, players.gameId))
    .where(eq(playerPhotos.playerId, playerId));
  return row ?? null;
}

/** Changes the cartoon body under a player's face photo. */
export async function setPhotoBody(db: DB, game: Game, player: Player, body: string): Promise<string> {
  if (!isBody(body)) throw new ApiError("VALIDATION", "Unknown outfit.");
  const [current] = await db.select().from(players).where(and(eq(players.id, player.id), eq(players.gameId, game.id)));
  if (!current?.piece?.startsWith("photo:")) throw new ApiError("CONFLICT", "Add a photo first.");
  const { version } = parsePhotoPiece(current.piece);
  const piece = photoPiece(player.id, Number(version) || Date.now(), body);
  await db.update(players).set({ piece }).where(eq(players.id, player.id));
  return piece;
}
