"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

import type { GameSettings, MusicStyle } from "@/lib/settings";
import { BOARD_IDS, BOARD_INFO, DEFAULT_BOARDS } from "@/lib/boards";
import { PIECE_GROUP_IDS, PIECE_GROUPS, pieceSrc } from "@/lib/pieces";
import {
  formatMinutes,
  MAX_QUESTIONS,
  OVERHEAD_SECONDS_PER_QUESTION,
  plannedMinutes,
  plannedQuestions,
} from "@/lib/plan";
import {
  BONUS_MIN_POINTS,
  BONUS_TOP_POINTS,
  bonusLadder,
  defaultBonusCount,
} from "@/lib/bonus";
import { SPEED_MIN_POINTS, SPEED_STEP, SPEED_TOP_POINTS } from "@/lib/trivia";

/** Bonus trivia questions in a game with this many regular questions (never first or last). */
function bonusFor(value: SettingsDraft, perPerson: number, regular: number) {
  if (!value.bonusQuestions || value.mode !== "personal") return 0;
  return Math.max(
    0,
    Math.min(value.bonusCount ?? defaultBonusCount(perPerson), regular - 1),
  );
}
/** A bonus question takes about 20 seconds to answer, plus the usual countdown, reveal and leaderboard. */
const BONUS_SECONDS = 20;

const PER_PERSON = [3, 4, 5, 6, 7, 8];
const TOTALS = [5, 10, 15, 20, 30, 40];

/** Quiz and Custom modes: pick the total number of questions. */
function TotalPicker({
  value,
  set,
}: {
  value: SettingsDraft;
  set: <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How many questions"
      className="flex flex-col gap-1"
    >
      <div className="grid grid-cols-[1fr_1fr] px-3 text-sm text-muted">
        <span>Questions</span>
        <span>About how long</span>
      </div>
      {TOTALS.map((n) => {
        const on = value.roundCount === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set("roundCount", n)}
            className={`grid grid-cols-[1fr_1fr] items-center text-left rounded-xl border px-3 py-2 min-h-[44px] ${
              on
                ? "border-accent bg-accent/15"
                : "border-white/10 bg-black/20 hover:border-white/30"
            }`}
          >
            <span className="font-display text-lg font-bold">
              {n} questions
            </span>
            <span className="tabular-nums">
              {formatMinutes(plannedMinutes(n, value.questionSeconds))}
            </span>
          </button>
        );
      })}
      <p className="text-sm text-muted mt-1">
        Everyone answers every question. If there aren&apos;t enough questions,
        the game plays all of them. You can change the number when you press
        Start.
      </p>
    </div>
  );
}

const MODES = [
  {
    id: "personal",
    emoji: "🙋",
    label: "Get Personal",
    about:
      "Everyone answers 8 questions about themselves, then guesses how the others answered.",
  },
  {
    id: "quiz",
    emoji: "🧠",
    label: "Quiz",
    about:
      "Built-in trivia (20 Thanksgiving questions so far). Nobody fills anything in: join and play.",
  },
  {
    id: "custom",
    emoji: "📝",
    label: "Custom",
    about:
      "Your own questions, uploaded with the template in Question library below.",
  },
] as const;

