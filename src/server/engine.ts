import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import {
  bonusQuestions,
  customQuestions,
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
import { hashString, createRng } from "@/lib/prng";
import { defaultSpeedCount, pickTrivia, SPEED_MIN_POINTS, SPEED_TOP_POINTS, speedPlacePoints, speedPositions } from "@/lib/trivia";
import { BONUS_MIN_POINTS, BONUS_POINTS, bonusPlacePoints, bonusPlaces, bonusSlots, defaultBonusCount, interleave, pickBonus, type BonusDifficulty } from "@/lib/bonus";
import { bonusIntroDurationMs, introDurationMs } from "@/server/introTiming";
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
  // A new phase starts its autoplay clock now, unpaused.
  const phase = patch.phase ? { phaseStartedAt: sql`now()`, pausedAt: null } : {};
  await tx
    .update(games)
    .set({ ...phase, ...patch, version: sql`${games.version} + 1`, updatedAt: sql`now()` })
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
  opts: { excludeUnready: boolean; perPlayer?: number; roundCount?: number },
  prepareOpts?: PrepareOptions,
): Promise<StartResult> {
  const result = await db.transaction(async (tx) => {
    const { game, now } = await lockGame(tx, gameId, "update");
    if (game.phase !== "LOBBY") throw new ApiError("WRONG_PHASE", "This game has already started.");
    if (parseSettings(game.settings).mode !== "personal") {
      // Quiz and Custom modes need nothing from players: everyone who joined plays.
      await tx
        .update(players)
        .set({ readyAt: now })
        .where(and(eq(players.gameId, game.id), eq(players.active, true), sql`${players.readyAt} is null`));
    }
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
      settings: {
        ...settings,
        perPlayer: opts.perPlayer ?? settings.perPlayer,
        roundCount: opts.roundCount ? Math.max(1, Math.min(80, opts.roundCount)) : settings.roundCount,
      },
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
  if (settings.mode !== "personal") {
    // Quiz / Custom: how many trivia questions there are to choose from.
    const [{ n: players_ }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(players)
      .where(and(eq(players.gameId, game.id), eq(players.active, true)));
    const [{ n: available }] =
      settings.mode === "quiz"
        ? await db.select({ n: sql<number>`count(*)::int` }).from(bonusQuestions).where(eq(bonusQuestions.active, true))
        : settings.questionGroups.length
          ? await db.select({ n: sql<number>`count(*)::int` }).from(customQuestions).where(inArray(customQuestions.groupName, settings.questionGroups))
          : [{ n: 0 }];
    return {
      mode: settings.mode,
      readyPlayers: players_,
      totalPlayers: players_,
      maxPerPlayer: 0,
      suggestedPerPlayer: 0,
      available,
      suggestedQuestions: Math.min(available, settings.roundCount),
      questionSeconds: settings.questionSeconds,
    };
  }
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
    mode: settings.mode,
    available: 0,
    suggestedQuestions: 0,
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
  if (settings.mode !== "personal") return prepareTriviaRounds(db, game, opts);
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

  const seed = opts.seed ?? `${gameId}:${Date.now()}`;
  const result = generateQuiz({
    players: input.roster,
    answers: input.answers,
    fallbackByPrompt: input.fallbackByPrompt,
    extraDistractors,
    roundCount: settings.roundCount,
    perSubject: settings.perPlayer,
    reserveCount: settings.replaceSkipped ? RESERVE_ROUNDS : 0,
    seed,
  });

  // Bonus trivia in the middle of the game (fresh ones for this family first).
  let bonus: (typeof bonusQuestions.$inferSelect)[] = [];
  if (settings.bonusQuestions) {
    const bank = await db.select().from(bonusQuestions).where(eq(bonusQuestions.active, true)).orderBy(asc(bonusQuestions.sortOrder));
    const recent = game.familyId
      ? await db
          .select({ id: rounds.bonusQuestionId })
          .from(rounds)
          .innerJoin(games, eq(games.id, rounds.gameId))
          .where(and(eq(games.familyId, game.familyId), sql`${rounds.bonusQuestionId} is not null`, sql`${games.id} <> ${gameId}`))
      : [];
    const want = Math.min(settings.bonusCount ?? defaultBonusCount(settings.perPlayer), Math.max(0, result.rounds.length - 1));
    bonus = pickBonus(bank, want, String(seed), new Set(recent.map((x) => x.id!).filter(Boolean)));
  }

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
    const rng = createRng(`${String(seed)}:bonus-options`);
    const optId = () => "o_" + Math.floor(rng() * 36 ** 6).toString(36).padStart(6, "0");
    const regularRow = (r: (typeof result.rounds)[number], status: "PENDING" | "RESERVE") => ({
      gameId,
      subjectPlayerId: r.subjectPlayerId,
      sourcePlayerPromptId: r.sourcePlayerPromptId,
      type: r.type,
      questionText: r.questionText,
      promptText: r.promptText,
      answerText: r.answerText,
      options: r.options,
      correctOptionId: r.correctOptionId,
      excludedPlayerIds: r.excludedPlayerIds,
      kind: "personal" as RoundKind,
      status,
      durationMs,
    });
    const bonusRow = (b: (typeof bonus)[number]) => {
      const options = b.options.map((label) => ({ id: optId(), label }));
      const difficulty = b.difficulty as BonusDifficulty;
      return {
        gameId,
        subjectPlayerId: null,
        sourcePlayerPromptId: null,
        bonusQuestionId: b.id,
        kind: "bonus" as RoundKind,
        bonusPoints: BONUS_POINTS[difficulty] ?? BONUS_POINTS.medium,
        bonusDifficulty: difficulty,
        type: "WHAT_ANSWER" as const,
        questionText: b.question,
        promptText: b.question,
        answerText: b.options[b.correctIndex],
        options,
        correctOptionId: options[b.correctIndex].id,
        excludedPlayerIds: [] as string[],
        status: "PENDING" as const,
        durationMs: b.timeSeconds * 1000,
      };
    };
    const ordered = applySpeed(
      interleave(result.rounds, bonus, bonusSlots(result.rounds.length, bonus.length)).map((x) =>
        x.kind === "regular" ? regularRow(x.item, "PENDING") : bonusRow(x.item),
      ),
      settings,
    );
    const all = [...ordered, ...result.reserves.map((r) => regularRow(r, "RESERVE"))];
    await tx.insert(rounds).values(all.map((row, i) => ({ ...row, ordinal: i + 1 })));
    const note =
      result.rounds.length < result.requested
        ? `Only ${result.rounds.length} different questions could be built from everyone's answers (asked for ${result.requested}). No question is repeated.`
        : null;
    await bumpGame(tx, gameId, { prepareError: note });
  });
  return { planned: result.rounds.length, achievable: result.achievable };
}

/** Autoplay: how long the "Get ready!" roster shows before the first question starts by itself. */
export const AUTO_FIRST_QUESTION_MS = 6000;

export type RoundKind = "personal" | "bonus" | "trivia" | "speed";

/**
 * Speed questions: some numbered questions (never the first or last) get a short timer and pay
 * by finishing place. Works on rows in play order; bonus rows are left alone.
 */
function applySpeed<T extends { kind: RoundKind; durationMs: number; bonusPoints?: number | null }>(rows: T[], settings: ReturnType<typeof parseSettings>): T[] {
  if (!settings.speedQuestions) return rows;
  const numbered = rows.map((r, i) => ({ r, i })).filter((x) => x.r.kind !== "bonus");
  const count = Math.min(settings.speedCount ?? defaultSpeedCount(numbered.length), Math.max(0, numbered.length - 2));
  const pick = new Set(speedPositions(numbered.length, count).map((p) => numbered[p]?.i));
  return rows.map((r, i) => (pick.has(i) ? { ...r, kind: "speed" as RoundKind, durationMs: settings.speedSeconds * 1000, bonusPoints: SPEED_TOP_POINTS } : r));
}

/** Quiz mode (built-in trivia) and Custom mode (uploaded question groups). Everyone plays every question. */
async function prepareTriviaRounds(db: DB, game: Game, opts: PrepareOptions): Promise<{ planned: number; achievable: number }> {
  const settings = parseSettings(game.settings);
  const seed = String(opts.seed ?? `${game.id}:${Date.now()}`);
  type Item = { key: string; builtIn: boolean; question: string; options: string[]; correctIndex: number; difficulty: string; seconds: number | null };
  let pool: Item[];
  if (settings.mode === "quiz") {
    const bank = await db.select().from(bonusQuestions).where(eq(bonusQuestions.active, true));
    pool = bank.map((b) => ({ key: b.id, builtIn: true, question: b.question, options: b.options, correctIndex: b.correctIndex, difficulty: b.difficulty, seconds: null }));
  } else {
    const groups = settings.questionGroups;
    const bank = groups.length ? await db.select().from(customQuestions).where(inArray(customQuestions.groupName, groups)) : [];
    pool = bank.map((c) => ({ key: c.id, builtIn: false, question: c.question, options: c.options, correctIndex: c.correctIndex, difficulty: c.difficulty, seconds: c.seconds }));
  }
  const chosen = pickTrivia(pool, settings.roundCount, seed);
  const rng = createRng(`${seed}:trivia-options`);
  const optId = () => "o_" + Math.floor(rng() * 36 ** 6).toString(36).padStart(6, "0");
  await db.transaction(async (tx) => {
    const { game: locked } = await lockGame(tx, game.id, "update");
    if (locked.phase !== "PREPARING") throw new ApiError("WRONG_PHASE", "The game has already moved on.");
    await tx.delete(rounds).where(eq(rounds.gameId, game.id));
    if (!chosen.length) {
      await bumpGame(tx, game.id, {
        prepareError:
          settings.mode === "custom"
            ? "No questions to play: pick at least one uploaded question group in the game settings."
            : "No trivia questions are loaded. Run the latest neon-setup.sql.",
      });
      return;
    }
    const rows = applySpeed(
      chosen.map((c) => {
        const options = c.options.map((label) => ({ id: optId(), label }));
        return {
          gameId: game.id,
          subjectPlayerId: null,
          sourcePlayerPromptId: null,
          bonusQuestionId: c.builtIn ? c.key : null,
          customQuestionId: c.builtIn ? null : c.key,
          kind: "trivia" as RoundKind,
          bonusPoints: null as number | null,
          bonusDifficulty: c.difficulty,
          type: "WHAT_ANSWER" as const,
          questionText: c.question,
          promptText: c.question,
          answerText: c.options[c.correctIndex],
          options,
          correctOptionId: options[c.correctIndex].id,
          excludedPlayerIds: [] as string[],
          status: "PENDING" as const,
          durationMs: (c.seconds ?? settings.questionSeconds) * 1000,
        };
      }),
      settings,
    );
    await tx.insert(rounds).values(rows.map((row, i) => ({ ...row, ordinal: i + 1 })));
    const note =
      chosen.length < settings.roundCount
        ? `Only ${chosen.length} question${chosen.length === 1 ? "" : "s"} available (asked for ${settings.roundCount}). No question is repeated.`
        : null;
    await bumpGame(tx, game.id, { prepareError: note });
  });
  return { planned: chosen.length, achievable: pool.length };
}

// ---------- Transitions (all inside a transaction holding the game row lock) ----------

/**
 * Time before the 5-4-3-2-1 starts: covers the TV's and phones' polling delay, plus the
 * announcer's "get ready" line when the voice is on, so the countdown waits until he's done.
 */
export const POLL_MARGIN_MS = 2000;
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
    const all = await tx
      .select({ id: rounds.id, ordinal: rounds.ordinal, status: rounds.status, kind: rounds.kind })
      .from(rounds)
      .where(eq(rounds.gameId, game.id));
    const intro =
      next.kind === "bonus" && next.bonusDifficulty
      ? bonusIntroDurationMs(game.code, next.ordinal, next.bonusDifficulty)
      : (() => {
          const counted = all
            .filter((x) => x.status !== "VOID" && x.status !== "RESERVE" && x.kind !== "bonus")
            .sort((a, b) => a.ordinal - b.ordinal);
          const number = counted.findIndex((x) => x.id === next.id) + 1;
          return introDurationMs(game.code, number, counted.length);
        })();
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
    .select({ id: players.id, awayAt: players.awayAt })
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.active, true)));
  const excluded = new Set(round.excludedPlayerIds);
  const roundGuesses = await tx.select().from(guesses).where(eq(guesses.roundId, round.id));
  const byPlayer = new Map(roundGuesses.map((g) => [g.playerId, g]));
  // Players who stepped away (and didn't answer anyway) sit this one out: no score, no miss.
  const scoring = eligible.filter((p) => !excluded.has(p.id) && (!p.awayAt || byPlayer.has(p.id)));
  const answers = scoring.flatMap((p) => {
    const g = byPlayer.get(p.id);
    return g ? [{ playerId: p.id, correct: g.optionId === round.correctOptionId, elapsedMs: g.elapsedMs }] : [];
  });
  // Fastest right answer (on time) gets a random 25–50 bonus, decided once here.
  const fastest = fastestCorrect(answers, round.durationMs);
  const bonus = randomInt(FASTEST_BONUS_MIN, FASTEST_BONUS_MAX + 1);
  // Bonus and speed questions pay by finishing place among right answers.
  const byPlace = round.kind === "bonus" || round.kind === "speed";
  const places = byPlace ? bonusPlaces(answers, round.durationMs) : new Map<string, number>();
  const events = scoring.map((p) => {
    const g = byPlayer.get(p.id);
    const correct = Boolean(g && g.optionId === round.correctOptionId);
    const place = places.get(p.id);
    let base: number;
    if (round.kind === "bonus") base = correct ? (place ? bonusPlacePoints(round.bonusPoints ?? BONUS_POINTS.easy, place) : BONUS_MIN_POINTS) : 0;
    else if (round.kind === "speed") base = correct ? (place ? speedPlacePoints(place) : SPEED_MIN_POINTS) : 0;
    else
      base = pointsFor({
        correct,
        speedBonus: settings.speedBonus,
        remainingMs: g ? round.durationMs - g.elapsedMs : 0,
        durationMs: round.durationMs,
      });
    // The 25–50 speed bonus is for normal questions; bonus and speed questions already reward speed.
    const points = base + (!byPlace && settings.fastestBonus && correct && fastest.has(p.id) ? bonus : 0);
    return { roundId: round.id, playerId: p.id, points, isCorrect: correct };
  });
  if (events.length) await tx.insert(scoreEvents).values(events).onConflictDoNothing();
  if (settings.autoAway) await markAwayAfterMisses(tx, game, round, scoring.filter((p) => !byPlayer.has(p.id)).map((p) => p.id), settings.autoAwayMisses, now);
  await tx.update(rounds).set({ status: "REVEALED", revealedAt: now, pausedAt: null }).where(eq(rounds.id, round.id));
  await bumpGame(tx, game.id, { phase: "REVEAL" });
}

