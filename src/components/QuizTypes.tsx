"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import {
  BUILT_IN_QUIZZES,
  DIFFICULTY_LABEL,
  quizSettings,
  TRIVIA_DIFFICULTIES,
  type QuizPreset,
  type TriviaDifficulty,
} from "@/lib/quizPresets";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";

type Count = { category: string; difficulty: string; n: number };
type Value = {
  triviaCategories: string[];
  triviaDifficulty: TriviaDifficulty;
  roundCount: number;
  quizName?: string;
};
const EMOJIS = [
  "🎯",
  "🏆",
  "🎉",
  "🧠",
  "🍿",
  "🏈",
  "🌍",
  "🎵",
  "🦃",
  "🎄",
  "🎂",
  "🚀",
  "🐾",
  "📚",
];

/** How many trivia questions match these categories and difficulty (holiday questions aside). */
function available(
  counts: Count[],
  categories: string[],
  difficulty: TriviaDifficulty,
) {
  return counts
    .filter(
      (c) =>
        (!categories.length || categories.includes(c.category)) &&
        (difficulty === "mixed" || c.difficulty === difficulty),
    )
    .reduce((n, c) => n + c.n, 0);
}

/**
 * Quiz mode: pick a ready-made quiz type or one you designed, or design a new one (categories,
 * difficulty, number of questions) and save it for next time.
 */
