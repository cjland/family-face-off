import { and, asc, desc, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import { allowedPieces } from "@/server/packs";
import { randomInt } from "node:crypto";
import type { DB } from "@/db/client";
import { families, games, playerPrompts, players, prompts, type Game, type Player } from "@/db/schema";
import { hashToken, newGameCode, newToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import {
  COMMON_SLOTS,
  PROMPT_SLOTS,
  RETENTION_DAYS,
  parseSettings,
  settingsSchema,
  type GameSettings,
} from "@/lib/settings";
import { pickShownOptions, seasonMatchesTheme } from "@/lib/promptBank";
import { validateSlogan } from "@/lib/slogans";
import { cleanText, normalizeName, validateAnswer, validateDisplayName } from "@/lib/text";

function randomPick<T>(items: T[], n: number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// ---------- Families ----------

export async function listFamilies(db: DB) {
  return db
    .select({
      id: families.id,
      name: families.name,
      gameCount: sql<number>`(select count(*)::int from ${games} g where g.family_id = ${families.id} and g.expires_at > now())`,
    })
    .from(families)
    .orderBy(asc(families.name));
}

export async function getOrCreateFamily(db: DB, rawName: string) {
  const name = cleanText(rawName).replace(/^the\s+/i, "").replace(/\s+family$/i, "").slice(0, 40);
  if (!name) throw new ApiError("VALIDATION", "Please enter a family name.");
  const normalized = normalizeName(name);
  await db.insert(families).values({ name, normalizedName: normalized }).onConflictDoNothing({ target: families.normalizedName });
  const [row] = await db.select().from(families).where(eq(families.normalizedName, normalized));
  return row;
}

// ---------- Games ----------

export async function createGame(
  db: DB,
  input: { title?: string; settings?: Partial<GameSettings>; familyId?: string; familyName?: string },
): Promise<Game> {
  const settings = settingsSchema.parse(input.settings ?? {});
  const title = cleanText(input.title ?? "").slice(0, 60) || "Family Face-Off";
  let familyId = input.familyId;
  if (familyId) {
    const [f] = await db.select({ id: families.id }).from(families).where(eq(families.id, familyId));
    if (!f) throw new ApiError("VALIDATION", "That family doesn't exist.");
  } else {
    familyId = (await getOrCreateFamily(db, input.familyName ?? "Land")).id;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await db
      .insert(games)
      .values({
        code: newGameCode(),
        familyId,
        title,
        settings,
        expiresAt: new Date(Date.now() + RETENTION_DAYS * 86400_000),
      })
      .onConflictDoNothing({ target: games.code })
      .returning();
    if (rows[0]) return rows[0];
  }
  throw new ApiError("INTERNAL", "Could not allocate a game code. Please try again.");
}

export async function listGames(db: DB) {
  const rows = await db
    .select({
      code: games.code,
      title: games.title,
      phase: games.phase,
      createdAt: games.createdAt,
      expiresAt: games.expiresAt,
      familyId: games.familyId,
      familyName: families.name,
      settings: games.settings,
      playerCount: sql<number>`(select count(*)::int from ${players} p where p.game_id = ${games.id} and p.active)`,
    })
    .from(games)
    .innerJoin(families, eq(families.id, games.familyId))
    .where(gt(games.expiresAt, new Date()))
    .orderBy(desc(games.createdAt))
    .limit(50);
  // Host only: settings let the dashboard offer "a game like this one".
  return rows.map((r) => ({ ...r, theme: parseSettings(r.settings).theme, settings: parseSettings(r.settings) }));
}

export async function deleteGame(db: DB, code: string): Promise<boolean> {
  const rows = await db.delete(games).where(eq(games.code, code)).returning({ id: games.id });
  return rows.length > 0;
}

export async function deleteExpiredGames(db: DB): Promise<number> {
  const rows = await db.delete(games).where(lt(games.expiresAt, new Date())).returning({ id: games.id });
  return rows.length;
}

/** Loads a live (non-expired) game by code. Expiration is enforced on every read and write path. */
export async function findGame(db: DB, code: string): Promise<Game> {
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.code, code), gt(games.expiresAt, new Date())))
    .limit(1);
  if (!rows[0]) throw new ApiError("GAME_NOT_FOUND", "We couldn't find that game. Check the code and try again.");
  return rows[0];
}

