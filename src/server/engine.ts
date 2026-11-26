import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import {
  games,
  guesses,
  playerPrompts,
  players,
  prompts,
  rounds,
  scoreEvents,
  type Game,
  type Player,
  type Round,
} from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { generateQuiz, maxPerSubject, type GenAnswer } from "@/lib/generator";
import { hashString } from "@/lib/prng";
import { introDurationMs } from "@/server/introTiming";
import { randomInt } from "node:crypto";
import { FASTEST_BONUS_MAX, FASTEST_BONUS_MIN, fastestCorrect, pointsFor } from "@/lib/scoring";
import { MIN_PLAYERS, parseSettings } from "@/lib/settings";
import { validateAnswer } from "@/lib/text";

export const ACTIONS = ["prepare", "open", "next", "reveal", "pause", "resume", "skip", "end"] as const;
export type GameAction = (typeof ACTIONS)[number];

const RESERVE_ROUNDS = 6;


type Locked = { game: Game; now: Date };

/** Locks the game row (FOR UPDATE for transitions, FOR SHARE for guesses) and reads the DB clock. */
async function lockGame(tx: DB, gameId: string, mode: "update" | "share"): Promise<Locked> {
  const rows = await tx
    .select({ game: games, now: sql<Date>`now()`.mapWith((v: unknown) => new Date(v as string)) })
    .from(games)
    .where(eq(games.id, gameId))
    .for(mode);
  if (!rows[0]) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
  if (rows[0].game.expiresAt.getTime() <= rows[0].now.getTime()) {
    throw new ApiError("GAME_NOT_FOUND", "This game has expired.");
  }
  return rows[0];
}

async function bumpGame(tx: DB, gameId: string, patch: PgUpdateSetSource<typeof games>) {
  await tx
    .update(games)
    .set({ ...patch, version: sql`${games.version} + 1`, updatedAt: sql`now()` })
    .where(eq(games.id, gameId));
}

// ---------- Start & preparation ----------

export type StartResult = { started: true; excluded: number };

/**
 * Locks the roster and questionnaires, then moves to PREPARING. Unready players are only
 * excluded when the host explicitly confirms (excludeUnready).
 */
export async function startGame(
  db: DB,
  gameId: string,
  opts: { excludeUnready: boolean; perPlayer?: number },
  prepareOpts?: PrepareOptions,
): Promise<StartResult> {
  const result = await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, gameId, "update");
    if (game.phase !== "LOBBY") throw new ApiError("WRONG_PHASE", "This game has already started.");
    const roster = await tx.select().from(players).where(and(eq(players.gameId, game.id), eq(players.active, true)));
    const ready = roster.filter((p) => p.readyAt);
    const unready = roster.filter((p) => !p.readyAt);
    if (ready.length < MIN_PLAYERS) {
      throw new ApiError("NOT_ENOUGH_PLAYERS", `At least ${MIN_PLAYERS} players need to finish their questions before starting.`, {
        ready: ready.length,
      });
    }
    if (unready.length && !opts.excludeUnready) {
      throw new ApiError("UNREADY_PLAYERS", `${unready.length} player(s) haven't finished. Start without them?`, {
        names: unready.map((p) => p.displayName),
      });
    }
    if (unready.length) {
      await tx.update(players).set({ active: false }).where(inArray(players.id, unready.map((p) => p.id)));
    }
    const settings = parseSettings(game.settings);
    await bumpGame(tx, game.id, {
      phase: "PREPARING",
      rosterLockedAt: sql`now()`,
      prepareError: null,
      settings: { ...settings, perPlayer: opts.perPlayer ?? settings.perPlayer },
    });
    return { started: true as const, excluded: unready.length };
  });
  await prepareRounds(db, gameId, prepareOpts);
  return result;
}

export type PrepareOptions = {
  seed?: number | string;
  aiDistractors?: (items: { key: string; prompt: string; answer: string; existing: string[] }[]) => Promise<Record<string, string[]>>;
};

