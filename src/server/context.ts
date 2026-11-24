import "server-only";
import type { NextRequest } from "next/server";
import type { DB } from "@/db/client";
import type { Game } from "@/db/schema";
import { displayKey, safeEqual } from "@/lib/crypto";
import { aiAvailable, demoToolsEnabled, env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { fetchAiDistractors } from "./openrouter";
import type { PrepareOptions } from "./engine";
import { isHost } from "./auth";

/** A display may authenticate with the host cookie or the per-game display key. */
export async function canViewDisplay(db: DB, req: NextRequest, game: Game): Promise<boolean> {
  const key = req.nextUrl.searchParams.get("key");
  if (key && key.length <= 64 && safeEqual(key, displayKey(game.id, env().SESSION_SECRET))) return true;
  return isHost(db, req);
}

export async function requireDisplay(db: DB, req: NextRequest, game: Game) {
  if (!(await canViewDisplay(db, req, game))) {
    throw new ApiError("FORBIDDEN", "Open the TV display from the host screen to get a valid link.");
  }
}

export function prepareOptions(): PrepareOptions {
  return aiAvailable() ? { aiDistractors: (items) => fetchAiDistractors(items) } : {};
}

export { aiAvailable, demoToolsEnabled };