export async function updateSettings(db: DB, code: string, patch: Partial<GameSettings>): Promise<Game> {
  const game = await findGame(db, code);
  if (game.phase !== "LOBBY") throw new ApiError("WRONG_PHASE", "Settings can only change before the game starts.");
  const settings = settingsSchema.parse({ ...parseSettings(game.settings), ...patch });
  const rows = await db
    .update(games)
    .set({ settings, version: sql`${games.version} + 1`, updatedAt: new Date() })
    .where(and(eq(games.id, game.id), eq(games.phase, "LOBBY")))
    .returning();
  if (!rows[0]) throw new ApiError("WRONG_PHASE", "Settings can only change before the game starts.");
  const before = parseSettings(game.settings).mode;
  if (before !== settings.mode) await syncReadyForMode(db, game.id, settings.mode);
  return rows[0];
}

/**
 * Quiz and Custom modes need nothing from players, so everyone is ready. Switching back to
 * Get Personal un-readies anyone who hasn't answered their eight questions.
 */
async function syncReadyForMode(db: DB, gameId: string, mode: GameSettings["mode"]) {
  if (mode !== "personal") {
    await db
      .update(players)
      .set({ readyAt: new Date() })
      .where(and(eq(players.gameId, gameId), eq(players.active, true), sql`${players.readyAt} is null`));
    return;
  }
  const incomplete = await db
    .select({ id: playerPrompts.playerId })
    .from(playerPrompts)
    .where(and(eq(playerPrompts.gameId, gameId), sql`coalesce(${playerPrompts.answerText}, '') = ''`))
    .groupBy(playerPrompts.playerId);
  if (incomplete.length) {
    await db.update(players).set({ readyAt: null }).where(inArray(players.id, incomplete.map((x) => x.id)));
  }
}

// ---------- Joining ----------

export type JoinResult = { player: Player; token: string | null; reconnected: boolean };

/**
 * Joins a game by name. If the request already carries a valid player token for this game,
 * it reconnects that player instead (idempotent).
 */