export async function loadGenerationInput(db: DB, gameId: string) {
  const roster = await db
    .select({ id: players.id, name: players.displayName })
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.active, true)));
  const rows = await db
    .select({
      playerPromptId: playerPrompts.id,
      playerId: playerPrompts.playerId,
      promptId: playerPrompts.promptId,
      promptText: prompts.text,
      template: prompts.questionTemplate,
      answer: playerPrompts.answerText,
      optionId: playerPrompts.answerOptionId,
      fallback: prompts.fallbackOptions,
    })
    .from(playerPrompts)
    .innerJoin(prompts, eq(prompts.id, playerPrompts.promptId))
    .innerJoin(players, eq(players.id, playerPrompts.playerId))
    .where(and(eq(playerPrompts.gameId, gameId), eq(players.active, true)));
  const fallbackByPrompt: Record<string, string[]> = {};
  const answers: GenAnswer[] = [];
  for (const r of rows) {
    fallbackByPrompt[r.promptId] = r.fallback;
    const v = r.answer ? validateAnswer(r.answer) : null;
    if (v?.ok) {
      answers.push({
        playerPromptId: r.playerPromptId,
        playerId: r.playerId,
        promptId: r.promptId,
        promptText: r.promptText,
        template: r.template,
        answer: v.value,
        curated: Boolean(r.optionId),
      });
    }
  }
  return { roster, answers, fallbackByPrompt };
}

/** Runs the generator without writing anything (lobby preview and the start dialog). */
export async function previewRounds(db: DB, game: Game) {
  const settings = parseSettings(game.settings);
  const input = await loadGenerationInput(db, game.id);
  const readyIds = new Set(
    (
      await db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.gameId, game.id), eq(players.active, true), sql`${players.readyAt} is not null`))
    ).map((r) => r.id),
  );
  const roster = input.roster.filter((r) => readyIds.has(r.id));
  const base = {
    players: roster,
    answers: input.answers.filter((a) => readyIds.has(a.playerId)),
    fallbackByPrompt: input.fallbackByPrompt,
    seed: game.id,
  };
  const maxPerPlayer = maxPerSubject(base);
  // The host's plan from the setup screen if there is one, otherwise a sensible default.
  const suggested = Math.max(1, Math.min(maxPerPlayer, settings.perPlayer ?? (roster.length >= 10 ? 2 : roster.length >= 6 ? 3 : 4)));
  return {
    readyPlayers: roster.length,
    totalPlayers: input.roster.length,
    maxPerPlayer,
    suggestedPerPlayer: suggested,
    questionSeconds: settings.questionSeconds,
  };
}

/**
 * Generates and validates rounds for a PREPARING game. Safe to retry: existing generated rounds
 * are replaced. Snapshot data is immutable after roster lock, so reading outside the lock is safe.
 */
