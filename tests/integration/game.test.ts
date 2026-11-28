import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/client";
import { bonusQuestions, guesses, playerPrompts, players, prompts, rounds, scoreEvents, type Player } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { performAction, startGame, submitGuess } from "@/server/engine";
import { previewRounds } from "@/server/engine";
import {
  getOrCreateFamily,
  joinInfo,
  listFamilies,
  listGames,
  createGame,
  findGame,
  getQuestionnaire,
  joinGame,
  removePlayer,
  replacePrompt,
  saveAnswers,
  setReady,
  setSlogans,
  setAway,
  updateSettings,
} from "@/server/lobby";
import { getGameState, type StateAuth } from "@/server/state";
import { listQuestionGroups, questionAudioList, uploadQuestions, deleteQuestionGroup } from "@/server/questions";
import { customQuestions } from "@/db/schema";
import { decodePhoto, getPhoto, removePhoto, setPhoto, setPhotoBody } from "@/server/photos";
import { readFileSync } from "node:fs";
import { closeTestDb, resetGames, testDb } from "../support/db";
import { createPack, deletePack } from "@/server/packs";
import { mashPiece } from "@/lib/mash";

let db: DB;

beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => {
  await closeTestDb();
});
beforeEach(async () => {
  await resetGames(db);
});

// Fictional sample answers.
const SAMPLE = ["Lasagna", "Tacos", "Ramen", "Pancakes", "Curry", "Dumplings", "Gumbo", "Paella"];

async function expectApiError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);
}

async function fillAndReady(code: string, player: Player, i: number) {
  const game = await findGame(db, code);
  const items = await getQuestionnaire(db, player);
  await saveAnswers(
    db,
    game,
    player,
    items.map((it) => ({ slot: it.slot, answer: `${SAMPLE[(i + it.slot) % SAMPLE.length]} ${it.slot}${i}` })),
  );
  await setReady(db, game, player, true);
}

async function setupGame(n: number, settings: Record<string, unknown> = {}) {
  const game = await createGame(db, { title: "Test", settings: { roundCount: 6, countdownSeconds: 0, bonusQuestions: false, autoNext: false, ...settings } });
  const ps: { player: Player; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const r = await joinGame(db, game.code, `Player ${i + 1}`, null);
    ps.push({ player: r.player, token: r.token! });
    await fillAndReady(game.code, r.player, i);
  }
  return { game, ps };
}

function auth(view: StateAuth["view"], player: Player | null = null): StateAuth {
  return { view, player, isHost: view === "host", secret: process.env.SESSION_SECRET!, demoTools: false, aiAvailable: false };
}

async function current(code: string) {
  const g = await findGame(db, code);
  const [r] = await db.select().from(rounds).where(eq(rounds.id, g.currentRoundId!));
  return { g, r };
}

async function refreshPlayer(id: string) {
  return (await db.select().from(players).where(eq(players.id, id)))[0];
}

describe("joining", () => {
  it("rejects unknown codes and duplicate names case-insensitively", async () => {
    await expectApiError(joinGame(db, "ZZZZZZ", "Ann", null), "GAME_NOT_FOUND");
    const game = await createGame(db, {});
    await joinGame(db, game.code, "Grandma Jo", null);
    await expectApiError(joinGame(db, game.code, "  grandma   JO ", null), "NAME_TAKEN");
  });

  it("assigns 4 common + 4 unique random prompts", async () => {
    const game = await createGame(db, {});
    const { player } = await joinGame(db, game.code, "Ann", null);
    const items = await getQuestionnaire(db, player);
    expect(items).toHaveLength(8);
    expect(new Set(items.map((i) => i.promptId)).size).toBe(8);
    expect(items.slice(0, 4).map((i) => i.promptId)).toEqual(["q001", "q002", "q017", "q053"]);
    expect(items.every((i) => i.options.length === 6)).toBe(true);
    // Classic theme: no seasonal (Thanksgiving/Christmas) questions.
    expect(items.some((i) => ["q010", "q079", "q080", "q084"].includes(i.promptId))).toBe(false);
  });

  it("reconnects an existing player by token instead of creating a new one", async () => {
    const game = await createGame(db, {});
    const first = await joinGame(db, game.code, "Ann", null);
    const again = await joinGame(db, game.code, "Different", first.token);
    expect(again.reconnected).toBe(true);
    expect(again.player.id).toBe(first.player.id);
  });

  it("enforces expiration on reads", async () => {
    const game = await createGame(db, {});
    await db.execute(sql`update games set expires_at = now() - interval '1 minute' where id = ${game.id}`);
    await expectApiError(findGame(db, game.code), "GAME_NOT_FOUND");
    await expectApiError(joinGame(db, game.code, "Late", null), "GAME_NOT_FOUND");
  });
});

