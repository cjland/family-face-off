"use client";

import type { GameStateDTO } from "@/lib/dto";
import { Avatar, LETTERS } from "./ui";

/** Who has locked in so far (never what they chose). */
export function LockInList({ state, size = "md", overtime = false }: { state: GameStateDTO; size?: "md" | "tv"; overtime?: boolean }) {
  const round = state.round;
  if (!round) return null;
  const locked = new Set(round.lockedPlayerIds ?? []);
  const players = (state.players ?? []).filter((p) => p.id !== round.subjectPlayerId);
  const subject = (state.players ?? []).find((p) => p.id === round.subjectPlayerId);
  const ordered = [...players.filter((p) => locked.has(p.id)), ...players.filter((p) => !locked.has(p.id))];
  const tv = size === "tv";
  return (
    <ul className={`flex flex-col ${tv ? "gap-2" : "gap-1.5"}`} aria-label="Lock-in status">
      {ordered.map((p) => {
        const isIn = locked.has(p.id);
        return (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-3 ${tv ? "py-2 text-2xl" : "py-1.5"} ${isIn ? "bg-good/20" : "bg-black/25"}`}
          >
            <span className={isIn ? "" : "opacity-50 grayscale"}>
              <Avatar name={p.name} piece={p.piece} size={tv ? 48 : 36} />
            </span>
            <span className={`flex-1 min-w-0 truncate font-semibold ${isIn ? "" : "text-muted"}`}>{p.name}</span>
            <span className={isIn ? "text-good font-semibold" : overtime ? "text-bad font-semibold pulse-soft" : "text-muted pulse-soft"}>
              {isIn ? "🔒 Locked in" : overtime ? "🚨 Late!" : "⏳ Thinking…"}
            </span>
          </li>
        );
      })}
      {subject && (
        <li className={`flex items-center gap-3 rounded-xl px-3 ${tv ? "py-2 text-2xl" : "py-1.5"} bg-black/10 text-muted`}>
          <Avatar name={subject.name} piece={subject.piece} size={tv ? 48 : 36} />
          <span className="flex-1 min-w-0 truncate">{subject.name}</span>
          <span>Sits this one out</span>
        </li>
      )}
    </ul>
  );
}

/** After the reveal: each player's choice, right or wrong, and how long they took. */
export function GuessList({ state, size = "md" }: { state: GameStateDTO; size?: "md" | "tv" }) {
  const round = state.round;
  const reveal = state.reveal;
  if (!round || !reveal) return null;
  const guessed = new Map(reveal.guesses.map((g) => [g.playerId, g]));
  const roster = state.players ?? [];
  const eligible = roster.filter((p) => p.id !== round.subjectPlayerId);
  const rows = eligible
    .map((p) => ({ p, g: guessed.get(p.id) }))
    .sort((a, b) => Number(Boolean(b.g?.correct)) - Number(Boolean(a.g?.correct)) || (a.g?.elapsedMs ?? 1e9) - (b.g?.elapsedMs ?? 1e9));
  const tv = size === "tv";
  // TV density so the list always fits its panel without cutting anyone off:
  // up to 5 roomy two-line rows, 6-9 single-line rows, 10+ two columns.
  const twoCol = tv && rows.length > 9;
  const oneLine = tv && !twoCol && rows.length > 5;
  return (
    <ul className={`grid ${twoCol ? "grid-cols-2 gap-2" : oneLine ? "grid-cols-1 gap-1.5" : "grid-cols-1 gap-2"}`} aria-label="Who guessed what">
      {rows.map(({ p, g }) => {
        const idx = g ? round.options.findIndex((o) => o.id === g.optionId) : -1;
        const choice = g ? `${LETTERS[idx] ?? "?"}: ${round.options[idx]?.label ?? ""}` : "No answer";
        const late = Boolean(g && g.elapsedMs > round.durationMs);
        return (
          <li
            key={p.id}
            className={`flex items-center gap-2 rounded-xl px-3 ${
              tv ? (twoCol ? "py-1.5 text-xl" : oneLine ? "py-1 text-xl" : "py-2 text-2xl") : "py-1.5"
            } ${g?.correct ? "bg-good/20" : "bg-black/25"}`}
          >
            <Avatar name={p.name} piece={p.piece} size={tv ? (twoCol ? 40 : oneLine ? 42 : 48) : 34} />
            {oneLine ? (
              <span className="min-w-0 flex-1 flex items-baseline gap-2">
                <span className="truncate font-semibold max-w-[45%] flex-none">{p.name}</span>
                <span className="truncate text-lg text-muted">{choice}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className={`block truncate ${tv ? "text-lg" : "text-sm"} text-muted`}>{choice}</span>
              </span>
            )}
            <span className={`tabular-nums whitespace-nowrap ${tv ? "text-lg" : "text-sm"} ${late ? "text-bad font-semibold" : "text-muted"}`}>
              {g ? `${late ? "🚨 " : ""}${(g.elapsedMs / 1000).toFixed(1)}s` : "—"}
            </span>
            <span className={`font-bold ${g?.correct ? "text-good" : "text-bad"}`} aria-label={g?.correct ? "correct" : "wrong"}>
              {g?.correct ? "✓" : "✗"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
