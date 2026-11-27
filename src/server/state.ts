import { and, asc, eq, sql } from "drizzle-orm";
import type { BonusDifficulty } from "@/lib/bonus";
import type { DB } from "@/db/client";
import { customQuestions, families, games, guesses, playerPrompts, players, rounds, scoreEvents, type Game, type Player, type Round } from "@/db/schema";
import { displayKey } from "@/lib/crypto";
import type { GameStateDTO, RoundDTO, StandingDTO, View } from "@/lib/dto";
import { ApiError } from "@/lib/errors";
import { rankStandings, remainingActiveMs } from "@/lib/scoring";
import { parseSettings } from "@/lib/settings";
import { tick } from "./engine";
import { rosterFor } from "./lobby";
import { computeStats } from "./stats";
import { sloganFor } from "@/lib/slogans";

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
      piece: players.piece,
      points: sql<number>`coalesce(sum(${scoreEvents.points}) filter (where ${rounds.status} = 'REVEALED'), 0)::int`,
      correct: sql<number>`count(*) filter (where ${scoreEvents.isCorrect} and ${rounds.status} = 'REVEALED')::int`,
      eligible: sql<number>`count(${scoreEvents.id}) filter (where ${rounds.status} = 'REVEALED')::int`,
    })
    .from(players)
    .leftJoin(scoreEvents, eq(scoreEvents.playerId, players.id))
    .leftJoin(rounds, eq(rounds.id, scoreEvents.roundId))
    .where(and(eq(players.gameId, gameId), includeInactive ? undefined : eq(players.active, true)))
    .groupBy(players.id, players.displayName, players.piece);
  return rankStandings(rows);
}

/**
 * "Question 3 of 24". Bonus rounds don't count: a bonus round gets the number of the regular
 * question before it, and the TV shows "Bonus question" instead.
 */