describe("questionnaire and roster", () => {
  it("saves a picked option as its exact text, and rejects options from other questions", async () => {
    const game = await createGame(db, {});
    const { player } = await joinGame(db, game.code, "Ann", null);
    const items = await getQuestionnaire(db, player);
    const opt = items[0].options[4];
    const after = await saveAnswers(db, game, player, [{ slot: 1, optionId: opt.id }]);
    expect(after[0]).toMatchObject({ answer: opt.text, optionId: opt.id });
    await expectApiError(saveAnswers(db, game, player, [{ slot: 1, optionId: items[1].options[0].id }]), "VALIDATION");
    // Typing an option's exact text counts as picking it.
    const typed = await saveAnswers(db, game, player, [{ slot: 2, answer: items[1].options[2].text.toUpperCase() }]);
    expect(typed[1].optionId).toBe(items[1].options[2].id);
  });

  it("plays a full round from picked options, with options from the bank as wrong choices", async () => {
    const game = await createGame(db, { settings: { roundCount: 4, bonusQuestions: false } });
    const ps: Player[] = [];
    for (const name of ["Ann", "Ben", "Cal"]) {
      const { player } = await joinGame(db, game.code, name, null);
      const items = await getQuestionnaire(db, player);
      await saveAnswers(db, game, player, items.map((it, k) => ({ slot: it.slot, optionId: it.options[(k + ps.length) % 6].id })));
      await setReady(db, game, player, true);
      ps.push(player);
    }
    await startGame(db, game.id, { excludeUnready: false });
    const planned = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    expect(planned.filter((r) => r.status === "PENDING")).toHaveLength(4);
    for (const r of planned) {
      expect(r.questionText).toMatch(/^How did (Ann|Ben|Cal) answer: “/);
      expect(r.options.find((o) => o.id === r.correctOptionId)?.label.toLowerCase()).toBe(r.answerText.toLowerCase());
    }
  });

  it("hands out Thanksgiving questions only in Thanksgiving games", async () => {
    const game = await createGame(db, { settings: { theme: "thanksgiving" } });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const { player } = await joinGame(db, game.code, `Guest ${i}`, null);
      for (const it of await getQuestionnaire(db, player)) seen.add(it.promptId);
    }
    expect(seen.has("q080")).toBe(false); // Christmas never appears in a Thanksgiving game
  });

  it("requires eight answers before ready, and allows replacing a prompt", async () => {
    const game = await createGame(db, {});
    const { player } = await joinGame(db, game.code, "Ann", null);
    await saveAnswers(db, game, player, [{ slot: 1, answer: "Pizza" }]);
    await expectApiError(setReady(db, game, player, true), "NOT_READY");
    const before = await getQuestionnaire(db, player);
    const after = await replacePrompt(db, game, player, 6);
    expect(after[5].promptId).not.toBe(before[5].promptId);
    expect(new Set(after.map((a) => a.promptId)).size).toBe(8);
    await expectApiError(saveAnswers(db, game, player, [{ slot: 2, answer: "x".repeat(121) }]), "VALIDATION");
  });

  it("needs 3 ready players and explicit confirmation to exclude unready players", async () => {
    const { game } = await setupGame(2);
    const late = await joinGame(db, game.code, "Late Larry", null);
    await expectApiError(startGame(db, game.id, { excludeUnready: false }), "NOT_ENOUGH_PLAYERS");
    await fillAndReady(game.code, late.player, 9);
    const extra = await joinGame(db, game.code, "Unready Una", null);
    await expectApiError(startGame(db, game.id, { excludeUnready: false }), "UNREADY_PLAYERS");
    await startGame(db, game.id, { excludeUnready: true });
    expect((await refreshPlayer(extra.player.id)).active).toBe(false);
    const g = await findGame(db, game.code);
    expect(g.phase).toBe("PREPARING");
    // Roster is locked: no new joins, no removals, no answer edits.
    await expectApiError(joinGame(db, game.code, "Newcomer", null), "GAME_CLOSED");
    await expectApiError(removePlayer(db, game.code, late.player.id), "WRONG_PHASE");
    await expectApiError(saveAnswers(db, g, late.player, [{ slot: 1, answer: "Changed" }]), "WRONG_PHASE");
  });
});

