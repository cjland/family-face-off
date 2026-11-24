import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { games, guesses, players, rounds, scoreEvents, type Game, type Player, type Round } from "@/db/schema";
import { displayKey } from "@/lib/crypto";
import type { GameStateDTO, RoundDTO, StandingDTO, View } from "@/lib/dto";
import { ApiError } from "@/lib/errors";
import { rankStandings, remainingActiveMs } from "@/lib/scoring";
import { parseSettings } from "@/lib/settings";
import { tick } from "./engine";
import { rosterFor } from "./lobby";

export type StateAuth = {
  view: View;
  player: Player | null;
  isHost: boolean;
  secret: string;
  demoTools: boolean;
  aiAvailable: boolean;
};

async function loadGameWithClock(db: DB, code: string): Promise<{ game: Game; now: Date }> {
  const rows = await db
    .select({ game: games, now: sql<Date>`now()`.mapWith((v: unknown) => new Date(v as string)) })
    .from(games)
    .where(eq(games.code, code))
    .limit(1);
  const row = rows[0];
  if (!row || row.game.expiresAt.getTime() <= row.now.getTime()) {
    throw new ApiError("GAME_NOT_FOUND", "We couldn't find that game. It may have ended or expired.");
  }
  return row;
}

export async function computeStandings(db: DB, gameId: string, includeInactive = false): Promise<StandingDTO[]> {
  const rows = await db
    .select({
      playerId: players.id,
      name: players.displayName,
      points: sql<number>`coalesce(sum(${scoreEvents.points}) filter (where ${rounds.status} = 'REVEALED'), 0)::int`,
      correct: sql<number>`count(*) filter (where ${scoreEvents.isCorrect} and ${rounds.status} = 'REVEALED')::int`,
      eligible: sql<number>`count(${scoreEvents.id}) filter (where ${rounds.status} = 'REVEALED')::int`,
    })
    .from(players)
    .leftJoin(scoreEvents, eq(scoreEvents.playerId, players.id))
    .leftJoin(rounds, eq(rounds.id, scoreEvents.roundId))
    .where(and(eq(players.gameId, gameId), includeInactive ? undefined : eq(players.active, true)))
    .groupBy(players.id, players.displayName);
  return rankStandings(rows);
}

function roundNumbering(all: { id: string; ordinal: number; status: Round["status"] }[], currentId: string) {
  const counted = all.filter((r) => r.status !== "VOID" && r.status !== "RESERVE").sort((a, b) => a.ordinal - b.ordinal);
  const idx = counted.findIndex((r) => r.id === currentId);
  return { number: idx >= 0 ? idx + 1 : counted.length, total: counted.length };
}

/**
 * Builds the role-specific game state. Applies due automatic transitions first (one per call).
 * Correct answers, other players' guesses and scores are only included after reveal.
 */