export async function prepareRounds(db: DB, gameId: string, opts: PrepareOptions = {}): Promise<{ planned: number; achievable: number }> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
  if (game.phase !== "PREPARING") throw new ApiError("WRONG_PHASE", "Rounds can only be prepared before the first question.");
  const settings = parseSettings(game.settings);
  const input = await loadGenerationInput(db, gameId);

  let extraDistractors: Record<string, string[]> | undefined;
  if (settings.aiDistractors && opts.aiDistractors) {
    // Only answers that lack enough real distractors are sent, and only prompt + answer text.
    const byPrompt = new Map<string, string[]>();
    for (const a of input.answers) byPrompt.set(a.promptId, [...(byPrompt.get(a.promptId) ?? []), a.answer]);
    const needy = input.answers.filter((a) => (byPrompt.get(a.promptId)?.length ?? 0) < 4);
    try {
      extraDistractors = await opts.aiDistractors(
        needy.map((a) => ({ key: a.playerPromptId, prompt: a.promptText, answer: a.answer, existing: input.fallbackByPrompt[a.promptId] ?? [] })),
      );
    } catch {
      extraDistractors = undefined;
    }
  }

  const result = generateQuiz({
    players: input.roster,
    answers: input.answers,
    fallbackByPrompt: input.fallbackByPrompt,
    extraDistractors,
    roundCount: settings.roundCount,
    perSubject: settings.perPlayer,
    reserveCount: settings.replaceSkipped ? RESERVE_ROUNDS : 0,
    seed: opts.seed ?? `${gameId}:${Date.now()}`,
  });

  await db.transaction(async (tx) => {
    const { game: locked } = await lockGame(tx, gameId, "update");
    if (locked.phase !== "PREPARING") throw new ApiError("WRONG_PHASE", "The game has already moved on.");
    await tx.delete(rounds).where(eq(rounds.gameId, gameId));
    if (result.rounds.length === 0) {
      await bumpGame(tx, gameId, {
        prepareError: "Not enough answers to build any questions. Try again, or end the game and add players.",
      });
      return;
    }
    const durationMs = settings.questionSeconds * 1000;
    const all = [...result.rounds.map((r) => ({ r, status: "PENDING" as const })), ...result.reserves.map((r) => ({ r, status: "RESERVE" as const }))];
    await tx.insert(rounds).values(
      all.map(({ r, status }, i) => ({
        gameId,
        ordinal: i + 1,
        subjectPlayerId: r.subjectPlayerId,
        sourcePlayerPromptId: r.sourcePlayerPromptId,
        type: r.type,
        questionText: r.questionText,
        promptText: r.promptText,
        answerText: r.answerText,
        options: r.options,
        correctOptionId: r.correctOptionId,
        excludedPlayerIds: r.excludedPlayerIds,
        status,
        durationMs,
      })),
    );
    const note =
      result.rounds.length < result.requested
        ? `Only ${result.rounds.length} different questions could be built from everyone's answers (asked for ${result.requested}). No question is repeated.`
        : null;
    await bumpGame(tx, gameId, { prepareError: note });
  });
  return { planned: result.rounds.length, achievable: result.achievable };
}

// ---------- Transitions (all inside a transaction holding the game row lock) ----------

/**
 * Time before the 5-4-3-2-1 starts: covers the TV's and phones' polling delay, plus the
 * announcer's "get ready" line when the voice is on, so the countdown waits until he's done.
 */
export const POLL_MARGIN_MS = 1500;
export const COUNTDOWN_LEAD_MS = 2000; // with the voice off
const AFTER_INTRO_MS = 400;

async function openNextRound(tx: DB, game: Game, now: Date): Promise<void> {
  const [next] = await tx
    .select()
    .from(rounds)
    .where(and(eq(rounds.gameId, game.id), eq(rounds.status, "PENDING")))
    .orderBy(asc(rounds.ordinal))
    .limit(1);
  if (!next) {
    await bumpGame(tx, game.id, { phase: "FINISHED", finishedAt: now, currentRoundId: null });
    return;
  }
  // Fresh server deadline from the database clock. With a pre-question countdown the round
  // "opens" a few seconds from now; answers are refused until then and the timer starts after it.
  // Screens notice a new question on their next poll (about 1s, plus network time), so add a lead-in;
  // they hold the first number until the real countdown starts, so nobody misses the "5".
  const settings = parseSettings(game.settings);
  const countdownMs = settings.countdownSeconds * 1000;
  let leadMs = COUNTDOWN_LEAD_MS;
  if (countdownMs > 0 && settings.voice && settings.sound) {
    const all = await tx.select({ id: rounds.id, ordinal: rounds.ordinal, status: rounds.status }).from(rounds).where(eq(rounds.gameId, game.id));
    const counted = all.filter((x) => x.status !== "VOID" && x.status !== "RESERVE").sort((a, b) => a.ordinal - b.ordinal);
    const number = counted.findIndex((x) => x.id === next.id) + 1;
    const intro = introDurationMs(game.code, number, counted.length);
    if (intro > 0) leadMs = Math.max(COUNTDOWN_LEAD_MS, POLL_MARGIN_MS + intro + AFTER_INTRO_MS);
  }
  const opensAt = new Date(now.getTime() + (countdownMs > 0 ? countdownMs + leadMs : 0));
  await tx
    .update(rounds)
    .set({ status: "OPEN", openedAt: opensAt, deadlineAt: new Date(opensAt.getTime() + next.durationMs), pausedAt: null, remainingMs: null })
    .where(eq(rounds.id, next.id));
  await bumpGame(tx, game.id, { phase: "QUESTION", currentRoundId: next.id });
}