describe("game loop", () => {
  it("plays a round: guess, reveal, score once, next", async () => {
    const { game, ps } = await setupGame(4);
    await startGame(db, game.id, { excludeUnready: false });
    let g = await findGame(db, game.code);
    const planned = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    expect(planned.filter((r) => r.status === "PENDING")).toHaveLength(6);
    for (const r of planned) {
      expect(r.options).toHaveLength(4);
      expect(r.options.filter((o) => o.id === r.correctOptionId)).toHaveLength(1);
    }

    await performAction(db, game.id, "open", g.version);
    const { r } = await current(game.code);
    const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    const subject = ps.find((p) => p.player.id === r.subjectPlayerId)!;
    const wrong = r.options.find((o) => o.id !== r.correctOptionId)!;

    // Subject sits out.
    await expectApiError(submitGuess(db, game.id, subject.player, r.id, r.correctOptionId), "NOT_ELIGIBLE");

    // Player view during the question must not leak the correct answer.
    const pv = await getGameState(db, game.code, auth("player", guessers[0].player));
    expect(pv.reveal).toBeNull();
    expect(pv.standings).toBeNull();
    expect(JSON.stringify(pv)).not.toContain("correctOptionId");
    expect(JSON.stringify(pv)).not.toContain("answerText");
    if (r.type === "WHAT_ANSWER") expect(pv.round?.clue).toBeNull();

    await submitGuess(db, game.id, guessers[0].player, r.id, r.correctOptionId);
    // Same option again is idempotent; a different option is rejected (first wins).
    await submitGuess(db, game.id, guessers[0].player, r.id, r.correctOptionId);
    await expectApiError(submitGuess(db, game.id, guessers[0].player, r.id, wrong.id), "ALREADY_LOCKED");
    await submitGuess(db, game.id, guessers[1].player, r.id, wrong.id);

    g = await findGame(db, game.code);
    // Two hosts press reveal at once: exactly one wins, the other is a no-op.
    const results = await Promise.all([
      performAction(db, game.id, "reveal", g.version),
      performAction(db, game.id, "reveal", g.version),
    ]);
    expect(results.filter((x) => x.noop)).toHaveLength(1);

    const events = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    expect(events).toHaveLength(3); // eligible = 4 players - subject
    // The only right answer is also the fastest, so it gets the 25–50 bonus.
    const won = events.find((e) => e.playerId === guessers[0].player.id)!.points;
    expect(won).toBeGreaterThanOrEqual(1025);
    expect(won).toBeLessThanOrEqual(1050);
    expect(events.find((e) => e.playerId === guessers[1].player.id)?.points).toBe(0);
    expect(events.find((e) => e.playerId === guessers[2].player.id)?.points).toBe(0);

    // Late guess after reveal is rejected.
    await expectApiError(submitGuess(db, game.id, guessers[2].player, r.id, r.correctOptionId), "WRONG_PHASE");

    const dv = await getGameState(db, game.code, auth("display"));
    expect(dv.reveal?.correctOptionId).toBe(r.correctOptionId);
    expect(dv.reveal?.guesses).toHaveLength(2);
    expect(dv.standings?.[0].points).toBe(won);

    const me = await getGameState(db, game.code, auth("player", guessers[0].player));
    expect(me.me?.lastResult).toEqual({ correct: true, points: won, answered: true });
    // After the reveal, phones can see how everyone answered.
    expect(me.reveal?.guesses).toHaveLength(2);
    expect(me.reveal?.roundStats.correct).toBe(1);
    expect(me.reveal?.roundStats.winner?.name).toBe(guessers[0].player.displayName);
    // There is always a loser: the slowest wrong answer, or a non-answer (counted as slowest).
    expect(me.reveal?.roundStats.loser?.reason).toBe("missed");
    expect(me.reveal?.roundStats.loser?.name).toBe(guessers[2].player.displayName);

    g = await findGame(db, game.code);
    await performAction(db, game.id, "next", g.version);
    // Reveal -> full-screen leaderboard -> next question.
    expect((await findGame(db, game.code)).phase).toBe("LEADERBOARD");
    const lb = await getGameState(db, game.code, auth("display"));
    expect(lb.standings?.find((x) => x.playerId === guessers[0].player.id)?.lastRound).toBe(won);
    // A stale "next" (same old version) is a no-op, not a double advance.
    const stale = await performAction(db, game.id, "next", g.version);
    expect(stale.noop).toBe(true);
    expect((await findGame(db, game.code)).phase).toBe("LEADERBOARD");
    await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
    expect((await findGame(db, game.code)).phase).toBe("QUESTION");
  });

  it("holds answers during the 5-4-3-2-1 countdown and starts the timer after it", async () => {
    const { game, ps } = await setupGame(4, { countdownSeconds: 5 });
    await startGame(db, game.id, { excludeUnready: false });
    const g = await findGame(db, game.code);
    await performAction(db, game.id, "open", g.version);
    const { r } = await current(game.code);
    const guesser = ps.find((p) => p.player.id !== r.subjectPlayerId)!;
    expect(r.openedAt!.getTime() - Date.now()).toBeGreaterThan(3000);
    expect(r.deadlineAt!.getTime() - r.openedAt!.getTime()).toBe(r.durationMs);
    await expectApiError(submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId), "WRONG_PHASE");
    const view = await getGameState(db, game.code, auth("player", guesser.player));
    expect(view.round!.opensAt).toBe(r.openedAt!.toISOString());
    expect(view.round!.remainingMs).toBeLessThanOrEqual(r.durationMs);
    // Once the countdown is over, answers count from zero.
    await db.update(rounds).set({ openedAt: new Date(Date.now() - 1000), deadlineAt: new Date(Date.now() - 1000 + r.durationMs) }).where(eq(rounds.id, r.id));
    await submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId);
  });

  it("shows each player's catchphrase on the TV when they win or lose a round", async () => {
    const { game, ps } = await setupGame(4);
    const g0 = await findGame(db, game.code);
    for (const p of ps) await setSlogans(db, g0, p.player, { win: `${p.player.displayName} rules!`, lose: `${p.player.displayName} was robbed` });
    await expectApiError(setSlogans(db, g0, ps[0].player, { win: "x".repeat(41) }), "VALIDATION");
    // Players see their own; empty resets to a picked-for-you one.
    await setSlogans(db, g0, ps[3].player, { lose: "" });
    const mine = await getGameState(db, game.code, auth("player", await refreshPlayer(ps[3].player.id)));
    expect(mine.me!.slogans.customLose).toBe(false);
    expect(mine.me!.slogans.lose.length).toBeGreaterThan(0);

    await startGame(db, game.id, { excludeUnready: false });
    let g = await findGame(db, game.code);
    await performAction(db, game.id, "open", g.version);
    const { r } = await current(game.code);
    const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    const wrong = r.options.find((o) => o.id !== r.correctOptionId)!;
    await submitGuess(db, game.id, guessers[0].player, r.id, r.correctOptionId);
    await submitGuess(db, game.id, guessers[1].player, r.id, wrong.id);
    await submitGuess(db, game.id, guessers[2].player, r.id, wrong.id);
    g = await findGame(db, game.code);
    await performAction(db, game.id, "reveal", g.version);
    const tv = await getGameState(db, game.code, auth("display"));
    const rs = tv.reveal!.roundStats;
    expect(rs.winner!.slogan).toBe(`${guessers[0].player.displayName} rules!`);
    expect(rs.loser!.slogan).toBe(tv.players!.find((p) => p.name === rs.loser!.name)!.loseSlogan);
    expect(tv.players!.find((p) => p.id === guessers[0].player.id)!.winSlogan).toBe(`${guessers[0].player.displayName} rules!`);
  });

  it("accepts late answers after the timer (for shaming), scored without a speed bonus", async () => {
    const { game, ps } = await setupGame(3, { speedBonus: 500 });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    await db.update(rounds).set({ deadlineAt: sql`now() - interval '4 seconds'` }).where(eq(rounds.id, r.id));
    const guesser = ps.find((p) => p.player.id !== r.subjectPlayerId)!;
    await submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId);
    const [g] = await db.select().from(guesses).where(eq(guesses.roundId, r.id));
    expect(g.elapsedMs).toBeGreaterThan(r.durationMs);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const [ev] = await db.select().from(scoreEvents).where(and(eq(scoreEvents.roundId, r.id), eq(scoreEvents.playerId, guesser.player.id)));
    expect(ev.points).toBe(1000);
    // After the reveal, late is too late.
    const other = ps.find((p) => p.player.id !== r.subjectPlayerId && p.player.id !== guesser.player.id)!;
    await expectApiError(submitGuess(db, game.id, other.player, r.id, r.correctOptionId), "WRONG_PHASE");
  });

  it("auto reveal waits the chosen grace period (+2s here) for late answers once time runs out", async () => {
    const { game, ps } = await setupGame(3, { autoReveal: true, overtimeSeconds: 2 });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    const guesser = ps.find((p) => p.player.id !== r.subjectPlayerId)!;
    await submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId);
    await db.update(rounds).set({ deadlineAt: sql`now() - interval '1 second'` }).where(eq(rounds.id, r.id));
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("QUESTION");
    await db.update(rounds).set({ deadlineAt: sql`now() - interval '3 seconds'` }).where(eq(rounds.id, r.id));
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL");
  });

  it("pause preserves remaining time and blocks guesses", async () => {
    const { game, ps } = await setupGame(3);
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    await performAction(db, game.id, "pause", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    expect(r.pausedAt).not.toBeNull();
    expect(r.remainingMs).toBeGreaterThan(15000);
    const guesser = ps.find((p) => p.player.id !== r.subjectPlayerId)!;
    await expectApiError(submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId), "PAUSED");
    await performAction(db, game.id, "resume", (await findGame(db, game.code)).version);
    const after = await current(game.code);
    expect(after.r.pausedAt).toBeNull();
    const left = after.r.deadlineAt!.getTime() - Date.now();
    expect(left).toBeGreaterThan(14000);
    await submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId);
  });

  it("skip voids the round, awards nothing and pulls in a reserve", async () => {
    const { game } = await setupGame(4);
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    await performAction(db, game.id, "skip", (await findGame(db, game.code)).version);
    const [voided] = await db.select().from(rounds).where(eq(rounds.id, r.id));
    expect(voided.status).toBe("VOID");
    const all = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    expect(all.filter((x) => x.status === "PENDING" || x.status === "OPEN")).toHaveLength(6);
    const state = await getGameState(db, game.code, auth("display"));
    expect(state.round?.number).toBe(1);
    expect(state.round?.total).toBe(6);
  });

  it("auto-reveals once everyone eligible has answered, and auto-advances after the reveal pause", async () => {
    const { game, ps } = await setupGame(3, { autoReveal: true, autoNext: true, revealSeconds: 3, shameSpotlight: false });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    for (const p of ps) {
      if (p.player.id !== r.subjectPlayerId) await submitGuess(db, game.id, p.player, r.id, r.correctOptionId);
    }
    const s1 = await getGameState(db, game.code, auth("display"));
    expect(s1.phase).toBe("REVEAL");
    // Not yet due.
    const s2 = await getGameState(db, game.code, auth("display"));
    expect(s2.phase).toBe("REVEAL");
    await db.execute(sql`update games set phase_started_at = now() - interval '10 seconds' where id = ${game.id}`);
    const s3 = await getGameState(db, game.code, auth("display"));
    expect(s3.phase).toBe("LEADERBOARD");
    // The leaderboard stays up one page-time (5s) per chosen page (4 by default).
    await db.execute(sql`update games set phase_started_at = now() - interval '15 seconds' where id = ${game.id}`);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("LEADERBOARD");
    await db.execute(sql`update games set phase_started_at = now() - interval '21 seconds' where id = ${game.id}`);
    const s4 = await getGameState(db, game.code, auth("display"));
    expect(s4.phase).toBe("QUESTION");
    expect(s4.round?.number).toBe(2);
  });

  it("end game finishes and standings share ranks on ties", async () => {
    const { game, ps } = await setupGame(3);
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    await performAction(db, game.id, "end", (await findGame(db, game.code)).version);
    const s = await getGameState(db, game.code, auth("display"));
    expect(s.phase).toBe("FINISHED");
    expect(s.standings).toHaveLength(3);
    expect(s.standings!.every((x) => x.rank === 1 && x.points === 0)).toBe(true);
    expect(ps).toHaveLength(3);
  });

  it("isolates games: a player from game A cannot guess in game B", async () => {
    const a = await setupGame(3);
    const b = await setupGame(3);
    await startGame(db, b.game.id, { excludeUnready: false });
    await performAction(db, b.game.id, "open", (await findGame(db, b.game.code)).version);
    const { r } = await current(b.game.code);
    await expectApiError(submitGuess(db, b.game.id, a.ps[0].player, r.id, r.correctOptionId), "NOT_ELIGIBLE");
    await expectApiError(
      getGameState(db, b.game.code, auth("player", a.ps[0].player)),
      "UNAUTHENTICATED",
    );
  });

  it("handles 25 simultaneous guesses consistently", async () => {
    const { game, ps } = await setupGame(25, { roundCount: 3 });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    const eligible = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    await Promise.all(eligible.map((p) => submitGuess(db, game.id, p.player, r.id, r.correctOptionId)));
    const n = await db.select().from(guesses).where(eq(guesses.roundId, r.id));
    expect(n).toHaveLength(24);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const ev = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    // Everyone right; exactly the fastest (or an exact tie) gets the bonus on top of 1,000.
    expect(ev.every((e) => e.points >= 1000 && e.points <= 1050)).toBe(true);
    const fastest = Math.min(...n.map((g) => g.elapsedMs));
    const fastIds = new Set(n.filter((g) => g.elapsedMs === fastest).map((g) => g.playerId));
    expect(ev.filter((e) => e.points > 1000).map((e) => e.playerId).sort()).toEqual([...fastIds].sort());
  });
});

