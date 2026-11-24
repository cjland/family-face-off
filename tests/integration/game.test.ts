import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/client";
import { guesses, players, rounds, scoreEvents, type Player } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { performAction, startGame, submitGuess } from "@/server/engine";
import {
  createGame,
  findGame,
  getQuestionnaire,
  joinGame,
  removePlayer,
  replacePrompt,
  saveAnswers,
  setReady,
} from "@/server/lobby";
import { getGameState, type StateAuth } from "@/server/state";
import { closeTestDb, resetGames, testDb } from "../support/db";

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
  const game = await createGame(db, { title: "Test", settings: { roundCount: 6, ...settings } });
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
    const game = await createGame(db, { settings: { roundCount: 4 } });
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
    expect(events.find((e) => e.playerId === guessers[0].player.id)?.points).toBe(1000);
    expect(events.find((e) => e.playerId === guessers[1].player.id)?.points).toBe(0);
    expect(events.find((e) => e.playerId === guessers[2].player.id)?.points).toBe(0);

    // Late guess after reveal is rejected.
    await expectApiError(submitGuess(db, game.id, guessers[2].player, r.id, r.correctOptionId), "WRONG_PHASE");

    const dv = await getGameState(db, game.code, auth("display"));
    expect(dv.reveal?.correctOptionId).toBe(r.correctOptionId);
    expect(dv.reveal?.guesses).toHaveLength(2);
    expect(dv.standings?.[0].points).toBe(1000);

    const me = await getGameState(db, game.code, auth("player", guessers[0].player));
    expect(me.me?.lastResult).toEqual({ correct: true, points: 1000, answered: true });
    expect(me.reveal?.guesses).toBeUndefined();

    g = await findGame(db, game.code);
    await performAction(db, game.id, "next", g.version);
    expect((await findGame(db, game.code)).phase).toBe("QUESTION");
    // A stale "next" (same old version) is a no-op, not a double advance.
    const stale = await performAction(db, game.id, "next", g.version);
    expect(stale.noop).toBe(true);
  });

  it("rejects guesses after the deadline even before reveal runs", async () => {
    const { game, ps } = await setupGame(3);
    await startGame(db, game.id, { excludeUnready: false });
    await performAction(db, game.id, "open", (await findGame(db, game.code)).version);
    const { r } = await current(game.code);
    await db.update(rounds).set({ deadlineAt: sql`now() - interval '1 second'` }).where(eq(rounds.id, r.id));
    const guesser = ps.find((p) => p.player.id !== r.subjectPlayerId)!;
    await expectApiError(submitGuess(db, game.id, guesser.player, r.id, r.correctOptionId), "TIME_UP");
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
    const { game, ps } = await setupGame(3, { autoReveal: true, autoNext: true, revealSeconds: 3 });
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
    await db.update(rounds).set({ revealedAt: sql`now() - interval '10 seconds'` }).where(eq(rounds.id, r.id));
    const s3 = await getGameState(db, game.code, auth("display"));
    expect(s3.phase).toBe("QUESTION");
    expect(s3.round?.number).toBe(2);
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
    expect(ev.filter((e) => e.points === 1000)).toHaveLength(24);
  });
});