export async function joinGame(
  db: DB,
  code: string,
  rawName: string,
  existingToken: string | null,
  opts: { isBot?: boolean; piece?: string | null } = {},
): Promise<JoinResult> {
  const name = validateDisplayName(rawName);
  if (!name.ok) throw new ApiError("VALIDATION", name.reason);

  return db.transaction(async (tx) => {
    const [game] = await tx
      .select()
      .from(games)
      .where(and(eq(games.code, code), gt(games.expiresAt, new Date())))
      .for("update");
    if (!game) throw new ApiError("GAME_NOT_FOUND", "We couldn't find that game. Check the code and try again.");

    const secret = env().SESSION_SECRET;
    if (existingToken) {
      const [existing] = await tx
        .select()
        .from(players)
        .where(and(eq(players.gameId, game.id), eq(players.tokenHash, hashToken(existingToken, secret))));
      if (existing) return { player: existing, token: null, reconnected: true };
    }

    if (game.phase !== "LOBBY" || game.rosterLockedAt) {
      throw new ApiError("GAME_CLOSED", "This game has already started, so new players can't join.");
    }
    const settings = parseSettings(game.settings);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(players)
      .where(and(eq(players.gameId, game.id), eq(players.active, true)));
    if (n >= settings.maxPlayers) throw new ApiError("GAME_FULL", "This game is full.");

    // Game piece: the requested one if free, otherwise any free piece (duplicates only once all 20 are taken).
    const takenRows = await tx
      .select({ piece: players.piece })
      .from(players)
      .where(and(eq(players.gameId, game.id), eq(players.active, true)));
    const taken = new Set(takenRows.map((r) => r.piece).filter(Boolean));
    const allowed = (await allowedPieces(tx, settings)).map((p) => p.id);
    const free = allowed.filter((id) => !taken.has(id));
    let piece: string;
    if (opts.piece && allowed.includes(opts.piece)) {
      if (taken.has(opts.piece) && free.length) {
        throw new ApiError("PIECE_TAKEN", "Someone just grabbed that piece. Pick another one!");
      }
      piece = opts.piece;
    } else {
      const pool = free.length ? free : allowed;
      piece = pool[randomInt(pool.length)];
    }

    const token = newToken();
    const inserted = await tx
      .insert(players)
      .values({
        gameId: game.id,
        displayName: name.value,
        normalizedName: normalizeName(name.value),
        tokenHash: hashToken(token, secret),
        isBot: opts.isBot ?? false,
        piece,
        // Quiz and Custom modes have no personal questions: ready as soon as you join.
        readyAt: settings.mode === "personal" ? null : new Date(),
      })
      .onConflictDoNothing({ target: [players.gameId, players.normalizedName] })
      .returning();
    const player = inserted[0];
    if (!player) throw new ApiError("NAME_TAKEN", "Someone already joined with that name. Try adding an initial.");

    const allActive = await tx
      .select({ id: prompts.id, common: prompts.common, seasonal: prompts.seasonal })
      .from(prompts)
      .where(eq(prompts.active, true))
      .orderBy(asc(prompts.sortOrder));
    // Questions picked in the library (any season) come first; otherwise the whole bank.
    const picked = new Set(settings.promptIds);
    const pickedRows = allActive.filter((b) => picked.has(b.id));
    const bank = pickedRows.length ? pickedRows : allActive.filter((b) => seasonMatchesTheme(b.seasonal, settings.theme));
    const common = bank.filter((b) => b.common).slice(0, COMMON_SLOTS);
    // Spread random questions across the room: prefer ones fewer players already have,
    // so more distinct questions are available (no question is asked twice in a game).
    const usage = await tx
      .select({ promptId: playerPrompts.promptId, n: sql<number>`count(*)::int` })
      .from(playerPrompts)
      .where(eq(playerPrompts.gameId, game.id))
      .groupBy(playerPrompts.promptId);
    const used = new Map(usage.map((u) => [u.promptId, u.n]));
    const pool = randomPick(bank.filter((b) => !b.common), bank.length).sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0));
    const random = pool.slice(0, PROMPT_SLOTS - common.length);
    const chosen = [...common, ...random];
    if (chosen.length < PROMPT_SLOTS && pickedRows.length) {
      // Fewer than 8 picked: top up from the rest of the bank.
      const extra = randomPick(
        allActive.filter((b) => !picked.has(b.id) && !b.common && seasonMatchesTheme(b.seasonal, settings.theme)),
        PROMPT_SLOTS - chosen.length,
      );
      chosen.push(...extra);
    }
    if (chosen.length < PROMPT_SLOTS) throw new ApiError("INTERNAL", "The question bank is not seeded. Run npm run db:seed.");
    await tx.insert(playerPrompts).values(
      chosen.map((c, i) => ({ gameId: game.id, playerId: player.id, promptId: c.id, slot: i + 1 })),
    );
    await tx.update(games).set({ version: sql`${games.version} + 1`, updatedAt: new Date() }).where(eq(games.id, game.id));
    return { player, token, reconnected: false };
  });
}

export async function removePlayer(db: DB, code: string, playerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [game] = await tx.select().from(games).where(eq(games.code, code)).for("update");
    if (!game) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
    if (game.phase !== "LOBBY" || game.rosterLockedAt) {
      throw new ApiError("WRONG_PHASE", "Players can only be removed before the roster is locked.");
    }
    const rows = await tx
      .delete(players)
      .where(and(eq(players.id, playerId), eq(players.gameId, game.id)))
      .returning({ id: players.id });
    if (!rows[0]) throw new ApiError("NOT_FOUND", "That player isn't in this game.");
    await tx.update(games).set({ version: sql`${games.version} + 1`, updatedAt: new Date() }).where(eq(games.id, game.id));
  });
}