export function QuizTypes({
  value,
  apply,
}: {
  value: Value;
  apply: (patch: ReturnType<typeof quizSettings>) => void;
}) {
  const [mine, setMine] = useState<QuizPreset[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [designing, setDesigning] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    emoji: "🎯",
    categories: [] as string[],
    difficulty: "mixed" as TriviaDifficulty,
    questions: 15,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ quizzes: QuizPreset[]; counts: Count[] }>("/api/quizzes")
      .then((r) => {
        setMine(r.quizzes);
        setCounts(r.counts);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => [...BUILT_IN_QUIZZES, ...mine], [mine]);
  const isCurrent = (q: QuizPreset) =>
    value.quizName === `${q.emoji} ${q.name}`;
  const draftAvailable = available(counts, draft.categories, draft.difficulty);

  const save = async (andUse: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ quiz: QuizPreset }>("/api/quizzes", {
        method: "POST",
        body: {
          ...draft,
          questions: Math.min(
            draft.questions,
            Math.max(1, draftAvailable || draft.questions),
          ),
          about: draft.categories.length
            ? draft.categories.join(", ")
            : "All categories",
        },
      });
      load();
      if (andUse) apply(quizSettings(r.quiz));
      setDesigning(false);
      setDraft({
        name: "",
        emoji: "🎯",
        categories: [],
        difficulty: "mixed",
        questions: 15,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the quiz.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-semibold">Quiz type</span>
        <span className="text-sm text-muted">
          {value.quizName
            ? `Using ${value.quizName}`
            : "Pick one, or design your own"}{" "}
          ·{" "}
          {value.triviaCategories.length
            ? `${value.triviaCategories.length} categories`
            : "all categories"}{" "}
          · {DIFFICULTY_LABEL[value.triviaDifficulty]} · {value.roundCount}{" "}
          questions
        </span>
      </div>
      <div
        className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2"
        role="radiogroup"
        aria-label="Quiz type"
      >
        {all.map((q) => {
          const on = isCurrent(q);
          const n = counts.length
            ? available(counts, q.categories, q.difficulty)
            : null;
          return (
            <div
              key={q.id}
              className={`relative rounded-xl border px-3 py-2 ${on ? "border-accent bg-accent/15" : "border-white/15 bg-black/20 hover:border-white/40"}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                className="text-left w-full"
                onClick={() => apply(quizSettings(q))}
              >
                <span className="font-display font-bold block">
                  <span className="emoji-plain" aria-hidden="true">
                    {q.emoji}
                  </span>{" "}
                  {q.name}
                </span>
                <span className="block text-xs text-muted leading-snug">
                  {q.about}
                </span>
                <span className="block text-xs text-accent-2 mt-0.5">
                  {q.questions} questions · {DIFFICULTY_LABEL[q.difficulty]}
                  {n !== null && n < q.questions
                    ? ` · only ${n} available`
                    : ""}
                </span>
              </button>
              {!q.builtIn && (
                <button
                  type="button"
                  className="absolute top-1 right-2 text-xs underline text-muted"
                  aria-label={`Delete quiz type ${q.name}`}
                  onClick={async () => {
                    if (!confirm(`Delete the quiz type “${q.name}”?`)) return;
                    await api(`/api/quizzes/${q.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  delete
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="rounded-xl border border-dashed border-white/30 px-3 py-2 text-left hover:border-accent"
          aria-expanded={designing}
          onClick={() => setDesigning(!designing)}
        >
          <span className="font-display font-bold block">＋ Design a quiz</span>
          <span className="block text-xs text-muted">
            Choose categories, difficulty and length; save it for next time
          </span>
        </button>
      </div>

      {designing && (
        <div className="rounded-xl border border-accent bg-black/25 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="font-semibold">Name</span>
              <input
                className="input"
                maxLength={40}
                placeholder="e.g. Grandpa's Sports Quiz"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Icon</span>
              <div
                className="flex flex-wrap gap-1"
                role="radiogroup"
                aria-label="Icon"
              >
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={draft.emoji === e}
                    className={`w-10 h-10 rounded-lg text-xl emoji-plain ${draft.emoji === e ? "bg-accent/30 ring-2 ring-accent" : "bg-black/25"}`}
                    onClick={() => setDraft({ ...draft, emoji: e })}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">
              Categories{" "}
              {draft.categories.length
                ? `(${draft.categories.length})`
                : "(none = all)"}
            </span>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Quiz categories"
            >
              {TRIVIA_CATEGORIES.map((c) => {
                const on = draft.categories.includes(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        categories: on
                          ? draft.categories.filter((x) => x !== c.name)
                          : [...draft.categories, c.name],
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm min-h-[40px] ${on ? "border-accent bg-accent/25 font-semibold" : "border-white/15 bg-black/20 hover:border-white/40"}`}
                  >
                    <span className="emoji-plain" aria-hidden="true">
                      {c.emoji}
                    </span>{" "}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-6 items-end">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Difficulty</span>
              <div
                className="flex gap-1 flex-wrap"
                role="radiogroup"
                aria-label="Difficulty"
              >
                {TRIVIA_DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={draft.difficulty === d}
                    className={`btn ${draft.difficulty === d ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                    onClick={() => setDraft({ ...draft, difficulty: d })}
                  >
                    {DIFFICULTY_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Questions</span>
              <div
                className="flex gap-1 flex-wrap"
                role="radiogroup"
                aria-label="Number of questions"
              >
                {[10, 15, 20, 25, 30].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={draft.questions === n}
                    className={`btn ${draft.questions === n ? "btn-primary" : "btn-ghost"} !min-h-[40px] !px-3 !text-sm`}
                    onClick={() => setDraft({ ...draft, questions: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p
              className={`text-sm ${draftAvailable < draft.questions ? "text-bad" : "text-muted"}`}
            >
              {draftAvailable} questions match
              {draftAvailable < draft.questions
                ? ` — the quiz will have ${draftAvailable}`
                : ""}
            </p>
          </div>
          {err && <p className="text-bad text-sm">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary !text-base"
              disabled={busy || !draft.name.trim() || !draftAvailable}
              onClick={() => save(true)}
            >
              Save &amp; use this quiz
            </button>
            <button
              type="button"
              className="btn btn-ghost !text-base"
              disabled={busy || !draft.name.trim() || !draftAvailable}
              onClick={() => save(false)}
            >
              Just save it
            </button>
            <button
              type="button"
              className="btn btn-ghost !text-base"
              onClick={() => setDesigning(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
