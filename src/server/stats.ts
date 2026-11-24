import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { guesses, players, rounds } from "@/db/schema";
import type { AwardDTO, StandingDTO, StatsDTO } from "@/lib/dto";

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Running stats and fun awards, derived only from revealed rounds.
 * Awards need a minimum amount of data so early rounds don't crown anyone by accident.
 */
export async function computeStats(db: DB, gameId: string, standings: StandingDTO[]): Promise<StatsDTO> {
  const roster = await db
    .select({ id: players.id, name: players.displayName, piece: players.piece })
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.active, true)));
  const who = new Map(roster.map((p) => [p.id, p]));
  const revealed = await db
    .select({
      id: rounds.id,
      subject: rounds.subjectPlayerId,
      correctOptionId: rounds.correctOptionId,
      questionText: rounds.questionText,
      answerText: rounds.answerText,
      excluded: rounds.excludedPlayerIds,
    })
    .from(rounds)
    .where(and(eq(rounds.gameId, gameId), eq(rounds.status, "REVEALED")));
  const allGuesses = revealed.length
    ? await db
        .select({ roundId: guesses.roundId, playerId: guesses.playerId, optionId: guesses.optionId, elapsedMs: guesses.elapsedMs })
        .from(guesses)
        .innerJoin(rounds, eq(rounds.id, guesses.roundId))
        .where(and(eq(rounds.gameId, gameId), eq(rounds.status, "REVEALED")))
    : [];

  const top = standings.length ? standings[0].points : 0;
  const bottom = standings.length ? standings[standings.length - 1].points : 0;
  const pick = (s: StandingDTO) => ({ name: s.name, piece: s.piece ?? null, points: s.points });
  const stats: StatsDTO = {
    leader: standings.filter((s) => s.points === top).map(pick),
    last: top === bottom ? [] : standings.filter((s) => s.points === bottom).map(pick),
    awards: [],
    hardest: null,
    roundsPlayed: revealed.length,
  };
  if (!revealed.length) return stats;

  const roundById = new Map(revealed.map((r) => [r.id, r]));
  const eligibleCount = (r: (typeof revealed)[number]) => roster.filter((p) => !r.excluded.includes(p.id)).length;
  const award = (key: string, emoji: string, title: string, playerId: string, detail: string): AwardDTO | null => {
    const p = who.get(playerId);
    return p ? { key, emoji, title, name: p.name, piece: p.piece, detail } : null;
  };

  // Knows the family best: best accuracy with at least 2 questions answered.
  const best = standings
    .filter((s) => s.eligible >= 2)
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)[0];
  if (best && best.correct > 0) {
    const a = award("knows-best", "🧠", "Knows the family best", best.playerId, `${best.correct} of ${best.eligible} right (${Math.round(best.accuracy * 100)}%)`);
    if (a) stats.awards.push(a);
  }

  // Biggest mystery / open book: how often people guessed each subject correctly.
  const bySubject = new Map<string, { right: number; total: number }>();
  for (const r of revealed) {
    const e = bySubject.get(r.subject) ?? { right: 0, total: 0 };
    const gs = allGuesses.filter((g) => g.roundId === r.id);
    e.right += gs.filter((g) => g.optionId === r.correctOptionId).length;
    e.total += eligibleCount(r);
    bySubject.set(r.subject, e);
  }
  const subjects = [...bySubject.entries()].filter(([, v]) => v.total > 0).map(([id, v]) => ({ id, rate: v.right / v.total }));
  if (subjects.length >= 2) {
    subjects.sort((a, b) => a.rate - b.rate);
    const m = award("mystery", "🕵️", "Biggest mystery", subjects[0].id, `Only ${Math.round(subjects[0].rate * 100)}% guessed them right`);
    if (m) stats.awards.push(m);
    const ob = subjects[subjects.length - 1];
    if (ob.rate > subjects[0].rate) {
      const o = award("open-book", "📖", "Open book", ob.id, `${Math.round(ob.rate * 100)}% guessed them right`);
      if (o) stats.awards.push(o);
    }
  }

  // Fastest finger: quickest average correct answer (2+ correct). Slowpoke: slowest average lock-in.
  const speed = new Map<string, { correctMs: number[]; allMs: number[] }>();
  for (const g of allGuesses) {
    const e = speed.get(g.playerId) ?? { correctMs: [], allMs: [] };
    e.allMs.push(g.elapsedMs);
    if (roundById.get(g.roundId)?.correctOptionId === g.optionId) e.correctMs.push(g.elapsedMs);
    speed.set(g.playerId, e);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fast = [...speed.entries()].filter(([, v]) => v.correctMs.length >= 2).sort((a, b) => avg(a[1].correctMs) - avg(b[1].correctMs))[0];
  if (fast) {
    const f = award("fastest", "⚡", "Fastest finger", fast[0], `Right answers in ${secs(avg(fast[1].correctMs))} on average`);
    if (f) stats.awards.push(f);
  }
  const slow = [...speed.entries()].filter(([, v]) => v.allMs.length >= 2).sort((a, b) => avg(b[1].allMs) - avg(a[1].allMs))[0];
  if (slow && (!fast || slow[0] !== fast[0])) {
    const s = award("slowpoke", "🐢", "Slowpoke", slow[0], `Takes ${secs(avg(slow[1].allMs))} to decide`);
    if (s) stats.awards.push(s);
  }

  // Hardest question so far.
  let hardest: StatsDTO["hardest"] = null;
  for (const r of revealed) {
    const n = eligibleCount(r);
    if (!n) continue;
    const right = allGuesses.filter((g) => g.roundId === r.id && g.optionId === r.correctOptionId).length;
    const pct = Math.round((right / n) * 100);
    if (!hardest || pct < hardest.pctCorrect) hardest = { questionText: r.questionText, answerText: r.answerText, pctCorrect: pct };
  }
  stats.hardest = hardest;
  return stats;
}