/** Custom mode: which uploaded groups to play. */
function GroupPicker({
  value,
  set,
}: {
  value: SettingsDraft;
  set: <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => void;
}) {
  const [groups, setGroups] = useState<
    { name: string; count: number; genres: string[] }[] | null
  >(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ groups: { name: string; count: number; genres: string[] }[] }>("/api/questions")
        .then((r) => alive && setGroups(r.groups))
        .catch(() => alive && setGroups([]));
    void load();
    // Refresh when the Question library uploads or deletes a group.
    window.addEventListener("questions-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("questions-changed", load);
    };
  }, []);
  if (groups === null)
    return <p className="text-sm text-muted">Loading your question groups…</p>;
  if (!groups.length)
    return (
      <p className="text-sm text-muted">
        No uploaded questions yet. Use <strong>Question library</strong> on the
        host page: download the template, fill it in, and upload it.
      </p>
    );
  return (
    <fieldset>
      <legend className="font-semibold mb-1">Question groups to play</legend>
      <div className="grid sm:grid-cols-2 gap-2">
        {groups.map((g) => {
          const on = value.questionGroups.includes(g.name);
          return (
            <label
              key={g.name}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2 cursor-pointer ${on ? "border-accent bg-accent/15" : "border-white/15 bg-black/20"}`}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-[var(--accent)]"
                checked={on}
                onChange={(e) =>
                  set(
                    "questionGroups",
                    e.target.checked
                      ? [...value.questionGroups, g.name]
                      : value.questionGroups.filter((x) => x !== g.name),
                  )
                }
              />
              <span className="min-w-0">
                <span className="font-semibold block truncate">{g.name}</span>
                <span className="block text-sm text-muted truncate">
                  {g.count} question{g.count === 1 ? "" : "s"}
                  {g.genres.length
                    ? ` · ${g.genres.slice(0, 3).join(", ")}`
                    : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** "12 people × 4 questions each ≈ 48 questions, about 40 min" for each choice, pick one. */
function Planner({
  value,
  set,
}: {
  value: SettingsDraft;
  set: <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => void;
}) {
  const people = value.plannedPlayers ?? 12;
  const per = value.perPlayer;
  return (
    <section
      className="rounded-2xl border border-white/15 bg-black/20 p-4 flex flex-col gap-3"
      aria-labelledby="plan-title"
    >
      <h3 id="plan-title" className="font-display text-xl font-bold">
        Plan the game
      </h3>
      <div className="flex flex-wrap gap-4">
        {value.mode === "personal" && (
          <label className="flex flex-col gap-1">
            <span className="font-semibold">People playing (about)</span>
            <input
              className="input !w-28"
              type="number"
              min={3}
              max={50}
              value={people}
              onChange={(e) =>
                set(
                  "plannedPlayers",
                  Math.max(3, Math.min(50, Number(e.target.value) || 3)),
                )
              }
            />
          </label>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="questionSeconds" className="font-semibold">
            Seconds per question
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="questionSeconds"
              className="input !w-24"
              type="number"
              min={5}
              max={120}
              value={value.questionSeconds}
              onChange={(e) =>
                set(
                  "questionSeconds",
                  Math.max(5, Math.min(120, Number(e.target.value) || 20)),
                )
              }
            />
            <div
              className="flex gap-1"
              role="group"
              aria-label="Quick picks for seconds per question"
            >
              {[10, 15, 20, 30, 45].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={value.questionSeconds === n}
                  className={`btn ${value.questionSeconds === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                  onClick={() => set("questionSeconds", n)}
                >
                  {n}s
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {value.mode === "personal" ? (
        <>
          <div
            role="radiogroup"
            aria-label="Questions about each person"
            className="flex flex-col gap-1"
          >
            <div className="grid grid-cols-[1fr_1fr_1fr] px-3 text-sm text-muted">
              <span>Questions per person</span>
              <span>Total questions</span>
              <span>About how long</span>
            </div>
            {PER_PERSON.map((k) => {
              const q = plannedQuestions(people, k);
              const b = bonusFor(value, k, q);
              const minutes =
                plannedMinutes(q, value.questionSeconds) +
                Math.round(
                  (b * (BONUS_SECONDS + OVERHEAD_SECONDS_PER_QUESTION)) / 60,
                );
              const on = per === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("perPlayer", k)}
                  className={`grid grid-cols-[1fr_1fr_1fr] items-center text-left rounded-xl border px-3 py-2 min-h-[44px] ${
                    on
                      ? "border-accent bg-accent/15"
                      : "border-white/10 bg-black/20 hover:border-white/30"
                  }`}
                >
                  <span className="font-display text-lg font-bold">
                    {k} each
                  </span>
                  <span className="tabular-nums">
                    {q}
                    {q === MAX_QUESTIONS && people * k > MAX_QUESTIONS
                      ? " (max)"
                      : ""}
                    {b > 0 && <span className="text-accent-2"> + {b} 🎁</span>}
                  </span>
                  <span className="tabular-nums">{formatMinutes(minutes)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted">
            Times allow about {OVERHEAD_SECONDS_PER_QUESTION} seconds per
            question for the countdown, reveal and leaderboard. You can change
            the number when you press Start, once you see who actually joined.
            Everyone answers 8 questions about themselves, so a few people may
            not have enough answers for 7–8 each.
          </p>
        </>
      ) : (
        <TotalPicker value={value} set={set} />
      )}
    </section>
  );
}

export type SettingsDraft = Pick<
  GameSettings,
  | "theme"
  | "roundCount"
  | "questionSeconds"
  | "speedBonus"
  | "autoReveal"
  | "overtimeSeconds"
  | "autoNext"
  | "aiDistractors"
  | "music"
  | "taunts"
  | "shameSpotlight"
  | "pieceGroups"
  | "mode"
  | "questionGroups"
  | "speedQuestions"
  | "speedCount"
  | "speedSeconds"
  | "autoAway"
  | "sound"
  | "animations"
  | "voice"
  | "boards"
  | "perPlayer"
  | "plannedPlayers"
  | "fastestBonus"
  | "bonusQuestions"
  | "bonusCount"
>;

export const DEFAULT_DRAFT: SettingsDraft = {
  theme: "classic",
  roundCount: 20,
  questionSeconds: 20,
  speedBonus: 0,
  autoReveal: true,
  overtimeSeconds: 5,
  autoNext: true,
  aiDistractors: false,
  music: "gameshow",
  taunts: true,
  shameSpotlight: true,
  pieceGroups: [...PIECE_GROUP_IDS],
  mode: "personal",
  questionGroups: [],
  speedQuestions: false,
  speedSeconds: 8,
  autoAway: true,
  sound: true,
  animations: true,
  voice: true,
  boards: [...DEFAULT_BOARDS],
  perPlayer: 3,
  plannedPlayers: 12,
  fastestBonus: true,
  bonusQuestions: true,
};

const MUSIC_LABELS: [MusicStyle, string][] = [
  ["gameshow", "Game show"],
  ["suspense", "Tick-tock suspense"],
  ["lounge", "Lounge jazz"],
  ["off", "No music"],
];

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer py-1">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-6 w-6 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsForm({
  value,
  onChange,
  aiAvailable,
  aside,
}: {
  value: SettingsDraft;
  onChange: (v: SettingsDraft) => void;
  aiAvailable: boolean;
  /** Extra content under the scoring options (the setup page puts a Create game button here). */
  aside?: React.ReactNode;
}) {
  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <fieldset className="lg:col-span-2">
        <legend className="font-semibold mb-2">Game mode</legend>
        <div
          className="grid sm:grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Game mode"
        >
          {MODES.map((m) => {
            const on = value.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("mode", m.id)}
                className={`flex items-start gap-3 text-left rounded-xl border px-3 py-2 ${on ? "border-accent bg-accent/15" : "border-white/15 bg-black/20 hover:border-white/30"}`}
              >
                <span className="text-3xl emoji-plain" aria-hidden="true">
                  {m.emoji}
                </span>
                <span>
                  <span className="font-display text-lg font-bold block">
                    {m.label}
                  </span>
                  <span className="block text-sm text-muted">{m.about}</span>
                </span>
              </button>
            );
          })}
        </div>
        {value.mode === "custom" && (
          <div className="mt-3">
            <GroupPicker value={value} set={set} />
          </div>
        )}
      </fieldset>
      <Planner value={value} set={set} />
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="font-semibold mb-2">Theme</legend>
          <div className="flex gap-3 flex-wrap">
            {(
              [
                ["classic", "Classic game show"],
                ["thanksgiving", "Thanksgiving"],
              ] as const
            ).map(([t, label]) => (
              <label
                key={t}
                className={`btn ${value.theme === t ? "btn-primary" : "btn-ghost"} !text-base`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={value.theme === t}
                  onChange={() => set("theme", t)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold mb-2">
            Music while people choose
          </legend>
          <div className="flex gap-2 flex-wrap">
            {MUSIC_LABELS.map(([m, label]) => (
              <label
                key={m}
                className={`btn ${value.music === m ? "btn-primary" : "btn-ghost"} !text-base`}
              >
                <input
                  type="radio"
                  name="music"
                  value={m}
                  checked={value.music === m}
                  onChange={() => set("music", m)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <span className="text-sm text-muted">
            Plays on the TV while people choose (needs TV sound on).
          </span>
        </fieldset>
        <div>
          <p className="font-semibold">Scoring</p>
          <p className="text-sm text-muted">
            1,000 points for each right answer.
          </p>
          <Toggle
            id="fastestBonus"
            label="Speed bonus for the fastest right answer"
            hint="Each round the quickest right answer gets a surprise 25–50 extra points, so every round has a clear winner."
            checked={value.fastestBonus}
            onChange={(v) => set("fastestBonus", v)}
          />
          {value.mode === "personal" && (
            <>
              <Toggle
                id="bonusQuestions"
                label="🎁 Bonus trivia questions"
                hint={`Thanksgiving trivia slipped into the middle of the game, easy to hard. Everyone plays. Right answers score by how fast they came in: ${bonusLadder(BONUS_TOP_POINTS)} (never less than ${BONUS_MIN_POINTS}).`}
                checked={value.bonusQuestions}
                onChange={(v) => set("bonusQuestions", v)}
              />
              {value.bonusQuestions && (
                <div
                  className="flex items-center gap-2 flex-wrap pl-9"
                  role="radiogroup"
                  aria-label="How many bonus questions"
                >
                  <span className="text-sm text-muted">How many</span>
                  {[undefined, 1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <button
                      key={n ?? "auto"}
                      type="button"
                      role="radio"
                      aria-checked={value.bonusCount === n}
                      className={`btn ${value.bonusCount === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                      onClick={() => set("bonusCount", n)}
                      title={
                        n === undefined
                          ? "One each time through everyone (same as questions per person)"
                          : undefined
                      }
                    >
                      {n ?? "Auto"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <Toggle
            id="speedQuestions"
            label="⚡ Speed questions"
            hint={`Every so often a question gets a short timer, and right answers score by finishing place: ${SPEED_TOP_POINTS.toLocaleString()}, ${(SPEED_TOP_POINTS - SPEED_STEP).toLocaleString()}, ${(SPEED_TOP_POINTS - 2 * SPEED_STEP).toLocaleString()}… (never less than ${SPEED_MIN_POINTS}).`}
            checked={value.speedQuestions}
            onChange={(v) => set("speedQuestions", v)}
          />
          {value.speedQuestions && (
            <div className="flex flex-col gap-2 pl-9">
              <div
                className="flex items-center gap-2 flex-wrap"
                role="radiogroup"
                aria-label="How many speed questions"
              >
                <span className="text-sm text-muted">How many</span>
                {[undefined, 1, 2, 3, 4, 6].map((n) => (
                  <button
                    key={n ?? "auto"}
                    type="button"
                    role="radio"
                    aria-checked={value.speedCount === n}
                    className={`btn ${value.speedCount === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                    onClick={() => set("speedCount", n)}
                    title={
                      n === undefined ? "About one in six questions" : undefined
                    }
                  >
                    {n ?? "Auto"}
                  </button>
                ))}
              </div>
              <div
                className="flex items-center gap-2 flex-wrap"
                role="radiogroup"
                aria-label="Seconds for speed questions"
              >
                <span className="text-sm text-muted">Seconds</span>
                {[5, 6, 8, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value.speedSeconds === n}
                    className={`btn ${value.speedSeconds === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                    onClick={() => set("speedSeconds", n)}
                  >
                    {n}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {aside && <div className="pt-2">{aside}</div>}
      </div>
      <fieldset className="lg:col-span-2">
        <legend className="font-semibold mb-1">
          Characters players can pick
        </legend>
        <span className="text-sm text-muted block mb-2">
          Each group has 20 game pieces. Pick at least one; with more players
          than pieces, pieces get shared.
        </span>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {PIECE_GROUPS.map((g) => {
            const on = value.pieceGroups.includes(g.id);
            return (
              <label
                key={g.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer ${on ? "border-accent bg-accent/15" : "border-white/15 bg-black/20"}`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={on}
                  disabled={on && value.pieceGroups.length === 1}
                  onChange={(e) =>
                    set(
                      "pieceGroups",
                      PIECE_GROUP_IDS.filter((x) =>
                        x === g.id
                          ? e.target.checked
                          : value.pieceGroups.includes(x),
                      ),
                    )
                  }
                />
                <span className="flex -space-x-3 flex-none" aria-hidden="true">
                  {g.pieces.slice(0, 4).map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={id}
                      src={pieceSrc(id)}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 object-contain"
                    />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="font-semibold block">{g.label}</span>
                  <span className="block text-sm text-muted truncate">
                    {g.about}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="lg:col-span-2">
        <legend className="font-semibold mb-1">
          Leaderboard pages on the TV
        </legend>
        <span className="text-sm text-muted block mb-2">
          After each reveal the TV rotates through these (5 seconds each). Pick
          at least one.
        </span>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {BOARD_IDS.map((id) => {
            const on = value.boards.includes(id);
            return (
              <label
                key={id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2 cursor-pointer ${on ? "border-accent bg-accent/15" : "border-white/15 bg-black/20"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-[var(--accent)]"
                  checked={on}
                  disabled={on && value.boards.length === 1}
                  onChange={(e) =>
                    set(
                      "boards",
                      BOARD_IDS.filter((b) =>
                        b === id ? e.target.checked : value.boards.includes(b),
                      ),
                    )
                  }
                />
                <span>
                  <span className="font-semibold">{BOARD_INFO[id].label}</span>
                  <span className="block text-sm text-muted">
                    {BOARD_INFO[id].about}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="lg:col-span-2 grid gap-x-8 gap-y-1 md:grid-cols-2">
        <Toggle
          id="sound"
          label="TV sound"
          hint="Beeps, lock-in pops, “Hurry up!” and music. Browsers need one click or key press on the TV before they allow sound."
          checked={value.sound}
          onChange={(v) => set("sound", v)}
        />
        <Toggle
          id="voice"
          label="Announcer voice"
          hint="A game-show announcer reads each question and calls out big moments. Music dips while he talks. Needs TV sound on."
          checked={value.voice}
          onChange={(v) => set("voice", v)}
        />
        <Toggle
          id="animations"
          label="TV animations"
          hint="Countdowns, races, pop-ins and confetti. Plays even if the TV computer is set to reduce motion."
          checked={value.animations}
          onChange={(v) => set("animations", v)}
        />
        <Toggle
          id="taunts"
          label="Tease slowpokes"
          hint='The TV playfully calls out whoever hasn&apos;t locked in yet ("Hurry up, Ben!").'
          checked={value.taunts}
          onChange={(v) => set("taunts", v)}
        />
        <Toggle
          id="shameSpotlight"
          label="Winner & loser spotlights"
          hint="At each reveal, the round winner gets 5 seconds in the spotlight (fanfare and their winning catchphrase), then whoever got it wrong (or didn't answer) and was slowest gets 5 seconds (sad trombone and their losing catchphrase). With autoplay, the reveal stays up 16 seconds to fit both."
          checked={value.shameSpotlight}
          onChange={(v) => set("shameSpotlight", v)}
        />
        <div>
          <Toggle
            id="autoReveal"
            label="Auto reveal"
            hint="Reveal as soon as everyone has answered, or a few seconds after time runs out (late answers still count)."
            checked={value.autoReveal}
            onChange={(v) => set("autoReveal", v)}
          />
          {value.autoReveal && (
            <div
              className="flex items-center gap-2 flex-wrap pl-9"
              role="radiogroup"
              aria-label="Wait after time runs out"
            >
              <span className="text-sm text-muted">
                After time runs out, wait
              </span>
              {[2, 5, 10, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={value.overtimeSeconds === n}
                  className={`btn ${value.overtimeSeconds === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-4 !text-sm`}
                  onClick={() => set("overtimeSeconds", n)}
                >
                  +{n}s
                </button>
              ))}
            </div>
          )}
        </div>
        <Toggle
          id="autoNext"
          label="Autoplay"
          hint="Runs the game by itself: the first question starts on its own, each answer shows for 10 seconds, then the leaderboard for 5 seconds a page, then the next question. Pause any time on the TV (P) or the host screen."
          checked={value.autoNext}
          onChange={(v) => set("autoNext", v)}
        />
        <Toggle
          id="autoAway"
          label="Set aside players who stop answering"
          hint="After 2 missed questions in a row, the game stops waiting for that player and their phone asks “Still playing?”. Players can also tap “Step away” themselves."
          checked={value.autoAway}
          onChange={(v) => set("autoAway", v)}
        />
        {aiAvailable && (
          <Toggle
            id="ai"
            label="AI wrong-answer helper (OpenRouter)"
            hint="Sends only question + answer text (no names) to OpenRouter to suggest extra wrong choices. Correct answers always come from your family."
            checked={value.aiDistractors}
            onChange={(v) => set("aiDistractors", v)}
          />
        )}
      </div>
    </div>
  );
}
