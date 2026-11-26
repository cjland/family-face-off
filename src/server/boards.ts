import type { BoardsDTO, StandingDTO } from "@/lib/dto";
import { BONUS_PERSON } from "@/lib/bonus";

type RoundRow = {
  id: string;
  ordinal: number;
  /** Null for bonus rounds. */
  subject: string | null;
  correctOptionId: string;
  answerText: string;
  promptText: string;
  options: { id: string; label: string }[];
  excluded: string[];
  questionText: string;
  durationMs: number;
};
type GuessRow = { roundId: string; playerId: string; optionId: string; elapsedMs: number };
type Person = { id: string; name: string; piece: string | null };

/** Data for the extra TV leaderboard pages. Uses revealed rounds only, so nothing secret leaks. */
export function computeBoards(
  roster: Person[],
  standings: StandingDTO[],
  revealed: RoundRow[],
  allGuesses: GuessRow[],
  points: { roundId: string; playerId: string; points: number }[] = [],
): BoardsDTO {
  const who = new Map(roster.map((p) => [p.id, p]));
  const ordered = [...revealed].sort((a, b) => a.ordinal - b.ordinal);
  const byRound = new Map<string, GuessRow[]>();
  for (const g of allGuesses) byRound.set(g.roundId, [...(byRound.get(g.roundId) ?? []), g]);
  const eligibleIds = (r: RoundRow) => roster.filter((p) => p.id !== r.subject && !r.excluded.includes(p.id)).map((p) => p.id);
  const person = (id: string | null) => {
    if (!id) return { ...BONUS_PERSON };
    const p = who.get(id);
    return { playerId: id, name: p?.name ?? "Someone", piece: p?.piece ?? null };
  };

  const stumpers: BoardsDTO["stumpers"] = ordered.map((r, i) => {
    const gs = byRound.get(r.id) ?? [];
    const elig = eligibleIds(r).length;
    const right = gs.filter((g) => g.optionId === r.correctOptionId).length;
    const pct = elig ? Math.round((right / elig) * 100) : 0;
    const counts = new Map(r.options.map((o) => [o.id, 0]));
    for (const g of gs) counts.set(g.optionId, (counts.get(g.optionId) ?? 0) + 1);
    const correctCount = counts.get(r.correctOptionId) ?? 0;
    const othersMax = Math.max(0, ...[...counts.entries()].filter(([id]) => id !== r.correctOptionId).map(([, c]) => c));
    let badge: BoardsDTO["stumpers"][number]["badge"] = null;
    if (elig >= 2 && right === 0) badge = "impossible";
    else if (elig >= 2 && right === elig) badge = "everybody";
    else if (gs.length >= 3 && correctCount > 0 && correctCount < othersMax && [...counts.values()].every((c) => c >= correctCount || c === 0))
      badge = "surprise";
    return { ...person(r.subject), number: i + 1, prompt: r.promptText, answer: r.answerText, pctCorrect: pct, right, eligible: elig, badge };
  });
  stumpers.sort((a, b) => a.pctCorrect - b.pctCorrect || b.number - a.number);

  const form: BoardsDTO["form"] = standings.map((s) => {
    const last: BoardsDTO["form"][number]["last"] = [];
    for (const r of ordered) {
      if (!eligibleIds(r).includes(s.playerId)) continue;
      const g = (byRound.get(r.id) ?? []).find((x) => x.playerId === s.playerId);
      last.push(!g ? "missed" : g.optionId === r.correctOptionId ? "right" : "wrong");
    }
    return { playerId: s.playerId, name: s.name, piece: s.piece ?? null, last: last.slice(-5) };
  });
  const heat = (f: BoardsDTO["form"][number]) => f.last.reduce((a, x, i) => a + (x === "right" ? 1 + i * 0.01 : 0), 0);
  form.sort((a, b) => heat(b) - heat(a));

  const mysteryMap = new Map<string, { right: number; total: number }>();
  for (const r of ordered) {
    if (!r.subject) continue; // bonus trivia isn't about anyone
    const e = mysteryMap.get(r.subject) ?? { right: 0, total: 0 };
    e.total += eligibleIds(r).length;
    e.right += (byRound.get(r.id) ?? []).filter((g) => g.optionId === r.correctOptionId).length;
    mysteryMap.set(r.subject, e);
  }
  const mystery: BoardsDTO["mystery"] = [...mysteryMap.entries()]
    .filter(([id, v]) => v.total > 0 && who.has(id))
    .map(([id, v]) => ({ ...person(id), rate: v.right / v.total, right: v.right, total: v.total }))
    .sort((a, b) => a.rate - b.rate);

  const galaxyMap = new Map<string, { ms: number[]; right: number; eligible: number }>();
  for (const r of ordered) {
    for (const id of eligibleIds(r)) {
      const e = galaxyMap.get(id) ?? { ms: [], right: 0, eligible: 0 };
      e.eligible += 1;
      const g = (byRound.get(r.id) ?? []).find((x) => x.playerId === id);
      if (g) {
        e.ms.push(g.elapsedMs);
        if (g.optionId === r.correctOptionId) e.right += 1;
      }
      galaxyMap.set(id, e);
    }
  }
  const galaxy: BoardsDTO["galaxy"] = [...galaxyMap.entries()]
    .filter(([id, v]) => v.ms.length > 0 && who.has(id))
    .map(([id, v]) => ({
      ...person(id),
      avgMs: v.ms.reduce((a, b) => a + b, 0) / v.ms.length,
      accuracy: v.eligible ? v.right / v.eligible : 0,
      answered: v.ms.length,
    }));

  const graveyard: BoardsDTO["graveyard"] = [];
  for (const r of ordered) {
    const counts = new Map<string, number>();
    for (const g of byRound.get(r.id) ?? []) if (g.optionId !== r.correctOptionId) counts.set(g.optionId, (counts.get(g.optionId) ?? 0) + 1);
    for (const [optionId, fooled] of counts) {
      if (fooled < 2) continue;
      const label = r.options.find((o) => o.id === optionId)?.label ?? "?";
      graveyard.push({ label, fooled, subjectName: person(r.subject).name, prompt: r.promptText, actual: r.answerText, bonus: !r.subject });
    }
  }
  graveyard.sort((a, b) => b.fooled - a.fooled);

  const LETTERS = ["A", "B", "C", "D"];
  const ptsOf = new Map(points.map((e) => [`${e.roundId}:${e.playerId}`, e.points]));
  const history: BoardsDTO["history"] = ordered.map((r, i) => {
    const gs = byRound.get(r.id) ?? [];
    const rows = eligibleIds(r)
      .map((id) => {
        const g = gs.find((x) => x.playerId === id);
        const idx = g ? r.options.findIndex((o) => o.id === g.optionId) : -1;
        return {
          ...person(id),
          letter: idx >= 0 ? LETTERS[idx] : null,
          label: idx >= 0 ? r.options[idx].label : null,
          correct: Boolean(g && g.optionId === r.correctOptionId),
          elapsedMs: g ? g.elapsedMs : null,
          points: ptsOf.get(`${r.id}:${id}`) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          Number(b.correct) - Number(a.correct) ||
          Number(b.elapsedMs !== null) - Number(a.elapsedMs !== null) ||
          (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0),
      );
    return {
      number: i + 1,
      roundId: r.id,
      questionText: r.questionText,
      subject: person(r.subject),
      answer: r.options.find((o) => o.id === r.correctOptionId)?.label ?? r.answerText,
      durationMs: r.durationMs,
      right: rows.filter((x) => x.correct).length,
      eligible: rows.length,
      rows,
    };
  });

  return { stumpers, form, mystery, galaxy, history, graveyard: graveyard.slice(0, 3) };
}