describe("families, pieces, questions per person, stats", () => {
  it("files games under a family (defaulting to Land) and de-duplicates family names", async () => {
    const land = await createGame(db, {});
    const rod = await getOrCreateFamily(db, "The Rodriguez Family");
    expect(rod.name).toBe("Rodriguez");
    expect((await getOrCreateFamily(db, "rodriguez")).id).toBe(rod.id);
    await createGame(db, { familyId: rod.id });
    const list = await listGames(db);
    expect(list.find((g) => g.code === land.code)?.familyName).toBe("Land");
    expect(list.filter((g) => g.familyName === "Rodriguez")).toHaveLength(1);
    const fams = await listFamilies(db);
    expect(fams.map((f) => f.name)).toEqual(expect.arrayContaining(["Land", "Rodriguez"]));
    const state = await getGameState(db, land.code, auth("display"));
    expect(state.familyName).toBe("Land");
  });

  it("gives each player a game piece, and blocks taking someone else's", async () => {
    const game = await createGame(db, {});
    const a = await joinGame(db, game.code, "Ann", null, { piece: "dragon" });
    expect(a.player.piece).toBe("dragon");
    await expectApiError(joinGame(db, game.code, "Ben", null, { piece: "dragon" }), "PIECE_TAKEN");
    const b = await joinGame(db, game.code, "Ben", null);
    expect(b.player.piece).toBeTruthy();
    expect(b.player.piece).not.toBe("dragon");
    const info = await joinInfo(db, game.code);
    expect(info.taken).toEqual(expect.arrayContaining(["dragon", b.player.piece]));
    expect(JSON.stringify(info)).not.toContain("Ann");
  });

  it("starts with N questions per person, never repeating a question", async () => {
    const { game } = await setupGame(6);
    const preview = await previewRounds(db, game);
    expect(preview.readyPlayers).toBe(6);
    expect(preview.maxPerPlayer).toBeGreaterThanOrEqual(2);
    await startGame(db, game.id, { excludeUnready: false, perPlayer: 2 });
    const rs = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    const main = rs.filter((r) => r.status === "PENDING");
    expect(main).toHaveLength(12);
    const per = new Map<string, number>();
    for (const r of main) per.set(r.subjectPlayerId!, (per.get(r.subjectPlayerId!) ?? 0) + 1);
    expect([...per.values()].every((n) => n === 2)).toBe(true);
    // No question (prompt) asked twice, reserves included.
    expect(new Set(rs.map((r) => r.promptText)).size).toBe(rs.length);
    const st = await getGameState(db, game.code, auth("display"));
    expect(st.settings.perPlayer).toBe(2);
  });

  it("shows lock-ins (not choices) during a question, and awards after reveals", async () => {
    const { game, ps } = await setupGame(4, { roundCount: 4, autoAway: false });
    await startGame(db, game.id, { excludeUnready: false });
    for (let q = 0; q < 3; q++) {
      if (q === 0) await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
      const { r } = await current(game.code);
      const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
      await submitGuess(db, game.id, guessers[0].player, r.id, r.correctOptionId);
      await submitGuess(db, game.id, guessers[1].player, r.id, r.options.find((o) => o.id !== r.correctOptionId)!.id);
      const live = await getGameState(db, game.code, auth("display"));
      expect(live.round?.lockedPlayerIds).toHaveLength(2);
      expect(JSON.stringify(live)).not.toContain("correctOptionId");
      const phone = await getGameState(db, game.code, auth("player", guessers[2].player));
      expect(phone.round?.lockedPlayerIds).toBeUndefined();
      await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
      const rv = await getGameState(db, game.code, auth("display"));
      expect(rv.reveal?.roundStats.loser).toBeTruthy();
      expect(rv.stats?.leader.length).toBeGreaterThan(0);
      if (q < 2) {
        await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
        await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
      }
    }
    const end = await getGameState(db, game.code, auth("display"));
    expect(end.stats?.awards.map((a) => a.key)).toEqual(expect.arrayContaining(["knows-best"]));
  });
});

