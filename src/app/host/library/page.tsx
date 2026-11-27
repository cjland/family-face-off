"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client/api";
import {
  EMPTY_PICKS,
  loadPicks,
  savePicks,
  type Picks,
} from "@/lib/client/picks";

type Library = {
  prompts: {
    id: string;
    text: string;
    category: string;
    common: boolean;
    seasonal: string | null;
    answers: { text: string; funny: boolean }[];
  }[];
  trivia: {
    id: string;
    question: string;
    category: string;
    difficulty: string;
    seasonal: string | null;
    options: string[];
    correctIndex: number;
  }[];
  custom: {
    id: string;
    group: string;
    genre: string;
    difficulty: string;
    question: string;
    options: string[];
    correctIndex: number;
  }[];
};

type Tab = "about" | "trivia" | "custom";

/** One row in the list, whatever kind of question it is. */
type Row = {
  id: string;
  text: string;
  category: string;
  badges: string[];
  difficulty?: string;
  kind: "prompt" | "question";
  answers: { text: string; good?: boolean; funny?: boolean }[];
};

const TABS: { id: Tab; label: string; about: string }[] = [
  {
    id: "about",
    label: "About the players",
    about:
      "Players answer 8 of these about themselves; the game asks everyone to guess. Pick at least 8.",
  },
  {
    id: "trivia",
    label: "Trivia",
    about:
      "Built-in trivia for Quiz mode, and the bonus questions in Get Personal games.",
  },
  {
    id: "custom",
    label: "Your questions",
    about: "Questions you uploaded with the template, by group.",
  },
];

/**
 * Host page: browse every question by category, look at the answers, and pick a set to build
 * a game from. Picks stay in this browser until "Create a game with these".
 */