export async function getGameState(db: DB, code: string, auth: StateAuth): Promise<GameStateDTO> {
  let { game, now } = await loadGameWithClock(db, code);
  if (auth.view === "host" && !auth.isHost) throw new ApiError("UNAUTHENTICATED", "Please sign in as the host.");
  if (auth.view === "player" && (!auth.player || auth.player.gameId !== game.id)) {
    throw new ApiError("UNAUTHENTICATED", "Please join the game first.");
  }

  // Automatic transitions (auto reveal / auto next / demo bots), evaluated only when due.
  const settings0 = parseSettings(game.settings);
  const needsTick =
    (game.phase === "QUESTION" || game.phase === "REVEAL") &&
    (settings0.autoReveal || settings0.autoNext || (auth.demoTools && auth.view !== "player"));
  if (needsTick && game.currentRoundId) {
    const round = (await db.select().from(rounds).where(eq(rounds.id, game.currentRoundId)))[0] ?? null;
    const { eligibleCount, answeredCount } = round ? await roundCounts(db, game.id, round) : { eligibleCount: 0, answeredCount: 0 };
    const changed = await tick(db, {
      game,
      now,
      round,
      eligibleCount,
      answeredCount,
      runBots: auth.demoTools && auth.view !== "player",
    });
    if (changed) ({ game, now } = await loadGameWithClock(db, code));
  }

  const settings = parseSettings(game.settings);
  const activePlayers = await db
    .select({ id: players.id, name: players.displayName, readyAt: players.readyAt })
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.active, true)))
    .orderBy(asc(players.joinedAt));

  const state: GameStateDTO = {
    code: game.code,
    title: game.title,
    theme: settings.theme,
    phase: game.phase,
    version: game.version,
    serverNow: now.toISOString(),
    rosterLocked: Boolean(game.rosterLockedAt),
    settings: {
      questionSeconds: settings.questionSeconds,
      speedBonus: settings.speedBonus,
      autoReveal: settings.autoReveal,
      autoNext: settings.autoNext,
      revealSeconds: settings.revealSeconds,
      roundCount: settings.roundCount,
    },
    counts: { players: activePlayers.length, ready: activePlayers.filter((p) => p.readyAt).length },
    lobby: null,
    round: null,
    reveal: null,
    standings: null,
    me: null,
    host: null,
  };

  if (game.phase === "LOBBY" || game.phase === "PREPARING") {
    state.lobby = activePlayers.map((p) => ({ id: p.id, name: p.name, ready: Boolean(p.readyAt) }));
  }

  const me = auth.view === "player" ? auth.player : null;
  let round: Round | null = null;
  if ((game.phase === "QUESTION" || game.phase === "REVEAL") && game.currentRoundId) {
    round = (await db.select().from(rounds).where(and(eq(rounds.id, game.currentRoundId), eq(rounds.gameId, game.id))))[0] ?? null;
  }

  if (round) {
    const all = await db.select({ id: rounds.id, ordinal: rounds.ordinal, status: rounds.status }).from(rounds).where(eq(rounds.gameId, game.id));
    const { number, total } = roundNumbering(all, round.id);
    const { eligibleCount, answeredCount } = await roundCounts(db, game.id, round);
    const dto: RoundDTO = {
      id: round.id,
      number,
      total,
      type: round.type,
      questionText: round.questionText,
      promptText: round.promptText,
      clue: round.type === "WHO_ANSWERED" ? round.answerText : null,
      options: round.options,
      durationMs: round.durationMs,
      deadlineAt: round.deadlineAt?.toISOString() ?? null,
      paused: Boolean(round.pausedAt),
      remainingMs: round.status === "OPEN" ? remainingActiveMs(round, now) : 0,
      answeredCount,
      eligibleCount,
    };
    state.round = dto;

    if (game.phase === "REVEAL" && round.status === "REVEALED") {
      const roundGuesses = await db
        .select({ playerId: guesses.playerId, optionId: guesses.optionId, name: players.displayName })
        .from(guesses)
        .innerJoin(players, eq(players.id, guesses.playerId))
        .where(and(eq(guesses.roundId, round.id), eq(players.active, true)));
      const distribution: Record<string, number> = {};
      for (const o of round.options) distribution[o.id] = 0;
      for (const g of roundGuesses) distribution[g.optionId] = (distribution[g.optionId] ?? 0) + 1;
      const [subject] = await db.select({ name: players.displayName }).from(players).where(eq(players.id, round.subjectPlayerId));
      state.reveal = {
        correctOptionId: round.correctOptionId,
        answerText: round.answerText,
        subjectName: subject?.name ?? "",
        distribution,
        ...(auth.view !== "player"
          ? {
              guesses: roundGuesses
                .map((g) => ({ name: g.name, optionId: g.optionId, correct: g.optionId === round!.correctOptionId }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            }
          : {}),
      };
    }
  }

  const showStandings = game.phase === "REVEAL" || game.phase === "FINISHED";
  let standings: StandingDTO[] | null = null;
  if (showStandings || me) standings = await computeStandings(db, game.id);
  if (showStandings && standings) {
    state.standings = auth.view === "player" ? standings.slice(0, 5) : standings;
  }

  if (me) {
    const mine = standings?.find((s) => s.playerId === me.id);
    let lockedOptionId: string | null = null;
    let lastResult: NonNullable<GameStateDTO["me"]>["lastResult"] = null;
    if (round) {
      const [g] = await db
        .select({ optionId: guesses.optionId })
        .from(guesses)
        .where(and(eq(guesses.roundId, round.id), eq(guesses.playerId, me.id)));
      lockedOptionId = g?.optionId ?? null;
      if (game.phase === "REVEAL" && round.status === "REVEALED") {
        const [ev] = await db
          .select({ points: scoreEvents.points, isCorrect: scoreEvents.isCorrect })
          .from(scoreEvents)
          .where(and(eq(scoreEvents.roundId, round.id), eq(scoreEvents.playerId, me.id)));
        if (ev) lastResult = { correct: ev.isCorrect, points: ev.points, answered: Boolean(g) };
      }
    }
    const isSubject = Boolean(round && round.excludedPlayerIds.includes(me.id));
    // Own score is always visible; others' scores only after reveal.
    state.me = {
      id: me.id,
      name: me.displayName,
      active: me.active,
      ready: Boolean(me.readyAt),
      eligible: me.active && !isSubject,
      isSubject,
      lockedOptionId,
      points: mine?.points ?? 0,
      rank: showStandings ? (mine?.rank ?? null) : null,
      lastResult,
    };
  }

  if (auth.view === "host") {
    const roster = await rosterFor(db, game.id);
    const [{ planned }] = await db
      .select({ planned: sql<number>`count(*) filter (where ${rounds.status} <> 'VOID' and ${rounds.status} <> 'RESERVE')::int` })
      .from(rounds)
      .where(eq(rounds.gameId, game.id));
    state.host = {
      roster,
      displayKey: displayKey(game.id, auth.secret),
      prepareNote: game.prepareError,
      plannedRounds: planned,
      demoTools: auth.demoTools,
      aiAvailable: auth.aiAvailable,
      aiDistractors: settings.aiDistractors,
    };
  }

  return state;
}

async function roundCounts(db: DB, gameId: string, round: Round) {
  const active = await db.select({ id: players.id }).from(players).where(and(eq(players.gameId, gameId), eq(players.active, true)));
  const excluded = new Set(round.excludedPlayerIds);
  const eligibleIds = active.map((p) => p.id).filter((id) => !excluded.has(id));
  if (!eligibleIds.length) return { eligibleCount: 0, answeredCount: 0 };
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guesses)
    .where(and(eq(guesses.roundId, round.id), inArray(guesses.playerId, eligibleIds)));
  return { eligibleCount: eligibleIds.length, answeredCount: n };
}

export async function getResults(db: DB, code: string) {
  const { game } = await loadGameWithClock(db, code);
  if (game.phase !== "FINISHED") throw new ApiError("WRONG_PHASE", "Results are available when the game ends.");
  return { code: game.code, title: game.title, standings: await computeStandings(db, game.id) };
}