describe("round loser", () => {
  it("is the slowest right answer when everyone got it right", async () => {
    const { game, ps } = await setupGame(4);
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    for (const g of guessers) await submitGuess(db, game.id, g.player, r.id, r.correctOptionId);
    await db.execute(sql`update guesses set elapsed_ms = 9000 where round_id = ${r.id} and player_id = ${guessers[1].player.id}`);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const s = await getGameState(db, game.code, auth("display"));
    expect(s.reveal?.roundStats.loser).toMatchObject({ reason: "slowest", name: guessers[1].player.displayName, elapsedMs: 9000 });
  });
});

describe("player photos", () => {
  const jpeg = "data:image/jpeg;base64," + readFileSync("tests/fixtures/sample-photo.jpg").toString("base64");

  it("rejects things that aren't real images, whatever they claim to be", () => {
    expect(() => decodePhoto("data:image/jpeg;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"))).toThrow();
    expect(() => decodePhoto("data:text/html;base64,PGgxPg==")).toThrow();
    expect(() => decodePhoto("data:image/jpeg;base64," + Buffer.alloc(200_000, 0xff).toString("base64"))).toThrow();
    expect(decodePhoto(jpeg).mime).toBe("image/jpeg");
  });

  it("replaces the game piece, can be removed (piece comes back), and is deleted with the game", async () => {
    const game = await createGame(db, {});
    const { player } = await joinGame(db, game.code, "Ann", null, { piece: "owl" });
    const piece = await setPhoto(db, game, player, jpeg);
    expect(piece).toMatch(new RegExp(`^photo:${player.id}:\\d+:hero$`));
    expect((await refreshPlayer(player.id)).piece).toBe(piece);
    expect((await getPhoto(db, player.id))?.mime).toBe("image/jpeg");
    // The photo doesn't block the owl for others, and the join page never sees photo ids.
    expect((await joinInfo(db, game.code)).taken).not.toContain(piece);
    const lobby = await getGameState(db, game.code, auth("display"));
    expect(lobby.lobby?.[0].piece).toBe(piece);

    // Choosing a costume keeps the same photo.
    const king = await setPhotoBody(db, game, player, "king");
    expect(king).toBe(piece.replace(/:hero$/, ":king"));
    await expect(setPhotoBody(db, game, player, "nope")).rejects.toThrow();

    await removePhoto(db, game.id, player.id);
    expect((await refreshPlayer(player.id)).piece).toBe("owl");
    expect(await getPhoto(db, player.id)).toBeNull();

    await setPhoto(db, game, player, jpeg);
    await db.execute(sql`delete from games where id = ${game.id}`);
    expect(await getPhoto(db, player.id)).toBeNull();
  });
});