/** Minimal public info for the join page: no names, only which pieces are taken. */
export async function joinInfo(db: DB, code: string) {
  const game = await findGame(db, code);
  const [fam] = await db.select({ name: families.name }).from(families).where(eq(families.id, game.familyId));
  const taken = await db
    .select({ piece: players.piece })
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.active, true)));
  const allowed = await allowedPieces(db, parseSettings(game.settings));
  return {
    title: game.title,
    familyName: fam?.name ?? null,
    theme: parseSettings(game.settings).theme,
    pieces: allowed.map((p) => p.id),
    labels: Object.fromEntries(allowed.map((p) => [p.id, p.label])),
    open: game.phase === "LOBBY" && !game.rosterLockedAt,
    taken: taken.map((t) => t.piece).filter((p): p is string => !!p && !p.startsWith("photo:")),
  };
}

// ---------- Questionnaire ----------

export type QuestionnaireItem = {
  slot: number;
  promptId: string;
  prompt: string;
  answer: string;
  optionId: string | null;
  options: { id: string; text: string }[];
};

export async function getQuestionnaire(db: DB, player: Player): Promise<QuestionnaireItem[]> {
  const rows = await db
    .select({
      id: playerPrompts.id,
      slot: playerPrompts.slot,
      promptId: playerPrompts.promptId,
      prompt: prompts.text,
      answer: playerPrompts.answerText,
      optionId: playerPrompts.answerOptionId,
      options: prompts.options,
    })
    .from(playerPrompts)
    .innerJoin(prompts, eq(prompts.id, playerPrompts.promptId))
    .where(eq(playerPrompts.playerId, player.id))
    .orderBy(asc(playerPrompts.slot));
  // Each player sees their own six from the question's pool (stable per player and question).
  return rows.map(({ id, ...r }) => ({
    ...r,
    answer: r.answer ?? "",
    options: pickShownOptions(r.options, id, r.optionId).map((o) => ({ id: o.id, text: o.text })),
  }));
}

function assertEditable(game: Game, player: Player) {
  if (game.phase !== "LOBBY" || game.rosterLockedAt) {
    throw new ApiError("WRONG_PHASE", "Answers are locked because the game has started.");
  }
  if (!player.active) throw new ApiError("FORBIDDEN", "You're no longer part of this game.");
}

async function lockGameRow(tx: DB, gameId: string): Promise<Game> {
  const [g] = await tx.select().from(games).where(eq(games.id, gameId)).for("share");
  if (!g) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
  return g;
}

/** Saves draft answers. Blank answers are allowed while drafting but clear the ready flag. */
export async function saveAnswers(
  db: DB,
  game: Game,
  player: Player,
  answers: { slot: number; answer?: string; optionId?: string | null }[],
): Promise<QuestionnaireItem[]> {
  const errors: Record<string, string> = {};
  const current = await getQuestionnaire(db, player);
  const bySlot = new Map(current.map((c) => [c.slot, c]));
  const cleaned = answers.map(({ slot, answer, optionId }) => {
    if (!Number.isInteger(slot) || slot < 1 || slot > PROMPT_SLOTS) throw new ApiError("VALIDATION", "Invalid question slot.");
    if (optionId) {
      // A picked option: the stored answer is exactly the curated option text.
      const opt = bySlot.get(slot)?.options.find((o) => o.id === optionId);
      if (!opt) throw new ApiError("VALIDATION", "That choice isn't available for this question. Refresh and try again.");
      return { slot, value: opt.text, optionId: opt.id };
    }
    const text = cleanText(answer ?? "");
    if (!text) return { slot, value: null as string | null, optionId: null as string | null };
    const v = validateAnswer(text);
    if (!v.ok) {
      errors[String(slot)] = v.reason;
      return { slot, value: null, optionId: null };
    }
    // Typed text that matches an option exactly counts as picking it.
    const match = bySlot.get(slot)?.options.find((o) => o.text.toLowerCase() === v.value.toLowerCase());
    return { slot, value: match?.text ?? v.value, optionId: match?.id ?? null };
  });
  if (Object.keys(errors).length) {
    throw new ApiError("VALIDATION", Object.values(errors)[0], { slots: errors });
  }

  await db.transaction(async (tx) => {
    const g = await lockGameRow(tx, game.id);
    assertEditable(g, player);
    for (const c of cleaned) {
      await tx
        .update(playerPrompts)
        .set({ answerText: c.value, answerOptionId: c.optionId, updatedAt: new Date() })
        .where(and(eq(playerPrompts.playerId, player.id), eq(playerPrompts.slot, c.slot)));
    }
    const [{ blanks }] = await tx
      .select({ blanks: sql<number>`count(*)::int` })
      .from(playerPrompts)
      .where(and(eq(playerPrompts.playerId, player.id), sql`coalesce(btrim(${playerPrompts.answerText}), '') = ''`));
    if (blanks > 0 && player.readyAt) {
      await tx.update(players).set({ readyAt: null }).where(eq(players.id, player.id));
    }
  });
  return getQuestionnaire(db, player);
}