async function currentRound(tx: DB, game: Game): Promise<Round | null> {
  if (!game.currentRoundId) return null;
  const [r] = await tx.select().from(rounds).where(and(eq(rounds.id, game.currentRoundId), eq(rounds.gameId, game.id)));
  return r ?? null;
}

/** Scores a round exactly once. Every eligible player gets a score event (0 when missed). */
async function revealRound(tx: DB, game: Game, round: Round, now: Date): Promise<void> {
  const settings = parseSettings(game.settings);
  const eligible = await tx
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.active, true)));
  const excluded = new Set(round.excludedPlayerIds);
  const roundGuesses = await tx.select().from(guesses).where(eq(guesses.roundId, round.id));
  const byPlayer = new Map(roundGuesses.map((g) => [g.playerId, g]));
  const scoring = eligible.filter((p) => !excluded.has(p.id));
  // Fastest right answer (on time) gets a random 25–50 bonus, decided once here.
  const fastest = fastestCorrect(
    scoring.flatMap((p) => {
      const g = byPlayer.get(p.id);
      return g ? [{ playerId: p.id, correct: g.optionId === round.correctOptionId, elapsedMs: g.elapsedMs }] : [];
    }),
    round.durationMs,
  );
  const bonus = randomInt(FASTEST_BONUS_MIN, FASTEST_BONUS_MAX + 1);
  const events = scoring
    .map((p) => {
      const g = byPlayer.get(p.id);
      const correct = Boolean(g && g.optionId === round.correctOptionId);
      const points =
        pointsFor({
          correct,
          speedBonus: settings.speedBonus,
          remainingMs: g ? round.durationMs - g.elapsedMs : 0,
          durationMs: round.durationMs,
        }) + (settings.fastestBonus && correct && fastest.has(p.id) ? bonus : 0);
      return { roundId: round.id, playerId: p.id, points, isCorrect: correct };
    });
  if (events.length) await tx.insert(scoreEvents).values(events).onConflictDoNothing();
  await tx.update(rounds).set({ status: "REVEALED", revealedAt: now, pausedAt: null }).where(eq(rounds.id, round.id));
  await bumpGame(tx, game.id, { phase: "REVEAL" });
}

export type ActionResult = { ok: true; noop: boolean; version: number; phase: Game["phase"] };

function alreadyDone(action: GameAction, game: Game, round: Round | null): boolean {
  switch (action) {
    case "reveal":
      return game.phase === "REVEAL" || game.phase === "FINISHED";
    case "pause":
      return game.phase === "QUESTION" && Boolean(round?.pausedAt);
    case "resume":
      return game.phase === "QUESTION" && !round?.pausedAt;
    case "end":
      return game.phase === "FINISHED";
    case "open":
    case "next":
      return game.phase === "QUESTION" || game.phase === "LEADERBOARD" || game.phase === "FINISHED";
    default:
      return false;
  }
}

/**
 * Host-driven state machine. Uses optimistic concurrency (expectedVersion) on top of the row
 * lock: a stale request that asks for something that already happened is a no-op, anything
 * else stale is an explicit 409 conflict.
 */
