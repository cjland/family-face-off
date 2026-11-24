import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import type { DB } from "@/db/client";
import { hostSessions, players, type Game, type Player } from "@/db/schema";
import { hashToken, newToken, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export const HOST_COOKIE = "ffo_host";
const HOST_SESSION_HOURS = 12;
const PLAYER_COOKIE_DAYS = 7;

/** Player cookies are named per game so one phone can be in several games at once. */
export function playerCookieName(code: string): string {
  return `ffo_p_${code.toUpperCase()}`;
}

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Secure in production over HTTPS. Plain-http LAN testing (NEXT_PUBLIC_APP_URL=http://192.168...) still works.
    secure: env().NODE_ENV === "production" && !(env().NEXT_PUBLIC_APP_URL ?? "").startsWith("http://"),
    path: "/",
  };
}

export function verifyHostPassword(candidate: string): boolean {
  return safeEqual(candidate, env().HOST_PASSWORD);
}

export async function createHostSession(db: DB): Promise<string> {
  const token = newToken();
  await db.insert(hostSessions).values({
    tokenHash: hashToken(token, env().SESSION_SECRET),
    expiresAt: new Date(Date.now() + HOST_SESSION_HOURS * 3600_000),
  });
  return token;
}

export function setHostCookie(res: NextResponse, token: string) {
  res.cookies.set(HOST_COOKIE, token, { ...cookieBase(), maxAge: HOST_SESSION_HOURS * 3600 });
}

export function clearHostCookie(res: NextResponse) {
  res.cookies.set(HOST_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export async function isHost(db: DB, req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(HOST_COOKIE)?.value;
  if (!token || token.length > 200) return false;
  const rows = await db
    .select({ id: hostSessions.id })
    .from(hostSessions)
    .where(and(eq(hostSessions.tokenHash, hashToken(token, env().SESSION_SECRET)), gt(hostSessions.expiresAt, new Date())))
    .limit(1);
  return rows.length > 0;
}

export async function requireHost(db: DB, req: NextRequest): Promise<void> {
  if (!(await isHost(db, req))) throw new ApiError("UNAUTHENTICATED", "Please sign in as the host.");
}

export async function destroyHostSession(db: DB, req: NextRequest) {
  const token = req.cookies.get(HOST_COOKIE)?.value;
  if (token) await db.delete(hostSessions).where(eq(hostSessions.tokenHash, hashToken(token, env().SESSION_SECRET)));
}

export async function cleanupHostSessions(db: DB) {
  await db.delete(hostSessions).where(lt(hostSessions.expiresAt, new Date()));
}

export function setPlayerCookie(res: NextResponse, code: string, token: string) {
  res.cookies.set(playerCookieName(code), token, { ...cookieBase(), maxAge: PLAYER_COOKIE_DAYS * 86400 });
}

export function playerTokenFrom(req: NextRequest, code: string): string | null {
  const token = req.cookies.get(playerCookieName(code))?.value;
  return token && token.length <= 200 ? token : null;
}

/** Finds the player for this game from the request cookie. Always scoped to the game id. */
export async function getPlayer(db: DB, req: NextRequest, game: Game): Promise<Player | null> {
  const token = playerTokenFrom(req, game.code);
  if (!token) return null;
  return findPlayerByToken(db, game.id, token);
}

export async function findPlayerByToken(db: DB, gameId: string, token: string): Promise<Player | null> {
  const rows = await db
    .select()
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.tokenHash, hashToken(token, env().SESSION_SECRET))))
    .limit(1);
  return rows[0] ?? null;
}

export async function requirePlayer(db: DB, req: NextRequest, game: Game): Promise<Player> {
  const player = await getPlayer(db, req, game);
  if (!player) throw new ApiError("UNAUTHENTICATED", "Please join the game first.");
  if (!player.active) throw new ApiError("FORBIDDEN", "You're no longer part of this game.");
  return player;
}