/** Swaps one prompt for an unused one from the bank, without penalty. */
export async function replacePrompt(db: DB, game: Game, player: Player, slot: number): Promise<QuestionnaireItem[]> {
  if (!Number.isInteger(slot) || slot < 1 || slot > PROMPT_SLOTS) throw new ApiError("VALIDATION", "Invalid question slot.");
  await db.transaction(async (tx) => {
    const g = await lockGameRow(tx, game.id);
    assertEditable(g, player);
    const current = await tx
      .select({ promptId: playerPrompts.promptId })
      .from(playerPrompts)
      .where(eq(playerPrompts.playerId, player.id));
    const used = current.map((c) => c.promptId);
    const { theme, promptIds } = parseSettings(g.settings);
    const candidates = await tx
      .select({ id: prompts.id, seasonal: prompts.seasonal })
      .from(prompts)
      .where(and(eq(prompts.common, false), eq(prompts.active, true), used.length ? notInArray(prompts.id, used) : undefined));
    // Swap within the library picks while any are left, then the rest of the bank.
    const pickedLeft = candidates.filter((u) => promptIds.includes(u.id));
    const unused = pickedLeft.length ? pickedLeft : candidates.filter((u) => seasonMatchesTheme(u.seasonal, theme));
    if (!unused.length) throw new ApiError("CONFLICT", "There are no more questions to swap in.");
    const next = unused[randomInt(unused.length)];
    await tx
      .update(playerPrompts)
      .set({ promptId: next.id, answerText: null, answerOptionId: null, updatedAt: new Date() })
      .where(and(eq(playerPrompts.playerId, player.id), eq(playerPrompts.slot, slot)));
    await tx.update(players).set({ readyAt: null }).where(eq(players.id, player.id));
  });
  return getQuestionnaire(db, player);
}

export async function setReady(db: DB, game: Game, player: Player, ready: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const g = await lockGameRow(tx, game.id);
    assertEditable(g, player);
    if (ready) {
      const rows = await tx
        .select({ answer: playerPrompts.answerText })
        .from(playerPrompts)
        .where(eq(playerPrompts.playerId, player.id));
      const complete = rows.length === PROMPT_SLOTS && rows.every((r) => r.answer && validateAnswer(r.answer).ok);
      if (!complete) throw new ApiError("NOT_READY", "Please answer all eight questions first.");
    }
    await tx.update(players).set({ readyAt: ready ? new Date() : null }).where(eq(players.id, player.id));
  });
  // Version bump outside the share lock so lobby screens refresh.
  await db.update(games).set({ version: sql`${games.version} + 1` }).where(eq(games.id, game.id));
}