export async function performAction(
  db: DB,
  gameId: string,
  action: GameAction,
  expectedVersion?: number,
  prepareOpts?: PrepareOptions,
): Promise<ActionResult> {
  if (action === "prepare") {
    const [g] = await db.select().from(games).where(eq(games.id, gameId));
    if (!g) throw new ApiError("GAME_NOT_FOUND", "Game not found.");
    if (expectedVersion !== undefined && g.version !== expectedVersion) {
      throw new ApiError("VERSION_CONFLICT", "The game changed. Refreshing…");
    }
    await prepareRounds(db, gameId, prepareOpts);
    const [after] = await db.select().from(games).where(eq(games.id, gameId));
    return { ok: true, noop: false, version: after.version, phase: after.phase };
  }

  return db.transaction(async (tx) => {
    const { game, now } = await lockGame(tx, gameId, "update");
    const round = await currentRound(tx, game);
    // "end" is an explicit, confirmed host decision that means the same thing in any phase,
    // so an auto-advance landing at the same moment must not turn it into a conflict.
    if (expectedVersion !== undefined && expectedVersion !== game.version && action !== "end") {
      if (alreadyDone(action, game, round)) return { ok: true, noop: true, version: game.version, phase: game.phase };
      throw new ApiError("VERSION_CONFLICT", "The game changed. Refreshing…");
    }
    await applyAction(tx, game, round, action, now);
    const [after] = await tx.select({ version: games.version, phase: games.phase }).from(games).where(eq(games.id, gameId));
    return { ok: true, noop: false, version: after.version, phase: after.phase };
  });
}

async function applyAction(tx: DB, game: Game, round: Round | null, action: GameAction, now: Date) {
  const settings = parseSettings(game.settings);
  switch (action) {
    case "open":
    case "next": {
      if (game.phase === "PREPARING") {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(rounds).where(eq(rounds.gameId, game.id));
        if (n === 0) throw new ApiError("GENERATION_FAILED", "No questions are ready yet. Try preparing again.");
        return openNextRound(tx, game, now);
      }
      // Reveal -> full-screen leaderboard -> next question.
      if (game.phase === "REVEAL") return bumpGame(tx, game.id, { phase: "LEADERBOARD" });
      if (game.phase === "LEADERBOARD") return openNextRound(tx, game, now);
      throw new ApiError("WRONG_PHASE", "There is no question to move on from right now.");
    }
    case "reveal": {
      if (game.phase !== "QUESTION" || !round || round.status !== "OPEN") {
        throw new ApiError("WRONG_PHASE", "There is no open question to reveal.");
      }
      return revealRound(tx, game, round, now);
    }
    case "pause": {
      if (game.phase !== "QUESTION" || !round || round.status !== "OPEN") throw new ApiError("WRONG_PHASE", "Nothing to pause.");
      if (round.pausedAt) return;
      const remaining = Math.max(0, (round.deadlineAt?.getTime() ?? now.getTime()) - now.getTime());
      await tx.update(rounds).set({ pausedAt: now, remainingMs: remaining }).where(eq(rounds.id, round.id));
      return bumpGame(tx, game.id, {});
    }
    case "resume": {
      if (game.phase !== "QUESTION" || !round || round.status !== "OPEN") throw new ApiError("WRONG_PHASE", "Nothing to resume.");
      if (!round.pausedAt) return;
      const remaining = round.remainingMs ?? 0;
      const deadlineAt = new Date(now.getTime() + remaining);
      // Paused during the countdown: the rest of the countdown resumes too.
      const openedAt = remaining > round.durationMs ? new Date(deadlineAt.getTime() - round.durationMs) : round.openedAt;
      await tx
        .update(rounds)
        .set({ pausedAt: null, remainingMs: null, deadlineAt, openedAt })
        .where(eq(rounds.id, round.id));
      return bumpGame(tx, game.id, {});
    }
    case "skip": {
      if (game.phase !== "QUESTION" || !round || round.status !== "OPEN") throw new ApiError("WRONG_PHASE", "Only an open question can be skipped.");
      await tx.update(rounds).set({ status: "VOID", pausedAt: null }).where(eq(rounds.id, round.id));
      if (settings.replaceSkipped) {
        const [reserve] = await tx
          .select({ id: rounds.id })
          .from(rounds)
          .where(and(eq(rounds.gameId, game.id), eq(rounds.status, "RESERVE")))
          .orderBy(asc(rounds.ordinal))
          .limit(1);
        if (reserve) await tx.update(rounds).set({ status: "PENDING" }).where(eq(rounds.id, reserve.id));
      }
      return openNextRound(tx, game, now);
    }
    case "end": {
      if (game.phase === "FINISHED") return;
      if (round && round.status === "OPEN") {
        await tx.update(rounds).set({ status: "VOID", pausedAt: null }).where(eq(rounds.id, round.id));
      }
      return bumpGame(tx, game.id, { phase: "FINISHED", finishedAt: now, currentRoundId: null });
    }
    default:
      throw new ApiError("VALIDATION", "Unknown action.");
  }
}

