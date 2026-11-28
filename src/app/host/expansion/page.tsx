"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client/api";
import { triviaEmoji } from "@/lib/triviaCategories";
import { spokenText, VOICE, voiceInstructions } from "@/lib/voiceRecipe";

type Clip = { file: string; durationMs: number; text: string };
type Manifest = { questions: Record<string, Clip> } & Record<string, unknown>;
type Library = {
  prompts: { id: string; text: string; category: string }[];
  trivia: {
    id: string;
    question: string;
    category: string;
    seasonal: string | null;
  }[];
  custom: { id: string; audioId: string; group: string; question: string }[];
};
type Item = {
  id: string;
  kind: string;
  category: string;
  text: string;
  voiced: boolean;
};

/** Game-flow line pools in the manifest, with a plain description of when each plays. */
const POOLS: [path: string, label: string, when: string][] = [
  ["leadin.first", "Opening lines", "First question of the game"],
  ["leadin.general", "Lead-ins", "Before a question in the middle of the game"],
  ["leadin.final", "Final lead-in", "Before the last question"],
  [
    "hereComes",
    "Here comes question N",
    "Announces the question number (1–50, first, last)",
  ],
  ["number", "Question number", "Older “Question number N” lines"],
  ["countdown.intro", "Get ready", "Before the 5-4-3-2-1"],
  ["countdown.starting", "Starting in", "Countdown lead-in"],
  ["countdown.numbers", "Countdown numbers", "5, 4, 3, 2, 1, Go"],
  ["prompt", "Pick-an-answer prompts", "After the question is read"],
  ["no-audio", "No-clip fallbacks", "When a question has no recording"],
  [
    "extras",
    "Moments",
    "Ten seconds left, time's up, all locked, reveal, game over",
  ],
  ["waiting", "Lobby lines", "While people are joining"],
  ["leaderboard", "Leaderboard", "When the standings appear"],
  ["round-winner", "Round winner", "Before the round's winner"],
  ["crown", "Crown the champion", "Before the final winner"],
  ["bonus.intro", "Bonus intro", "A bonus question is coming"],
  ["bonus.easy", "Bonus: easy", "Easy bonus question"],
  ["bonus.medium", "Bonus: medium", "Medium bonus question"],
  ["bonus.hard", "Bonus: hard", "Hard bonus question"],
  ["bonus.reveal", "Bonus reveal", "Before the bonus answer"],
];

function clipsAt(m: Manifest, path: string): Clip[] {
  let v: unknown = m;
  for (const k of path.split("."))
    v = (v as Record<string, unknown> | undefined)?.[k];
  if (!v) return [];
  if (Array.isArray(v)) return v as Clip[];
  const o = v as Record<string, unknown>;
  if (typeof o.file === "string") return [o as unknown as Clip];
  return Object.values(o).flatMap((x) =>
    x && typeof x === "object" && "file" in (x as object)
      ? [x as Clip]
      : (Object.values(x as object) as Clip[]),
  );
}

const download = (name: string, text: string, type = "application/json") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * Host page for growing the game: which questions have an announcer recording and which don't,
 * the catalog of announcer lines, and how the voice was made (with a copyable instruction file).
 */