function roundNumbering(all: { id: string; ordinal: number; status: Round["status"]; kind: string }[], currentId: string) {
  const live = all.filter((r) => r.status !== "VOID" && r.status !== "RESERVE").sort((a, b) => a.ordinal - b.ordinal);
  const counted = live.filter((r) => r.kind !== "bonus");
  const cur = all.find((r) => r.id === currentId);
  if (cur?.kind === "bonus") return { number: counted.filter((r) => r.ordinal < cur.ordinal).length, total: counted.length };
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
    ((game.phase === "QUESTION" || game.phase === "REVEAL" || game.phase === "LEADERBOARD") &&
      (settings0.autoReveal || settings0.autoNext || (auth.demoTools && auth.view !== "player"))) ||
    // Autoplay starts the first question by itself.
    (game.phase === "PREPARING" && settings0.autoNext);
  if (needsTick && (game.currentRoundId || game.phase === "PREPARING")) {
    const round = game.currentRoundId ? ((await db.select().from(rounds).where(eq(rounds.id, game.currentRoundId)))[0] ?? null) : null;
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
  const [fam] = await db.select({ name: families.name }).from(families).where(eq(families.id, game.familyId));
  const activePlayers = await db
    .select({
      id: players.id,
      name: players.displayName,
      readyAt: players.readyAt,
      piece: players.piece,
      winSlogan: players.winSlogan,
      loseSlogan: players.loseSlogan,
      awayAt: players.awayAt,
    })
    .from(players)
    .where(and(eq(players.gameId, game.id), eq(players.active, true)))
    .orderBy(asc(players.joinedAt));
  const sloganOf = new Map(
    activePlayers.map((p) => [p.id, { win: sloganFor(p.id, "win", p.winSlogan), lose: sloganFor(p.id, "lose", p.loseSlogan) }]),
  );

  const state: GameStateDTO = {
    code: game.code,
    title: game.title,
    familyName: fam?.name ?? "",
    theme: settings.theme,
    music: settings.music,
    taunts: settings.taunts,
    shameSpotlight: settings.shameSpotlight,
    mode: settings.mode,
    autoplay: settings.autoNext,
    // Paused between questions (getting ready, reveal, leaderboard); questions pause on the round.
    paused: Boolean(game.pausedAt),
    phaseStartedAt: game.phaseStartedAt?.toISOString() ?? null,
    sound: settings.sound,
    animations: settings.animations,
    voice: settings.voice,
    boards: settings.boards,
    countdownSeconds: settings.countdownSeconds,
    phase: game.phase,
    version: game.version,
    serverNow: now.toISOString(),
    rosterLocked: Boolean(game.rosterLockedAt),
    settings: {
      questionSeconds: settings.questionSeconds,
      speedBonus: settings.speedBonus,
      autoReveal: settings.autoReveal,
      overtimeSeconds: settings.overtimeSeconds,
      autoNext: settings.autoNext,
      revealSeconds: settings.revealSeconds,
      roundCount: settings.roundCount,
      perPlayer: settings.perPlayer ?? null,
      plannedPlayers: settings.plannedPlayers ?? null,
      fastestBonus: settings.fastestBonus,
      bonusQuestions: settings.bonusQuestions,
      bonusCount: settings.bonusCount ?? null,
      pieceGroups: settings.pieceGroups,
      questionGroups: settings.questionGroups,
      speedQuestions: settings.speedQuestions,
      speedCount: settings.speedCount ?? null,
      speedSeconds: settings.speedSeconds,
      autoAway: settings.autoAway,
      leaderboardPageSeconds: settings.leaderboardPageSeconds,
      pickedPrompts: settings.promptIds.length,
      pickedQuestions: settings.questionIds.length,
    },
    counts: { players: activePlayers.length, ready: activePlayers.filter((p) => p.readyAt).length },
    lobby: null,
    players: null,
    stats: null,
    round: null,
    reveal: null,
    standings: null,
    me: null,
    host: null,
    canControl: auth.isHost,
  };

  if (game.phase === "LOBBY" || game.phase === "PREPARING") {
    state.lobby = activePlayers.map((p) => ({ id: p.id, name: p.name, ready: Boolean(p.readyAt), piece: p.piece, away: Boolean(p.awayAt) }));
  }
  const privileged = auth.view !== "player";
  if (privileged) {
    state.players = activePlayers.map((p) => ({
      away: Boolean(p.awayAt),
      id: p.id,
      name: p.name,
      ready: Boolean(p.readyAt),
      piece: p.piece,
      winSlogan: sloganOf.get(p.id)!.win,
      loseSlogan: sloganOf.get(p.id)!.lose,
    }));
  }

  const me = auth.view === "player" ? auth.player : null;
  let round: Round | null = null;
  if ((game.phase === "QUESTION" || game.phase === "REVEAL" || game.phase === "LEADERBOARD") && game.currentRoundId) {
    round = (await db.select().from(rounds).where(and(eq(rounds.id, game.currentRoundId), eq(rounds.gameId, game.id))))[0] ?? null;
  }

  if (round) {
    const all = await db
      .select({ id: rounds.id, ordinal: rounds.ordinal, status: rounds.status, kind: rounds.kind })
      .from(rounds)
      .where(eq(rounds.gameId, game.id));
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
      opensAt: round.openedAt?.toISOString() ?? null,
      paused: Boolean(round.pausedAt),
      remainingMs: round.status === "OPEN" ? Math.min(round.durationMs, remainingActiveMs(round, now)) : 0,
      answeredCount,
      eligibleCount,
      kind: round.kind as RoundDTO["kind"],
      difficulty: (round.bonusDifficulty as BonusDifficulty | null) ?? null,
      bonus:
        round.kind === "bonus" && round.bonusPoints
          ? { difficulty: (round.bonusDifficulty ?? "medium") as BonusDifficulty, points: round.bonusPoints, ordinal: round.ordinal }
          : null,
    };
    if (privileged) {
      // Which bank question this is (e.g. "q001"), so the TV can play the announcer's clip.
      if (round.bonusQuestionId) dto.promptId = round.bonusQuestionId;
      else if (round.customQuestionId) {
        // Uploaded questions: their audio id (questions/<id>.mp3), if a clip was recorded.
        const [cq] = await db.select({ audioId: customQuestions.audioId }).from(customQuestions).where(eq(customQuestions.id, round.customQuestionId));
        dto.promptId = cq?.audioId ?? null;
      }
      else if (round.sourcePlayerPromptId) {
        const [src] = await db
          .select({ promptId: playerPrompts.promptId })
          .from(playerPrompts)
          .where(eq(playerPrompts.id, round.sourcePlayerPromptId));
        dto.promptId = src?.promptId ?? null;
      } else dto.promptId = null;
      // Ordered by lock-in time so the TV can show 1st, 2nd, 3rd…
      const locked = await db
        .select({ playerId: guesses.playerId })
        .from(guesses)
        .where(eq(guesses.roundId, round.id))
        .orderBy(asc(guesses.submittedAt), asc(guesses.id));
      dto.lockedPlayerIds = locked.map((l) => l.playerId);
      dto.subjectPlayerId = round.subjectPlayerId ?? undefined;
    }
    state.round = dto;

    if ((game.phase === "REVEAL" || game.phase === "LEADERBOARD") && round.status === "REVEALED") {
      const roundGuesses = await db
        .select({
          playerId: guesses.playerId,
          optionId: guesses.optionId,
          elapsedMs: guesses.elapsedMs,
          name: players.displayName,
          piece: players.piece,
        })
        .from(guesses)
        .innerJoin(players, eq(players.id, guesses.playerId))
        .where(and(eq(guesses.roundId, round.id), eq(players.active, true)));
      const distribution: Record<string, number> = {};
      for (const o of round.options) distribution[o.id] = 0;
      for (const g of roundGuesses) distribution[g.optionId] = (distribution[g.optionId] ?? 0) + 1;
      const [subject] = round.subjectPlayerId
        ? await db.select({ name: players.displayName, piece: players.piece }).from(players).where(eq(players.id, round.subjectPlayerId))
        : [];
      const g2 = roundGuesses.map((g) => ({ ...g, correct: g.optionId === round!.correctOptionId }));
      const right = g2.filter((g) => g.correct).sort((a, b) => a.elapsedMs - b.elapsedMs);
      const eligibleNow = activePlayers.filter(
        (p) => !round!.excludedPlayerIds.includes(p.id) && (!p.awayAt || g2.some((g) => g.playerId === p.id)),
      );
      const guessed = new Set(g2.map((g) => g.playerId));
      // There is always a loser: no answer counts as the slowest wrong answer; among wrong
      // answers the slowest loses; if everyone was right, the slowest right answer loses.
      const wrongOrMissed = [
        ...g2
          .filter((g) => !g.correct)
          .map((g) => ({ playerId: g.playerId, name: g.name, piece: g.piece, elapsedMs: g.elapsedMs, reason: "wrong" as const })),
        ...eligibleNow
          .filter((p) => !guessed.has(p.id))
          .map((p) => ({ playerId: p.id, name: p.name, piece: p.piece, elapsedMs: round!.durationMs, reason: "missed" as const })),
      ].sort((a, b) => b.elapsedMs - a.elapsedMs);
      const slowestRight = right.length > 1 ? right[right.length - 1] : null;
      const loser = wrongOrMissed[0] ?? (slowestRight ? { ...slowestRight, reason: "slowest" as const } : null);
      state.reveal = {
        correctOptionId: round.correctOptionId,
        answerText: round.answerText,
        subjectName: subject?.name ?? "",
        subjectPiece: subject?.piece ?? null,
        distribution,
        guesses: g2.sort((a, b) => a.name.localeCompare(b.name)),
        roundStats: {
          correct: right.length,
          answered: g2.length,
          eligible: eligibleNow.length,
          winner: right[0]
            ? { name: right[0].name, piece: right[0].piece, elapsedMs: right[0].elapsedMs, slogan: sloganOf.get(right[0].playerId)?.win ?? "" }
            : null,
          loser: loser
            ? {
                name: loser.name,
                piece: loser.piece,
                reason: loser.reason,
                elapsedMs: loser.elapsedMs,
                slogan: sloganOf.get(loser.playerId)?.lose ?? "",
              }
            : null,
        },
      };
    }
  }

  const showStandings = game.phase === "REVEAL" || game.phase === "LEADERBOARD" || game.phase === "FINISHED";
  let standings: StandingDTO[] | null = null;
  if (showStandings || me) standings = await computeStandings(db, game.id);
  if (showStandings && standings && round && round.status === "REVEALED") {
    const evs = await db
      .select({ playerId: scoreEvents.playerId, points: scoreEvents.points })
      .from(scoreEvents)
      .where(eq(scoreEvents.roundId, round.id));
    const pts = new Map(evs.map((e) => [e.playerId, e.points]));
    standings = standings.map((s) => ({ ...s, lastRound: pts.has(s.playerId) ? pts.get(s.playerId)! : null }));
  }
  if (showStandings && standings) {
    state.standings = auth.view === "player" ? standings.slice(0, 5) : standings;
    if (privileged || game.phase === "FINISHED") state.stats = await computeStats(db, game.id, standings);
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
      if ((game.phase === "REVEAL" || game.phase === "LEADERBOARD") && round.status === "REVEALED") {
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
      slogans: {
        win: sloganFor(me.id, "win", me.winSlogan),
        lose: sloganFor(me.id, "lose", me.loseSlogan),
        customWin: Boolean(me.winSlogan),
        customLose: Boolean(me.loseSlogan),
      },
      piece: me.piece,
      active: me.active,
      ready: Boolean(me.readyAt),
      eligible: me.active && !isSubject,
      away: Boolean(me.awayAt),
      awayReason: me.awayAt ? ((me.awayReason as "self" | "auto" | null) ?? "self") : null,
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

/** Who this question waits for: everyone playing, minus its subject and anyone away who hasn't answered. */
async function roundCounts(db: DB, gameId: string, round: Round) {
  const active = await db
    .select({ id: players.id, awayAt: players.awayAt })
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.active, true)));
  const excluded = new Set(round.excludedPlayerIds);
  const guessed = new Set(
    (await db.select({ playerId: guesses.playerId }).from(guesses).where(eq(guesses.roundId, round.id))).map((g) => g.playerId),
  );
  const eligible = active.filter((p) => !excluded.has(p.id) && (!p.awayAt || guessed.has(p.id)));
  return { eligibleCount: eligible.length, answeredCount: eligible.filter((p) => guessed.has(p.id)).length };
}

export async function getResults(db: DB, code: string) {
  const { game } = await loadGameWithClock(db, code);
  if (game.phase !== "FINISHED") throw new ApiError("WRONG_PHASE", "Results are available when the game ends.");
  return { code: game.code, title: game.title, standings: await computeStandings(db, game.id) };
}