/** Step away / come back. Away players are skipped: the game doesn't wait for them and they score nothing. */
export async function setAway(db: DB, game: Game, player: Player, away: boolean): Promise<void> {
  if (!player.active) throw new ApiError("NOT_ELIGIBLE", "You're not playing in this game.");
  await db
    .update(players)
    .set(away ? { awayAt: new Date(), awayReason: "self" } : { awayAt: null, awayReason: null })
    .where(and(eq(players.id, player.id), eq(players.gameId, game.id)));
  await db.update(games).set({ version: sql`${games.version} + 1` }).where(eq(games.id, game.id));
}

// ---------- Demo players (fictional sample data for solo testing) ----------

const DEMO_NAMES = [
  "Sample Sam",
  "Demo Dana",
  "Test Taylor",
  "Bot Bailey",
  "Pretend Pat",
  "Mock Morgan",
  "Faux Frankie",
  "Robo Riley",
  "Practice Pia",
  "Dummy Drew",
  "Pixel Parker",
  "Beta Billie",
];
export const MAX_DEMO_PLAYERS = DEMO_NAMES.length;

export async function addDemoPlayers(db: DB, code: string, count: number): Promise<number> {
  const game = await findGame(db, code);
  const existing = await db.select({ name: players.normalizedName }).from(players).where(eq(players.gameId, game.id));
  const taken = new Set(existing.map((e) => e.name));
  const bots = await db.select({ id: players.id }).from(players).where(and(eq(players.gameId, game.id), eq(players.isBot, true)));
  const room = Math.max(0, MAX_DEMO_PLAYERS - bots.length);
  if (!room) throw new ApiError("CONFLICT", `That's the maximum of ${MAX_DEMO_PLAYERS} demo players.`);
  const names = DEMO_NAMES.filter((n) => !taken.has(normalizeName(n))).slice(0, Math.min(count, room));
  let added = 0;
  for (const name of names) {
    const { player } = await joinGame(db, code, name, null, { isBot: true });
    const items = await getQuestionnaire(db, player);
    const answers = items.map((it) =>
      it.options.length
        ? { slot: it.slot, optionId: it.options[randomInt(it.options.length)].id }
        : { slot: it.slot, answer: "Something fun" },
    );
    await saveAnswers(db, game, player, answers);
    await setReady(db, game, { ...player }, true);
    added++;
  }
  return added;
}

export async function rosterFor(db: DB, gameId: string) {
  return db
    .select({
      id: players.id,
      name: players.displayName,
      piece: players.piece,
      ready: sql<boolean>`${players.readyAt} is not null`,
      active: players.active,
      isBot: players.isBot,
      answered: sql<number>`(select count(*)::int from ${playerPrompts} pp where pp.player_id = ${players.id} and coalesce(btrim(pp.answer_text), '') <> '')`,
    })
    .from(players)
    .where(eq(players.gameId, gameId))
    .orderBy(asc(players.joinedAt));
}


/** Saves a player's win/lose catchphrases. Empty means "pick one for me". */
export async function setSlogans(db: DB, game: Game, player: Player, input: { win?: string | null; lose?: string | null }) {
  if (game.phase === "FINISHED") throw new ApiError("WRONG_PHASE", "This game has ended.");
  const set: { winSlogan?: string | null; loseSlogan?: string | null } = {};
  for (const [key, col] of [["win", "winSlogan"], ["lose", "loseSlogan"]] as const) {
    if (input[key] === undefined) continue;
    const check = validateSlogan(input[key]);
    if (!check.ok) throw new ApiError("VALIDATION", check.reason);
    set[col] = check.value;
  }
  if (Object.keys(set).length) {
    await db.update(players).set(set).where(and(eq(players.id, player.id), eq(players.gameId, game.id)));
  }
}

/** A player of this game by id (for the host's simulation view). */
export async function findPlayerInGame(db: DB, gameId: string, playerId: string): Promise<Player | null> {
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return null;
  const [p] = await db.select().from(players).where(and(eq(players.gameId, gameId), eq(players.id, playerId)));
  return p ?? null;
}