export default function ExpansionPage() {
  const [lib, setLib] = useState<Library | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMissing, setShowMissing] = useState<string | null>(null);

  useEffect(() => {
    api<Library>("/api/library")
      .then(setLib)
      .catch((e) => {
        if (e instanceof ApiClientError && e.status === 401) setSignedOut(true);
        else
          setErr(
            e instanceof Error ? e.message : "Couldn't load the questions.",
          );
      });
    fetch("/audio/manifest.json")
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setErr("Couldn't load the announcer manifest."));
  }, []);

  const items: Item[] = useMemo(() => {
    if (!lib || !manifest) return [];
    const has = (id: string) => !!manifest.questions[id];
    return [
      ...lib.prompts.map((p) => ({
        id: p.id,
        kind: "About the players",
        category: p.category,
        text: p.text,
        voiced: has(p.id),
      })),
      ...lib.trivia.map((t) => ({
        id: t.id,
        kind: t.seasonal ? `${t.seasonal} bonus` : "Trivia",
        category: t.category,
        text: t.question,
        voiced: has(t.id),
      })),
      ...lib.custom.map((c) => ({
        id: c.audioId,
        kind: "Your questions",
        category: c.group,
        text: c.question,
        voiced: has(c.audioId),
      })),
    ];
  }, [lib, manifest]);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.kind, [...(m.get(i.kind) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const triviaByCat = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items.filter((x) => x.kind === "Trivia"))
      m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const missing = items.filter((i) => !i.voiced);
  const voiced = items.length - missing.length;
  const totalClips = manifest
    ? POOLS.reduce((n, [p]) => n + clipsAt(manifest, p).length, 0)
    : 0;
  const instructions = voiceInstructions(missing.length);

  if (signedOut) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-xl px-5 py-16 flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">Expansion</h1>
          <p>Sign in as the host to see this page.</p>
          <Link className="btn btn-primary self-start" href="/host">
            Go to host sign in
          </Link>
        </main>
      </Stage>
    );
  }

  const bar = (done: number, total: number) => (
    <div
      className="h-2.5 rounded-full bg-black/30 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="h-full bg-good"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );

  return (
    <Stage theme="classic">
      <main className="mx-auto max-w-[1300px] px-5 py-8 flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" aria-label="Home">
            <TitleMark title="Family Face-Off" theme="classic" size="sm" />
          </Link>
          <Link className="btn btn-ghost !text-base" href="/host">
            ← Back to games
          </Link>
        </header>
        <div>
          <h1 className="font-display text-4xl font-bold">Expansion</h1>
          <p className="text-muted mt-1">
            What you need to know to grow the game: announcer coverage, the line
            catalog, and how the voice was made.
          </p>
        </div>
        {err && <Banner kind="error">{err}</Banner>}
        {!lib || !manifest ? (
          !err && <Spinner />
        ) : (
          <>
            {/* Coverage */}
            <section
              className="panel p-5 flex flex-col gap-4"
              aria-labelledby="coverage"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 id="coverage" className="font-display text-2xl font-bold">
                  🎙 Announcer coverage
                </h2>
                <p className="text-lg">
                  <strong className="text-good">{voiced}</strong> of{" "}
                  {items.length} questions have a voice ·{" "}
                  <strong className="text-bad">{missing.length}</strong> don’t
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-sm text-muted">
                    <tr>
                      <th className="py-2 pr-4 font-normal">Questions</th>
                      <th className="py-2 pr-4 font-normal text-right">
                        Total
                      </th>
                      <th className="py-2 pr-4 font-normal text-right">
                        🔊 Voiced
                      </th>
                      <th className="py-2 pr-4 font-normal text-right">
                        🔇 No voice
                      </th>
                      <th className="py-2 w-[30%] font-normal">
                        <span className="sr-only">Progress</span>
                      </th>
                      <th className="py-2 font-normal">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([kind, list]) => {
                      const v = list.filter((i) => i.voiced).length;
                      return (
                        <tr key={kind} className="border-t border-white/10">
                          <td className="py-2 pr-4 font-semibold">{kind}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {list.length}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {v}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {list.length - v}
                          </td>
                          <td className="py-2 pr-4">{bar(v, list.length)}</td>
                          <td className="py-2">
                            {list.length - v > 0 && (
                              <button
                                className="text-sm underline"
                                onClick={() =>
                                  setShowMissing(
                                    showMissing === kind ? null : kind,
                                  )
                                }
                              >
                                {showMissing === kind ? "Hide" : "Show missing"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {showMissing && (
                <ul className="max-h-72 overflow-y-auto rounded-xl bg-black/25 p-3 text-sm flex flex-col gap-1">
                  {missing
                    .filter((i) => i.kind === showMissing)
                    .map((i) => (
                      <li key={i.id}>
                        <code className="text-accent-2">{i.id}</code> · {i.text}
                      </li>
                    ))}
                </ul>
              )}
              {triviaByCat.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-semibold">
                    Trivia by category
                  </summary>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 mt-2 text-sm">
                    {triviaByCat.map(([cat, list]) => {
                      const v = list.filter((i) => i.voiced).length;
                      return (
                        <div
                          key={cat}
                          className="flex items-center justify-between gap-2 border-b border-white/10 py-1"
                        >
                          <span>
                            {triviaEmoji(cat)} {cat}
                          </span>
                          <span className="tabular-nums text-muted">
                            {v}/{list.length} voiced
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary !text-base"
                  disabled={!missing.length}
                  onClick={() =>
                    download(
                      "questions-missing-voice.json",
                      JSON.stringify(
                        missing.map((i) => ({
                          id: i.id,
                          kind: i.kind,
                          category: i.category,
                          text: i.text,
                          spoken_text: spokenText(i.text),
                          file: `questions/${i.id}.mp3`,
                        })),
                        null,
                        2,
                      ),
                    )
                  }
                >
                  ⬇ Download missing list ({missing.length})
                </button>
                <button
                  className="btn btn-ghost !text-base"
                  onClick={() =>
                    download(
                      "questions-missing-voice.csv",
                      [
                        "id,kind,category,text,spoken_text,file",
                        ...missing.map((i) =>
                          [
                            i.id,
                            i.kind,
                            i.category,
                            i.text,
                            spokenText(i.text),
                            `questions/${i.id}.mp3`,
                          ]
                            .map((c) => `"${c.replace(/"/g, '""')}"`)
                            .join(","),
                        ),
                      ].join("\n"),
                      "text/csv",
                    )
                  }
                >
                  ⬇ As CSV
                </button>
              </div>
            </section>

            {/* Voice recipe */}
            <section
              className="panel p-5 flex flex-col gap-3"
              aria-labelledby="recipe"
            >
              <h2 id="recipe" className="font-display text-2xl font-bold">
                🧪 How the voice was made
              </h2>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">Service</dt>
                <dd>{VOICE.service}</dd>
                <dt className="text-muted">Voice</dt>
                <dd>
                  {VOICE.voiceName}{" "}
                  <code className="text-accent-2">{VOICE.voiceId}</code>
                </dd>
                <dt className="text-muted">Model</dt>
                <dd>
                  <code>{VOICE.model}</code>
                </dd>
                <dt className="text-muted">Settings</dt>
                <dd>
                  <code className="break-all">
                    {JSON.stringify(VOICE.settings)}
                  </code>
                </dd>
                <dt className="text-muted">Output</dt>
                <dd>
                  <code>{VOICE.outputFormat}</code>, {VOICE.gapMs} ms between
                  clips
                </dd>
                <dt className="text-muted">License</dt>
                <dd className="text-sm">{VOICE.plan}</dd>
              </dl>
              <p className="text-sm text-muted">
                Copy this instruction file into a model (or hand it to whoever
                records the clips) together with the missing list above.
              </p>
              <pre className="max-h-80 overflow-auto rounded-xl bg-black/35 p-4 text-sm whitespace-pre-wrap">
                {instructions}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary !text-base"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(instructions);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "✓ Copied" : "📋 Copy instructions"}
                </button>
                <button
                  className="btn btn-ghost !text-base"
                  onClick={() =>
                    download(
                      "ANNOUNCER-VOICE.md",
                      instructions,
                      "text/markdown",
                    )
                  }
                >
                  ⬇ Download as .md
                </button>
              </div>
            </section>

            {/* Line catalog */}
            <section
              className="panel p-5 flex flex-col gap-3"
              aria-labelledby="catalog"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 id="catalog" className="font-display text-2xl font-bold">
                  📖 Announcer line catalog
                </h2>
                <p className="text-muted">
                  {totalClips} game-flow lines (plus the question clips above)
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {POOLS.map(([path, label, when]) => {
                  const clips = clipsAt(manifest, path);
                  if (!clips.length) return null;
                  return (
                    <details
                      key={path}
                      className="rounded-xl bg-black/20 px-3 py-2"
                    >
                      <summary className="cursor-pointer">
                        <span className="font-semibold">{label}</span>{" "}
                        <span className="text-sm text-muted">
                          · {clips.length} · {when}
                        </span>
                      </summary>
                      <ul className="mt-2 flex flex-col gap-0.5 text-sm">
                        {clips.map((c) => (
                          <li
                            key={c.file}
                            className="flex justify-between gap-3"
                          >
                            <span>“{c.text}”</span>
                            <code className="text-muted shrink-0">
                              {c.file.replace(/\.mp3$/, "")}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
              <button
                className="btn btn-ghost !text-base self-start"
                onClick={() =>
                  download(
                    "announcer-lines.json",
                    JSON.stringify(
                      Object.fromEntries(
                        POOLS.map(([p, label, when]) => [
                          p,
                          {
                            label,
                            when,
                            lines: clipsAt(manifest, p).map((c) => ({
                              file: c.file,
                              text: c.text,
                            })),
                          },
                        ]),
                      ),
                      null,
                      2,
                    ),
                  )
                }
              >
                ⬇ Download catalog
              </button>
            </section>
          </>
        )}
      </main>
    </Stage>
  );
}
