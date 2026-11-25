"use client";

import type { GameSettings, MusicStyle } from "@/lib/settings";

export type SettingsDraft = Pick<
  GameSettings,
  "theme" | "roundCount" | "questionSeconds" | "speedBonus" | "autoReveal" | "overtimeSeconds" | "autoNext" | "aiDistractors" | "music" | "taunts"
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
};

const MUSIC_LABELS: [MusicStyle, string][] = [
  ["gameshow", "Game show"],
  ["suspense", "Tick-tock suspense"],
  ["lounge", "Lounge jazz"],
  ["off", "No music"],
];

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer py-1">
      <input id={id} type="checkbox" className="mt-1 h-6 w-6 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="font-semibold mb-2">Theme</legend>
        <div className="flex gap-3 flex-wrap">
          {(
            [
              ["classic", "Classic game show"],
              ["thanksgiving", "Thanksgiving"],
            ] as const
          ).map(([t, label]) => (
            <label key={t} className={`btn ${value.theme === t ? "btn-primary" : "btn-ghost"} !text-base`}>
              <input type="radio" name="theme" value={t} checked={value.theme === t} onChange={() => set("theme", t)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Questions (if not set at start)</span>
        <input
          className="input"
          type="number"
          min={1}
          max={80}
          value={value.roundCount}
          onChange={(e) => set("roundCount", Math.max(1, Math.min(80, Number(e.target.value) || 1)))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Seconds per question</span>
        <input
          className="input"
          type="number"
          min={5}
          max={120}
          value={value.questionSeconds}
          onChange={(e) => set("questionSeconds", Math.max(5, Math.min(120, Number(e.target.value) || 20)))}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="font-semibold">Speed bonus: {value.speedBonus === 0 ? "off" : `up to +${value.speedBonus}`}</span>
        <input
          type="range"
          min={0}
          max={500}
          step={50}
          value={value.speedBonus}
          onChange={(e) => set("speedBonus", Number(e.target.value))}
          className="accent-[var(--accent)] h-8"
          aria-describedby="speed-hint"
        />
        <span id="speed-hint" className="text-sm text-muted">
          Correct answers score 1,000. A speed bonus adds extra points for answering quickly.
        </span>
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="font-semibold mb-2">Music while people choose</legend>
        <div className="flex gap-2 flex-wrap">
          {MUSIC_LABELS.map(([m, label]) => (
            <label key={m} className={`btn ${value.music === m ? "btn-primary" : "btn-ghost"} !text-base`}>
              <input type="radio" name="music" value={m} checked={value.music === m} onChange={() => set("music", m)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <span className="text-sm text-muted">Plays on the TV after you press &quot;Enable sound&quot; there.</span>
      </fieldset>
      <div className="sm:col-span-2 grid gap-1">
        <Toggle
          id="taunts"
          label="Tease slowpokes"
          hint="The TV playfully calls out whoever hasn't locked in yet (&quot;Hurry up, Ben!&quot;)."
          checked={value.taunts}
          onChange={(v) => set("taunts", v)}
        />
        <Toggle
          id="autoReveal"
          label="Auto reveal"
          hint="Reveal as soon as everyone has answered, or a few seconds after time runs out (late answers still count)."
          checked={value.autoReveal}
          onChange={(v) => set("autoReveal", v)}
        />
        {value.autoReveal && (
          <div className="flex items-center gap-2 flex-wrap pl-9" role="radiogroup" aria-label="Wait after time runs out">
            <span className="text-sm text-muted">After time runs out, wait</span>
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
        <Toggle id="autoNext" label="Auto next question" hint="Move on 8 seconds after each reveal." checked={value.autoNext} onChange={(v) => set("autoNext", v)} />
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