export default function LibraryPage() {
  const router = useRouter();
  const [lib, setLib] = useState<Library | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picks, setPicksState] = useState<Picks>(EMPTY_PICKS);

  useEffect(() => {
    const t = setTimeout(() => setPicksState(loadPicks()), 0);
    api<Library>("/api/library")
      .then(setLib)
      .catch((e) => {
        if (e instanceof ApiClientError && e.status === 401) setSignedOut(true);
        else
          setErr(
            e instanceof Error ? e.message : "Couldn't load the questions.",
          );
      });
    return () => clearTimeout(t);
  }, []);

  const setPicks = (p: Picks) => {
    setPicksState(p);
    savePicks(p);
  };

  const rows: Record<Tab, Row[]> = useMemo(() => {
    if (!lib) return { about: [], trivia: [], custom: [] };
    return {
      about: lib.prompts.map((p) => ({
        id: p.id,
        text: p.text,
        category: p.category,
        badges: [
          ...(p.common ? ["Everyone gets this"] : []),
          ...(p.seasonal ? [p.seasonal] : []),
        ],
        kind: "prompt",
        answers: p.answers.map((a) => ({ text: a.text, funny: a.funny })),
      })),
      trivia: lib.trivia.map((t) => ({
        id: t.id,
        text: t.question,
        category: t.category,
        badges: t.seasonal ? [t.seasonal] : [],
        difficulty: t.difficulty,
        kind: "question",
        answers: t.options.map((o, i) => ({
          text: o,
          good: i === t.correctIndex,
        })),
      })),
      custom: lib.custom.map((c) => ({
        id: c.id,
        text: c.question,
        category: c.group,
        badges: c.genre ? [c.genre] : [],
        difficulty: c.difficulty,
        kind: "question",
        answers: c.options.map((o, i) => ({
          text: o,
          good: i === c.correctIndex,
        })),
      })),
    };
  }, [lib]);

  const isPicked = (r: Row) =>
    (r.kind === "prompt" ? picks.promptIds : picks.questionIds).includes(r.id);
  const pickMany = (list: Row[], on: boolean) => {
    const next = {
      promptIds: new Set(picks.promptIds),
      questionIds: new Set(picks.questionIds),
    };
    for (const r of list) {
      const set = r.kind === "prompt" ? next.promptIds : next.questionIds;
      if (on) set.add(r.id);
      else set.delete(r.id);
    }
    setPicks({
      promptIds: [...next.promptIds],
      questionIds: [...next.questionIds],
    });
  };

  const all = rows[tab];
  const categories = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of all) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return [...m.entries()];
  }, [all]);
  const q = search.trim().toLowerCase();
  const shown = all.filter(
    (r) =>
      (category === "all" || r.category === category) &&
      (difficulty === "all" || r.difficulty === difficulty) &&
      (!onlyPicked || isPicked(r)) &&
      (!q ||
        r.text.toLowerCase().includes(q) ||
        r.answers.some((a) => a.text.toLowerCase().includes(q))),
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    setCategory("all");
    setDifficulty("all");
  };
  const pickedIn = (t: Tab) => rows[t].filter(isPicked).length;
  const nPrompts = picks.promptIds.length;
  const nQuestions = picks.questionIds.length;

  if (signedOut) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-xl px-5 py-16 flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">Question library</h1>
          <p>Sign in as the host to see the questions.</p>
          <Link className="btn btn-primary self-start" href="/host">
            Go to host sign in
          </Link>
        </main>
      </Stage>
    );
  }

  return (
    <Stage theme="classic">
      <main className="mx-auto max-w-[1500px] px-5 py-8 pb-40 flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" aria-label="Home">
            <TitleMark title="Family Face-Off" theme="classic" size="sm" />
          </Link>
          <Link className="btn btn-ghost !text-base" href="/host">
            ← Back to games
          </Link>
        </header>
        <div>
          <h1 className="font-display text-4xl font-bold">Question library</h1>
          <p className="text-muted mt-1">
            Browse by category, open a question to see its answers, and tick the
            ones you want. Then create a game from your picks.
          </p>
        </div>
        {err && <Banner kind="error">{err}</Banner>}
        {!lib && !err ? (
          <Spinner />
        ) : (
          <>
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Question types"
            >
              {TABS.map((t) => {
                const on = tab === t.id;
                const n = pickedIn(t.id);
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={on}
                    className={`btn !text-base ${on ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => switchTab(t.id)}
                  >
                    {t.label}{" "}
                    <span className="opacity-75">({rows[t.id].length})</span>
                    {n > 0 && (
                      <span className="ml-1 rounded-full bg-black/30 px-2 text-sm">
                        ✓ {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted -mt-3">
              {TABS.find((t) => t.id === tab)?.about}
            </p>

            {all.length === 0 ? (
              <div className="panel p-6">
                {tab === "custom" ? (
                  <p>
                    No uploaded questions yet. Use{" "}
                    <strong>Question library → Upload CSV</strong> on the{" "}
                    <Link className="underline" href="/host">
                      games page
                    </Link>{" "}
                    to add some.
                  </p>
                ) : (
                  <p>No questions here.</p>
                )}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
                <nav
                  aria-label="Categories"
                  className="panel p-3 flex flex-col gap-1 self-start lg:sticky lg:top-4"
                >
                  <CategoryButton
                    label="All categories"
                    count={all.length}
                    picked={pickedIn(tab)}
                    on={category === "all"}
                    onClick={() => setCategory("all")}
                  />
                  {categories.map(([name, list]) => (
                    <CategoryButton
                      key={name}
                      label={name}
                      count={list.length}
                      picked={list.filter(isPicked).length}
                      on={category === name}
                      onClick={() => setCategory(name)}
                    />
                  ))}
                </nav>

                <section className="flex flex-col gap-3" aria-label="Questions">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex-1 min-w-[220px]">
                      <span className="sr-only">
                        Search questions and answers
                      </span>
                      <input
                        className="input w-full"
                        placeholder="Search questions and answers…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    {tab !== "about" && (
                      <label className="flex items-center gap-2">
                        <span className="text-sm">Difficulty</span>
                        <select
                          className="input !min-h-[44px]"
                          value={difficulty}
                          onChange={(e) => setDifficulty(e.target.value)}
                        >
                          <option value="all">Any</option>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--accent)]"
                        checked={onlyPicked}
                        onChange={(e) => setOnlyPicked(e.target.checked)}
                      />
                      <span className="text-sm">Only picked</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted">
                      Showing {shown.length} of {all.length}
                    </span>
                    <button
                      className="btn btn-ghost !text-sm !min-h-[36px] !py-1"
                      disabled={!shown.length}
                      onClick={() => pickMany(shown, true)}
                    >
                      Pick all shown
                    </button>
                    <button
                      className="btn btn-ghost !text-sm !min-h-[36px] !py-1"
                      disabled={!shown.some(isPicked)}
                      onClick={() => pickMany(shown, false)}
                    >
                      Unpick all shown
                    </button>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {shown.map((r) => {
                      const picked = isPicked(r);
                      const expanded = open.has(r.id);
                      return (
                        <li
                          key={r.id}
                          className={`panel !rounded-xl px-4 py-3 border ${picked ? "border-accent" : "border-transparent"}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              id={`pick-${r.id}`}
                              type="checkbox"
                              className="mt-1 h-6 w-6 shrink-0 accent-[var(--accent)]"
                              checked={picked}
                              onChange={(e) => pickMany([r], e.target.checked)}
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`pick-${r.id}`}
                                className="font-semibold cursor-pointer"
                              >
                                {r.text}
                              </label>
                              <div className="flex flex-wrap gap-1.5 mt-1 text-xs">
                                <span className="rounded-full bg-white/10 px-2 py-0.5">
                                  {r.category}
                                </span>
                                {r.difficulty && (
                                  <span className="rounded-full bg-white/10 px-2 py-0.5 capitalize">
                                    {r.difficulty}
                                  </span>
                                )}
                                {r.badges.map((b) => (
                                  <span
                                    key={b}
                                    className="rounded-full bg-accent/20 px-2 py-0.5"
                                  >
                                    {b}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              className="btn btn-ghost !text-sm !min-h-[36px] !py-1 shrink-0"
                              aria-expanded={expanded}
                              onClick={() => {
                                const next = new Set(open);
                                if (expanded) next.delete(r.id);
                                else next.add(r.id);
                                setOpen(next);
                              }}
                            >
                              {expanded
                                ? "Hide answers"
                                : `Answers (${r.answers.length})`}
                            </button>
                          </div>
                          {expanded && (
                            <ul
                              className="flex flex-wrap gap-1.5 mt-3 ml-9"
                              aria-label="Answers"
                            >
                              {r.answers.map((a, i) => (
                                <li
                                  key={i}
                                  className={`rounded-lg px-2.5 py-1 text-sm ${a.good ? "bg-good/25 border border-good font-semibold" : "bg-black/25"}`}
                                >
                                  {a.good && (
                                    <span aria-label="Correct answer">✓ </span>
                                  )}
                                  {a.text}
                                  {a.funny && (
                                    <span
                                      className="ml-1"
                                      role="img"
                                      aria-label="funny answer"
                                    >
                                      😄
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {shown.length === 0 && (
                    <p className="text-muted">
                      Nothing matches. Try another category or search.
                    </p>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      {/* Picks bar: always visible at the bottom. */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-white/15 bg-[#0b0620]/95 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <p className="font-semibold">
              Picked: {nPrompts} about the players · {nQuestions} trivia / your
              questions
            </p>
            <p className="text-sm text-muted">
              {nPrompts > 0 && nPrompts < 8
                ? `Pick ${8 - nPrompts} more about-the-players question${8 - nPrompts === 1 ? "" : "s"} (everyone answers 8), or the rest will come from the full list.`
                : nPrompts >= 8
                  ? "Get Personal game: players answer from your picks" +
                    (nQuestions
                      ? "; bonus trivia comes from your trivia picks."
                      : ".")
                  : nQuestions
                    ? "Quiz game using only your picked questions."
                    : "Tick questions to build a game from them."}
            </p>
          </div>
          <button
            className="btn btn-ghost !text-base"
            disabled={!nPrompts && !nQuestions}
            onClick={() => setPicks(EMPTY_PICKS)}
          >
            Clear picks
          </button>
          <button
            className="btn btn-primary !text-base"
            disabled={!nPrompts && !nQuestions}
            onClick={() => router.push("/host?picks=1")}
          >
            Create a game with these →
          </button>
        </div>
      </div>
    </Stage>
  );
}

function CategoryButton({
  label,
  count,
  picked,
  on,
  onClick,
}: {
  label: string;
  count: number;
  picked: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left min-h-[44px] ${on ? "bg-accent/20 font-semibold" : "hover:bg-white/10"}`}
    >
      <span>{label}</span>
      <span className="text-sm text-muted shrink-0">
        {picked > 0 && <span className="text-accent mr-1">✓{picked}</span>}
        {count}
      </span>
    </button>
  );
}