describe("bonus questions", () => {
  it("go in the middle of the game, easy to hard, everyone plays and they don't count as numbered questions", async () => {
    const { game, ps } = await setupGame(4, { bonusQuestions: true, autoAway: false });
    await startGame(db, game.id, { excludeUnready: false, perPlayer: 2 });
    const rs = (await db.select().from(rounds).where(eq(rounds.gameId, game.id))).filter((r) => r.status === "PENDING").sort((a, b) => a.ordinal - b.ordinal);
    const bonus = rs.filter((r) => r.bonusQuestionId);
    expect(rs.filter((r) => !r.bonusQuestionId)).toHaveLength(8);
    expect(bonus).toHaveLength(2); // one each time through everyone (2 per person)
    expect(rs[0].bonusQuestionId).toBeNull();
    expect(rs[rs.length - 1].bonusQuestionId).toBeNull();
    const rank = { easy: 0, medium: 1, hard: 2 } as Record<string, number>;
    expect(rank[bonus[0].bonusDifficulty!]).toBeLessThanOrEqual(rank[bonus[1].bonusDifficulty!]);
    for (const b of bonus) {
      expect(b.subjectPlayerId).toBeNull();
      expect(b.excludedPlayerIds).toEqual([]);
      expect(b.options.filter((o) => o.id === b.correctOptionId)).toHaveLength(1);
      expect(new Set(bonus.map((x) => x.bonusQuestionId)).size).toBe(bonus.length);
    }

    // Play through to the first bonus round.
    let g = await findGame(db, game.code);
    await performAction(db, game.id, "open", g.version);
    while ((await current(game.code)).r.bonusQuestionId === null) {
      g = await findGame(db, game.code);
      await performAction(db, game.id, "reveal", g.version);
      g = await findGame(db, game.code);
      await performAction(db, game.id, "next", g.version);
      g = await findGame(db, game.code);
      await performAction(db, game.id, "next", g.version);
    }
    const { r } = await current(game.code);
    const tv = await getGameState(db, game.code, auth("display"));
    expect(tv.round!.bonus).toMatchObject({ difficulty: r.bonusDifficulty, points: r.bonusPoints });
    expect(tv.round!.promptId).toBe(r.bonusQuestionId);
    expect(tv.round!.eligibleCount).toBe(4); // nobody sits out
    expect(tv.round!.total).toBe(8);
    // Everyone can answer; right answers get the bonus points (+ the fastest-answer bonus).
    const wrong = r.options.find((o) => o.id !== r.correctOptionId)!;
    await submitGuess(db, game.id, ps[0].player, r.id, r.correctOptionId);
    await submitGuess(db, game.id, ps[1].player, r.id, r.correctOptionId);
    await submitGuess(db, game.id, ps[2].player, r.id, wrong.id);
    g = await findGame(db, game.code);
    await performAction(db, game.id, "reveal", g.version);
    const ev = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    expect(ev).toHaveLength(4);
    const pts = (i: number) => ev.find((e) => e.playerId === ps[i].player.id)!.points;
    // Paid by place among right answers: fastest 1,500, next 1,200 (no 25–50 speed bonus here).
    expect([pts(0), pts(1)].sort((a, b) => b - a)).toEqual([1500, 1200]);
    expect(pts(2)).toBe(0);
    expect(pts(3)).toBe(0);
    const after = await getGameState(db, game.code, auth("display"));
    expect(after.reveal!.subjectName).toBe("");
    expect(after.stats).not.toBeNull();
  });

  it("can be turned off", async () => {
    const { game } = await setupGame(3, { bonusQuestions: false });
    await startGame(db, game.id, { excludeUnready: false, perPlayer: 2 });
    const rs = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    expect(rs.some((r) => r.bonusQuestionId)).toBe(false);
  });
});

describe("players stepping away", () => {
  it("skips someone who paused themselves; answering brings them back", async () => {
    const { game, ps } = await setupGame(4, { autoReveal: false });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    await setAway(db, await findGame(db, game.code), guessers[2].player, true);
    let tv = await getGameState(db, game.code, auth("display"));
    expect(tv.round!.eligibleCount).toBe(2);
    expect(tv.players!.find((p) => p.id === guessers[2].player.id)!.away).toBe(true);
    const me = await getGameState(db, game.code, auth("player", await refreshPlayer(guessers[2].player.id)));
    expect(me.me).toMatchObject({ away: true, awayReason: "self" });
    await submitGuess(db, game.id, guessers[0].player, r.id, r.correctOptionId);
    await submitGuess(db, game.id, guessers[1].player, r.id, r.correctOptionId);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const ev = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    expect(ev.map((e) => e.playerId)).not.toContain(guessers[2].player.id); // no score, no miss
    // Back by answering the next question.
    await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
    await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
    const { r: r2 } = await current(game.code);
    const back = ps.find((p) => p.player.id === guessers[2].player.id && p.player.id !== r2.subjectPlayerId);
    if (back) {
      await submitGuess(db, game.id, back.player, r2.id, r2.correctOptionId);
      expect((await refreshPlayer(back.player.id)).awayAt).toBeNull();
      tv = await getGameState(db, game.code, auth("display"));
      expect(tv.players!.find((p) => p.id === back.player.id)!.away).toBe(false);
    }
  });

  it("sets aside someone who misses two in a row, and the game stops waiting for them", async () => {
    const { game, ps } = await setupGame(4, { autoReveal: false, roundCount: 8 });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const quiet = ps[3].player;
    for (let q = 0; q < 3; q++) {
      const { r } = await current(game.code);
      for (const p of ps.slice(0, 3)) if (p.player.id !== r.subjectPlayerId) await submitGuess(db, game.id, p.player, r.id, r.correctOptionId);
      await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
      const awayNow = (await refreshPlayer(quiet.id)).awayAt;
      if (awayNow) break;
      await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
      await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
    }
    const p = await refreshPlayer(quiet.id);
    expect(p.awayAt).not.toBeNull();
    expect(p.awayReason).toBe("auto");
    await setAway(db, await findGame(db, game.code), p, false);
    expect((await refreshPlayer(quiet.id)).awayAt).toBeNull();
  });
});