/**
 * Someone who missed `misses` questions in a row (this one included) is set aside as "away":
 * the game stops waiting for them and their phone asks "Still playing?".
 */
async function markAwayAfterMisses(tx: DB, game: Game, round: Round, missedNow: string[], misses: number, now: Date) {
  if (!missedNow.length) return;
  let away = missedNow;
  if (misses > 1) {
    const history = await tx
      .select({ playerId: scoreEvents.playerId, ordinal: rounds.ordinal, guessed: guesses.id })
      .from(scoreEvents)
      .innerJoin(rounds, eq(rounds.id, scoreEvents.roundId))
      .leftJoin(guesses, and(eq(guesses.roundId, scoreEvents.roundId), eq(guesses.playerId, scoreEvents.playerId)))
      .where(and(eq(rounds.gameId, game.id), inArray(scoreEvents.playerId, missedNow), sql`${rounds.id} <> ${round.id}`))
      .orderBy(desc(rounds.ordinal));
    away = missedNow.filter((id) => {
      const before = history.filter((h) => h.playerId === id).slice(0, misses - 1);
      return before.length === misses - 1 && before.every((h) => !h.guessed);
    });
  }
  if (away.length) {
    await tx
      .update(players)
      .set({ awayAt: now, awayReason: "auto" })
      .where(and(inArray(players.id, away), sql`${players.awayAt} is null`));
  }
}