// ---------- Guessing ----------

export type GuessResult = { locked: true; optionId: string; roundId: string };

/**
 * Accepts a guess only for the current open round, from an eligible player, before the
 * database-clock deadline and while not paused. First valid submission wins.
 */
export async function submitGuess(db: DB, gameId: string, player: Player, roundId: string, optionId: string): Promise<GuessResult> {
  return db.transaction(async (tx) => {
    // FOR SHARE: concurrent guesses don't block each other, but they do serialize against reveal.
    const { game, now } = await lockGame(tx, gameId, "share");
    if (game.phase !== "QUESTION" || game.currentRoundId !== roundId) {
      throw new ApiError("WRONG_PHASE", "That question is closed.");
    }
    const [round] = await tx.select().from(rounds).where(and(eq(rounds.id, roundId), eq(rounds.gameId, game.id)));
    if (!round || round.status !== "OPEN") throw new ApiError("WRONG_PHASE", "That question is closed.");
    if (round.pausedAt) throw new ApiError("PAUSED", "The game is paused.");
    // Late answers (after the timer) are still accepted until the reveal; they just get shamed
    // on the TV and earn no speed bonus.
    if (!round.deadlineAt) throw new ApiError("WRONG_PHASE", "That question isn't open.");
    if (round.openedAt && now < round.openedAt) throw new ApiError("WRONG_PHASE", "Get ready! Answers open when the countdown ends.");
    if (player.gameId !== game.id || !player.active) throw new ApiError("NOT_ELIGIBLE", "You're not playing in this game.");
    if (round.excludedPlayerIds.includes(player.id)) throw new ApiError("NOT_ELIGIBLE", "This question is about you, so you sit this one out.");
    if (!round.options.some((o) => o.id === optionId)) throw new ApiError("VALIDATION", "That isn't one of the choices.");

    const elapsedMs = Math.max(0, round.durationMs - (round.deadlineAt.getTime() - now.getTime()));
    const inserted = await tx
      .insert(guesses)
      .values({ roundId, playerId: player.id, optionId, submittedAt: now, elapsedMs })
      .onConflictDoNothing({ target: [guesses.roundId, guesses.playerId] })
      .returning({ optionId: guesses.optionId });
    if (inserted[0]) return { locked: true, optionId, roundId };
    const [existing] = await tx
      .select({ optionId: guesses.optionId })
      .from(guesses)
      .where(and(eq(guesses.roundId, roundId), eq(guesses.playerId, player.id)));
    if (existing?.optionId === optionId) return { locked: true, optionId, roundId };
    throw new ApiError("ALREADY_LOCKED", "Your answer is already locked in.", { optionId: existing?.optionId });
  });
}

// ---------- Automatic transitions & demo bots (evaluated on authorized polls) ----------

export type TickContext = {
  game: Game;
  now: Date;
  round: Round | null;
  eligibleCount: number;
  answeredCount: number;
  runBots: boolean;
};