describe("autoplay and pausing between questions", () => {
  it("starts the first question by itself, and pause holds the reveal timer", async () => {
    const { game, ps } = await setupGame(3, { autoNext: true, autoReveal: true });
    await startGame(db, game.id, { excludeUnready: false });
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("PREPARING");
    await db.execute(sql`update games set phase_started_at = now() - interval '7 seconds' where id = ${game.id}`);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("QUESTION");
    const { r } = await current(game.code);
    for (const p of ps) if (p.player.id !== r.subjectPlayerId) await submitGuess(db, game.id, p.player, r.id, r.correctOptionId);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL");
    await performAction(db, game.id, "pause", (await findGame(db, game.code)).version);
    await db.execute(sql`update games set phase_started_at = now() - interval '30 seconds', paused_at = now() - interval '25 seconds' where id = ${game.id}`);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL"); // paused: stays
    await performAction(db, game.id, "resume", (await findGame(db, game.code)).version);
    // 5s had passed before the pause, so 5 more seconds of reveal are left.
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL");
    const g = await findGame(db, game.code);
    expect(Date.now() - g.phaseStartedAt!.getTime()).toBeLessThan(8000);
  });
});

describe("game modes", () => {
  it("Quiz mode plays built-in trivia: everyone ready on join, everyone plays every question", async () => {
    const game = await createGame(db, { title: "Quiz", settings: { mode: "quiz", roundCount: 5, countdownSeconds: 0, autoNext: false, autoReveal: false } });
    const ps: Player[] = [];
    for (let i = 0; i < 3; i++) ps.push((await joinGame(db, game.code, `Quizzer ${i + 1}`, null)).player);
    expect(ps.every((p) => p.readyAt)).toBe(true);
    const preview = await previewRounds(db, await findGame(db, game.code));
    expect(preview).toMatchObject({ mode: "quiz", available: 20, suggestedQuestions: 5 });
    await startGame(db, game.id, { excludeUnready: false, roundCount: 6 });
    const rs = (await db.select().from(rounds).where(eq(rounds.gameId, game.id))).sort((a, b) => a.ordinal - b.ordinal);
    expect(rs).toHaveLength(6);
    expect(rs.every((r) => r.kind === "trivia" && r.subjectPlayerId === null && r.bonusQuestionId)).toBe(true);
    const order = { easy: 0, medium: 1, hard: 2 } as Record<string, number>;
    expect(rs.map((r) => order[r.bonusDifficulty!])).toEqual([...rs.map((r) => order[r.bonusDifficulty!])].sort());
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const tv = await getGameState(db, game.code, auth("display"));
    expect(tv.round).toMatchObject({ kind: "trivia", number: 1, total: 6, eligibleCount: 3, bonus: null });
    expect(tv.round!.promptId).toMatch(/^b\d{3}$/);
    const { r } = await current(game.code);
    await submitGuess(db, game.id, ps[0], r.id, r.correctOptionId);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const ev = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    expect(ev).toHaveLength(3);
    expect(ev.find((e) => e.playerId === ps[0].id)!.points).toBeGreaterThanOrEqual(1025);
  });

  it("Custom mode plays uploaded question groups", async () => {
    await db.delete(customQuestions);
    const csv = [
      "Group Name,Genre,Difficulty,Question,Choice A,Choice B,Choice C,Choice D,Correct (A-D),Seconds (optional)",
      'Test Trivia,Science,easy,"What do plants breathe in, mostly?",Oxygen,Carbon dioxide,Helium,Nitrogen,B,',
      "Test Trivia,Science,hard,Speed of light is about?,300 km/s,300000 km/s,3000 km/s,30 km/s,B,30",
      "Test Trivia,Math,medium,What is 7 x 8?,54,56,58,64,B,",
      "Bad Row,,easy,Missing choices,A,B,,,A,",
      "Other Group,Fun,whatever,Pick D,1,2,3,4,D,",
    ].join("\n");
    const res = await uploadQuestions(db, csv, false);
    expect(res.added).toBe(4);
    expect(res.errors.map((e) => e.row)).toEqual(expect.arrayContaining([5, 6]));
    // Uploading the same file again adds nothing new.
    expect((await uploadQuestions(db, csv, false)).added).toBe(0);
    const groups = await listQuestionGroups(db);
    expect(groups.find((g) => g.name === "Test Trivia")).toMatchObject({ count: 3, easy: 1, medium: 1, hard: 1 });
    expect(await questionAudioList(db, "Test Trivia")).toContain("questions/cq-");

    const game = await createGame(db, { title: "Custom", settings: { mode: "custom", questionGroups: ["Test Trivia"], roundCount: 10, countdownSeconds: 0, autoNext: false } });
    for (let i = 0; i < 3; i++) await joinGame(db, game.code, `Custom ${i + 1}`, null);
    await startGame(db, game.id, { excludeUnready: false });
    const rs = (await db.select().from(rounds).where(eq(rounds.gameId, game.id))).sort((a, b) => a.ordinal - b.ordinal);
    expect(rs).toHaveLength(3); // only 3 in the group
    expect(rs.every((r) => r.kind === "trivia" && r.customQuestionId)).toBe(true);
    expect(rs.find((r) => r.questionText.startsWith("Speed of light"))!.durationMs).toBe(30_000);
    expect((await findGame(db, game.code)).prepareError).toContain("Only 3 questions");
    expect(await deleteQuestionGroup(db, "Other Group")).toBe(1);
  });

  it("switching a lobby to Quiz makes everyone ready, and back to Get Personal un-readies unfinished players", async () => {
    const game = await createGame(db, { title: "Switch", settings: {} });
    const p = (await joinGame(db, game.code, "Halfway", null)).player;
    expect(p.readyAt).toBeNull();
    await updateSettings(db, game.code, { mode: "quiz" });
    expect((await refreshPlayer(p.id)).readyAt).not.toBeNull();
    await updateSettings(db, game.code, { mode: "personal" });
    expect((await refreshPlayer(p.id)).readyAt).toBeNull();
  });
});