export type ActionResult = { ok: true; noop: boolean; version: number; phase: Game["phase"] };

function alreadyDone(action: GameAction, game: Game, round: Round | null): boolean {
  switch (action) {
    case "reveal":
      return game.phase === "REVEAL" || game.phase === "FINISHED";
    case "pause":
      return game.phase === "QUESTION" ? Boolean(round?.pausedAt) : Boolean(game.pausedAt);
    case "resume":
      return game.phase === "QUESTION" ? !round?.pausedAt : !game.pausedAt;
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
      // Between questions (getting ready, the reveal, the leaderboard): hold autoplay where it is.
      if (game.phase === "PREPARING" || game.phase === "REVEAL" || game.phase === "LEADERBOARD") {
        if (game.pausedAt) return;
        return bumpGame(tx, game.id, { pausedAt: now });
      }
      if (game.phase !== "QUESTION" || !round || round.status !== "OPEN") throw new ApiError("WRONG_PHASE", "Nothing to pause.");
      if (round.pausedAt) return;
      const remaining = Math.max(0, (round.deadlineAt?.getTime() ?? now.getTime()) - now.getTime());
      await tx.update(rounds).set({ pausedAt: now, remainingMs: remaining }).where(eq(rounds.id, round.id));
      return bumpGame(tx, game.id, {});
    }
    case "resume": {
      if (game.phase === "PREPARING" || game.phase === "REVEAL" || game.phase === "LEADERBOARD") {
        if (!game.pausedAt) return;
        // The autoplay clock picks up where it left off.
        const held = now.getTime() - game.pausedAt.getTime();
        const started = new Date((game.phaseStartedAt ?? game.pausedAt).getTime() + held);
        return bumpGame(tx, game.id, { pausedAt: null, phaseStartedAt: started });
      }
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
    if (inserted[0]) {
      // Answering means you're back, if you'd stepped away.
      await tx.update(players).set({ awayAt: null, awayReason: null }).where(and(eq(players.id, player.id), sql`${players.awayAt} is not null`));
      return { locked: true, optionId, roundId };
    }
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

  // Paused between questions: nothing moves on by itself.
  if (game.pausedAt) return false;

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

  // Autoplay: the answer stays up for revealSeconds, the leaderboard for one page-time per chosen page.
  const phaseStart = (game.phaseStartedAt ?? game.updatedAt).getTime();
  if (game.phase === "REVEAL" && settings.autoNext && round?.revealedAt) {
    const start = game.phaseStartedAt ? phaseStart : round.revealedAt.getTime();
    if (now.getTime() >= start + settings.revealSeconds * 1000) {
      return (await guardedAction(db, game, "next")) || changed;
    }
  }
  if (game.phase === "LEADERBOARD" && settings.autoNext) {
    const pages = Math.max(1, settings.boards.length);
    if (now.getTime() >= phaseStart + pages * settings.leaderboardPageSeconds * 1000) {
      return (await guardedAction(db, game, "next")) || changed;
    }
  }
  // Autoplay: once the questions are ready, the first one starts by itself after a short "Get ready!".
  if (game.phase === "PREPARING" && settings.autoNext) {
    if (now.getTime() >= phaseStart + AUTO_FIRST_QUESTION_MS) {
      return (await guardedAction(db, game, "open")) || changed;
    }
  }
  return changed;
}

async function guardedAction(db: DB, game: Game, action: GameAction): Promise<boolean> {
  try {
    const r = await performAction(db, game.id, action, game.version);
    return !r.noop;
  } catch (err) {
    if (err instanceof ApiError && (err.code === "VERSION_CONFLICT" || err.code === "WRONG_PHASE" || err.code === "GENERATION_FAILED")) return false;
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