/**
 * Evaluates at most ONE due transition per call. No process timers: if nobody polls,
 * the transition happens on the next request. Returns true if state changed.
 */
export async function tick(db: DB, ctx: TickContext): Promise<boolean> {
  const { game, now, round } = ctx;
  const settings = parseSettings(game.settings);
  let changed = false;

  if (ctx.runBots && game.phase === "QUESTION" && round && round.status === "OPEN" && !round.pausedAt) {
    changed = (await runBots(db, game, round, now)) || changed;
  }

  if (game.phase === "QUESTION" && round && round.status === "OPEN" && !round.pausedAt && settings.autoReveal) {
    // Auto reveal: when everyone has answered, or once the overtime grace period is over.
    const expired = round.deadlineAt !== null && now.getTime() >= round.deadlineAt.getTime() + settings.overtimeSeconds * 1000;
    let allIn = ctx.eligibleCount > 0 && ctx.answeredCount >= ctx.eligibleCount;
    if (!allIn && changed) allIn = (await countAnswered(db, round)) >= ctx.eligibleCount;
    if (expired || allIn) {
      return (await guardedAction(db, game, "reveal")) || changed;
    }
  }

  if (game.phase === "REVEAL" && settings.autoNext && round?.revealedAt) {
    if (now.getTime() >= round.revealedAt.getTime() + settings.revealSeconds * 1000) {
      return (await guardedAction(db, game, "next")) || changed;
    }
  }
  // The leaderboard step started when the game row was last updated.
  if (game.phase === "LEADERBOARD" && settings.autoNext) {
    if (now.getTime() >= game.updatedAt.getTime() + settings.revealSeconds * 1000) {
      return (await guardedAction(db, game, "next")) || changed;
    }
  }
  return changed;
}

async function guardedAction(db: DB, game: Game, action: GameAction): Promise<boolean> {
  try {
    const r = await performAction(db, game.id, action, game.version);
    return !r.noop;
  } catch (err) {
    if (err instanceof ApiError && (err.code === "VERSION_CONFLICT" || err.code === "WRONG_PHASE")) return false;
    throw err;
  }
}

async function countAnswered(db: DB, round: Round): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guesses)
    .innerJoin(players, eq(players.id, guesses.playerId))
    .where(and(eq(guesses.roundId, round.id), eq(players.active, true)));
  return n;
}

/** Demo bots answer after a pseudo-random delay, correct a bit over half the time. */
async function runBots(db: DB, game: Game, round: Round, now: Date): Promise<boolean> {
  const bots = await db
    .select()
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.isBot, true), eq(players.active, true)));
  if (!bots.length || !round.openedAt) return false;
  const existing = await db.select({ playerId: guesses.playerId }).from(guesses).where(eq(guesses.roundId, round.id));
  const done = new Set(existing.map((e) => e.playerId));
  // Keeps counting past the deadline, so late (overtime) bots fire too.
  const elapsed = round.durationMs - ((round.deadlineAt?.getTime() ?? 0) - now.getTime());
  let any = false;
  for (const bot of bots) {
    if (done.has(bot.id) || round.excludedPlayerIds.includes(bot.id)) continue;
    const h = hashString(`${bot.id}:${round.id}`);
    // About 1 in 4 bots dawdles past the timer (2-9s late) so the SHAME ALERT can be seen.
    const slowpoke = (h >>> 12) % 4 === 0;
    const delay = slowpoke
      ? round.durationMs + 1000 + (h % 3500)
      : 1500 + (h % Math.max(1, Math.floor(round.durationMs * 0.6)));
    if (elapsed < delay) continue;
    const wrong = round.options.filter((o) => o.id !== round.correctOptionId);
    const optionId = h % 100 < 55 ? round.correctOptionId : wrong[(h >>> 8) % wrong.length].id;
    try {
      await submitGuess(db, game.id, bot, round.id, optionId);
      any = true;
    } catch {
      /* round closed meanwhile */
    }
  }
  return any;
}