describe("question library picks", () => {
  it("players get their 8 about-you questions from the picks, and swaps stay inside them", async () => {
    const bank = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.active, true));
    const picks = bank.slice(20, 30).map((b) => b.id);
    const game = await createGame(db, { title: "Picked", settings: { promptIds: picks } });
    const p = (await joinGame(db, game.code, "Picky", null)).player;
    const mine = await db.select().from(playerPrompts).where(eq(playerPrompts.playerId, p.id));
    expect(mine).toHaveLength(8);
    expect(mine.every((m) => picks.includes(m.promptId))).toBe(true);
    const q = await replacePrompt(db, await findGame(db, game.code), p, 1);
    expect(picks).toContain(q.find((x) => x.slot === 1)!.promptId);
  });

  it("fewer than 8 picks are topped up from the rest of the bank", async () => {
    const bank = await db.select({ id: prompts.id }).from(prompts).where(and(eq(prompts.active, true), eq(prompts.common, false)));
    const picks = bank.slice(0, 3).map((b) => b.id);
    const game = await createGame(db, { title: "Few", settings: { promptIds: picks } });
    const p = (await joinGame(db, game.code, "Few", null)).player;
    const mine = (await db.select().from(playerPrompts).where(eq(playerPrompts.playerId, p.id))).map((m) => m.promptId);
    expect(mine).toHaveLength(8);
    expect(new Set(mine).size).toBe(8);
    for (const id of picks) expect(mine).toContain(id);
  });

  it("Quiz mode plays only the picked questions", async () => {
    const all = await db.select({ id: bonusQuestions.id }).from(bonusQuestions).where(eq(bonusQuestions.active, true));
    const picks = all.slice(0, 4).map((b) => b.id);
    const game = await createGame(db, { title: "Picked quiz", settings: { mode: "quiz", questionIds: picks, roundCount: 10, countdownSeconds: 0 } });
    for (let i = 0; i < 3; i++) await joinGame(db, game.code, `Q${i}`, null);
    expect(await previewRounds(db, await findGame(db, game.code))).toMatchObject({ available: 4 });
    await startGame(db, game.id, { excludeUnready: false, roundCount: 10 });
    const rs = await db.select().from(rounds).where(eq(rounds.gameId, game.id));
    expect(rs).toHaveLength(4);
    expect(rs.every((r) => picks.includes(r.bonusQuestionId!))).toBe(true);
  });
});

describe("character packs", () => {
  it("players can pick a mashup from a pack, and only pack characters are offered", async () => {
    const mash = mashPiece({ head: "dino", body: "astro", zoom: 2, cx: 0.5, cy: 0.33 });
    const pack = await createPack(db, { name: "Mashups", characters: [{ name: "Space Dino", piece: mash }, { name: "Dup", piece: mash }] });
    expect(pack.characters).toHaveLength(1);
    const game = await createGame(db, { title: "Packs", settings: { characterPacks: [pack.id], pieceGroups: [] } });
    const info = await joinInfo(db, game.code);
    expect(info.pieces).toEqual([mash]);
    expect(info.labels[mash]).toBe("Space Dino");
    const p = (await joinGame(db, game.code, "Rex", null, { piece: mash })).player;
    expect(p.piece).toBe(mash);
    const q = (await joinGame(db, game.code, "Sue", null, { piece: "dragon" })).player;
    expect(q.piece).toBe(mash); // not offered here, so they get one from the pack
    await deletePack(db, pack.id);
  });
});

describe("speed questions", () => {
  it("get a short timer and pay by finishing place, never first or last", async () => {
    const { game, ps } = await setupGame(4, { speedQuestions: true, speedCount: 2, speedSeconds: 8, autoReveal: false, autoAway: false });
    await startGame(db, game.id, { excludeUnready: false, perPlayer: 2 });
    const rs = (await db.select().from(rounds).where(and(eq(rounds.gameId, game.id), eq(rounds.status, "PENDING")))).sort((a, b) => a.ordinal - b.ordinal);
    const speed = rs.filter((r) => r.kind === "speed");
    expect(speed).toHaveLength(2);
    expect(speed.every((r) => r.durationMs === 8000 && r.subjectPlayerId)).toBe(true);
    expect(rs[0].kind).not.toBe("speed");
    expect(rs[rs.length - 1].kind).not.toBe("speed");
    // Play up to the first speed question.
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    while ((await current(game.code)).r.kind !== "speed") {
      await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
      await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
      await performAction(db, game.id, "next", (await findGame(db, game.code)).version);
    }
    const { r } = await current(game.code);
    const guessers = ps.filter((p) => p.player.id !== r.subjectPlayerId);
    for (const p of guessers) await submitGuess(db, game.id, p.player, r.id, r.correctOptionId);
    await performAction(db, game.id, "reveal", (await findGame(db, game.code)).version);
    const ev = await db.select().from(scoreEvents).where(eq(scoreEvents.roundId, r.id));
    expect(ev.map((e) => e.points).sort((a, b) => b - a)).toEqual([1000, 800, 600]);
    expect((await getGameState(db, game.code, auth("display"))).round!.kind).toBe("speed");
  });
});


describe("reveal with spotlights", () => {
  it("autoplay keeps the reveal up 16 seconds when the winner/loser spotlights are on", async () => {
    const { game, ps } = await setupGame(3, { autoReveal: true, autoNext: true, revealSeconds: 10, shameSpotlight: true });
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    for (const p of ps) if (p.player.id !== r.subjectPlayerId) await submitGuess(db, game.id, p.player, r.id, r.correctOptionId);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL");
    await db.execute(sql`update games set phase_started_at = now() - interval '12 seconds' where id = ${game.id}`);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("REVEAL");
    await db.execute(sql`update games set phase_started_at = now() - interval '17 seconds' where id = ${game.id}`);
    expect((await getGameState(db, game.code, auth("display"))).phase).toBe("LEADERBOARD");
  });
});
