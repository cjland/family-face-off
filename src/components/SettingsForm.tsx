"use client";

import type { GameSettings, MusicStyle } from "@/lib/settings";
import { BOARD_IDS, BOARD_INFO, DEFAULT_BOARDS } from "@/lib/boards";
import {
  formatMinutes,
  MAX_QUESTIONS,
  OVERHEAD_SECONDS_PER_QUESTION,
  plannedMinutes,
  plannedQuestions,
} from "@/lib/plan";

const PER_PERSON = [3, 4, 5, 6, 7, 8];

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
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Seconds per question</span>
          <input
            className="input !w-28"
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
        </label>
      </div>
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
              <span className="font-display text-lg font-bold">{k} each</span>
              <span className="tabular-nums">
                {q}{" "}
                {q === MAX_QUESTIONS && people * k > MAX_QUESTIONS
                  ? "(max)"
                  : ""}
              </span>
              <span className="tabular-nums">
                {formatMinutes(plannedMinutes(q, value.questionSeconds))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        Times allow about {OVERHEAD_SECONDS_PER_QUESTION} seconds per question
        for the countdown, reveal and leaderboard. You can change the number
        when you press Start, once you see who actually joined. Everyone answers
        8 questions about themselves, so a few people may not have enough
        answers for 7–8 each.
      </p>
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
  | "sound"
  | "animations"
  | "voice"
  | "boards"
  | "perPlayer"
  | "plannedPlayers"
  | "fastestBonus"
>;

export const DEFAULT_DRAFT: SettingsDraft = {
  theme: "classic",
  roundCount: 20,
  questionSeconds: 20,
  speedBonus: 0,
  autoReveal: false,
  overtimeSeconds: 5,
  autoNext: false,
  aiDistractors: false,
  music: "gameshow",
  taunts: true,
  sound: true,
  animations: true,
  voice: true,
  boards: [...DEFAULT_BOARDS],
  perPlayer: 3,
  plannedPlayers: 12,
  fastestBonus: true,
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
}: {
  value: SettingsDraft;
  onChange: (v: SettingsDraft) => void;
  aiAvailable: boolean;
}) {
  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
          <p className="text-sm text-muted">1,000 points for each right answer.</p>
          <Toggle
            id="fastestBonus"
            label="Speed bonus for the fastest right answer"
            hint="Each round the quickest right answer gets a surprise 25–50 extra points, so every round has a clear winner."
            checked={value.fastestBonus}
            onChange={(v) => set("fastestBonus", v)}
          />
        </div>
      </div>
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
          label="Auto next question"
          hint="Move on 8 seconds after each reveal."
          checked={value.autoNext}
          onChange={(v) => set("autoNext", v)}
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
