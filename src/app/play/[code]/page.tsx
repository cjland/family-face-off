"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Questionnaire } from "@/components/Questionnaire";
import { AnswerTile, Avatar, Banner, CountdownRing, LETTERS, Leaderboard, Spinner, Stage, TitleMark } from "@/components/ui";
import { useGameState, useServerNow } from "@/hooks/useGameState";
import { api, ApiClientError } from "@/lib/client/api";
import type { GameStateDTO } from "@/lib/dto";
import { ordinalLabel } from "@/lib/scoring";

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toUpperCase();
  const { state, error, offsetMs, refresh } = useGameState(`/api/games/${code}/state?view=player`);

  useEffect(() => {
    if (error?.status === 401) router.replace(`/join/${code}`);
  }, [error, code, router]);

  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem("ffo_theme_hint", state.theme);
    } catch {
      /* ignore */
    }
  }, [state]);

  if (error && error.status === 404) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-md px-5 py-16 flex flex-col gap-4">
          <Banner kind="error">{error.message}</Banner>
          <Link href="/" className="btn btn-primary">
            Back to start
          </Link>
        </main>
      </Stage>
    );
  }
  if (!state || !state.me) {
    return (
      <Stage theme={state?.theme ?? "classic"}>
        <Spinner label="Connecting" />
      </Stage>
    );
  }

  const me = state.me;
  return (
    <Stage theme={state.theme}>
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={me.name} size={40} />
            <span className="font-semibold truncate">{me.name}</span>
          </div>
          <span className="panel px-3 py-1 font-display text-lg tabular-nums" aria-label={`Your score: ${me.points} points`}>
            {me.points.toLocaleString()} pts
          </span>
        </header>
        {error && error.status === 0 && <Banner kind="error">{error.message}</Banner>}
        <PlayBody state={state} code={code} offsetMs={offsetMs} refresh={refresh} />
      </main>
    </Stage>
  );
}

function PlayBody({ state, code, offsetMs, refresh }: { state: GameStateDTO; code: string; offsetMs: number; refresh: () => void }) {
  const me = state.me!;

  if (!me.active) {
    return (
      <Centered title="You're watching this one">
        The host started before your questions were finished, so you&apos;re a spectator this round. Enjoy the show on the TV!
      </Centered>
    );
  }

  switch (state.phase) {
    case "LOBBY":
      return me.ready ? <ReadyWait state={state} code={code} refresh={refresh} /> : <Questionnaire code={code} onReady={refresh} />;
    case "PREPARING":
      return (
        <Centered title="Get ready!">
          Everyone&apos;s in. The host is about to start the first question. Keep this screen open.
        </Centered>
      );
    case "QUESTION":
      return <QuestionScreen key={state.round?.id} state={state} code={code} offsetMs={offsetMs} refresh={refresh} />;
    case "REVEAL":
      return <RevealScreen state={state} />;
    case "FINISHED":
      return <FinalScreen state={state} />;
    default:
      return <Centered title="Game closed">This game is no longer running.</Centered>;
  }
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10 pop-in">
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      <p className="text-lg text-muted max-w-sm">{children}</p>
    </section>
  );
}

function ReadyWait({ state, code, refresh }: { state: GameStateDTO; code: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-5 pop-in">
      <div className="text-center flex flex-col gap-2 py-4">
        <div className="text-6xl" aria-hidden="true">
          ✅
        </div>
        <h1 className="font-display text-4xl font-bold">You&apos;re ready!</h1>
        <p className="text-muted">Waiting for the host to start. Look at the TV!</p>
      </div>
      <div className="panel p-4">
        <p className="font-semibold mb-3" aria-live="polite">
          {state.counts.ready} of {state.counts.players} players ready
        </p>
        <ul className="flex flex-wrap gap-2">
          {state.lobby?.map((p) => (
            <li key={p.id} className={`rounded-full px-3 py-1 text-sm ${p.ready ? "bg-good/25" : "bg-black/25 text-muted"}`}>
              {p.ready ? "✔ " : ""}
              {p.name}
            </li>
          ))}
        </ul>
      </div>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await api(`/api/games/${code}/ready`, { method: "POST", body: { ready: false } }).catch(() => {});
          refresh();
          setBusy(false);
        }}
      >
        Edit my answers
      </button>
    </section>
  );
}

function QuestionScreen({ state, code, offsetMs, refresh }: { state: GameStateDTO; code: string; offsetMs: number; refresh: () => void }) {
  const round = state.round!;
  const me = state.me!;
  const now = useServerNow(offsetMs, !round.paused);
  const remaining = round.paused || !round.deadlineAt || !now ? round.remainingMs : Math.max(0, new Date(round.deadlineAt).getTime() - now);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = me.lockedOptionId;
  const timeUp = remaining <= 0 && !round.paused;

  if (me.isSubject) {
    return (
      <Centered title="This one's about you! 🎉">
        Sit back and watch everyone guess your answer. You don&apos;t score on your own question.
      </Centered>
    );
  }

  const lock = async () => {
    if (!selected || submitting || locked) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/games/${code}/guess`, { method: "POST", body: { roundId: round.id, optionId: selected } });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't lock that in. Try again.");
    } finally {
      setSubmitting(false);
      refresh();
    }
  };

  const disabled = Boolean(locked) || submitting || round.paused || timeUp;
  const lockedIndex = round.options.findIndex((o) => o.id === locked);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-accent-2">
          Q{round.number} of {round.total}
        </span>
        <CountdownRing remainingMs={remaining} durationMs={round.durationMs} paused={round.paused} size={72} />
      </div>
      <h1 className="font-display text-2xl font-bold leading-snug">{round.questionText}</h1>
      {round.clue && (
        <p className="panel px-4 py-3 text-xl font-display">
          “{round.clue}” <span className="block text-sm text-muted font-sans">answer to: {round.promptText}</span>
        </p>
      )}
      {round.paused && <Banner kind="info">The host paused the game.</Banner>}
      <div className="grid gap-3" role="group" aria-label="Answer choices">
        {round.options.map((o, i) => (
          <AnswerTile
            key={o.id}
            index={i}
            option={o}
            size="lg"
            state={locked ? (o.id === locked ? "selected" : "dim") : selected === o.id ? "selected" : "idle"}
            onClick={() => !disabled && setSelected(o.id)}
            disabled={disabled}
          />
        ))}
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {locked ? (
        <div className="panel p-4 text-center pop-in" role="status">
          <span className="font-display text-2xl">🔒 Locked in: {LETTERS[lockedIndex] ?? ""}</span>
          <span className="block text-muted text-sm mt-1">
            {round.answeredCount} of {round.eligibleCount} have answered
          </span>
        </div>
      ) : timeUp ? (
        <Banner kind="info">Time&apos;s up! Waiting for the reveal…</Banner>
      ) : (
        <button className="btn btn-primary text-xl" disabled={!selected || disabled} onClick={lock}>
          {submitting ? "Locking…" : selected ? `Lock in ${LETTERS[round.options.findIndex((o) => o.id === selected)]}` : "Pick an answer"}
        </button>
      )}
    </section>
  );
}

function RevealScreen({ state }: { state: GameStateDTO }) {
  const me = state.me!;
  const round = state.round!;
  const reveal = state.reveal;
  if (!reveal) return <Centered title="Revealing…">Look at the TV!</Centered>;
  const correct = round.options.find((o) => o.id === reveal.correctOptionId);
  const result = me.lastResult;
  let title = "Here's the answer";
  let tone = "";
  if (me.isSubject) title = "That was about you!";
  else if (result?.correct) {
    title = "Nailed it! 🎉";
    tone = "text-good";
  } else if (result && !result.answered) title = "Missed that one";
  else if (result) title = "Not this time";
  return (
    <section className="flex flex-col gap-5 pop-in">
      <div className="text-center flex flex-col gap-1 py-2">
        <h1 className={`font-display text-4xl font-bold ${tone}`}>{title}</h1>
        {result && !me.isSubject && (
          <p className="text-2xl font-display">{result.correct ? `+${result.points.toLocaleString()} points` : "No points this round"}</p>
        )}
      </div>
      <div className="panel p-4">
        <p className="text-sm text-muted">Correct answer</p>
        <p className="font-display text-3xl font-bold break-words">{correct?.label ?? reveal.answerText}</p>
        <p className="mt-1">{reveal.subjectName} submitted this!</p>
      </div>
      {me.rank && (
        <p className="text-center text-xl">
          You&apos;re in <strong className="font-display text-accent-2 text-2xl">{ordinalLabel(me.rank)}</strong> place
        </p>
      )}
      {state.standings && <Leaderboard standings={state.standings} highlightId={me.id} pageSize={5} />}
    </section>
  );
}

function FinalScreen({ state }: { state: GameStateDTO }) {
  const me = state.me!;
  return (
    <section className="flex flex-col gap-5 pop-in">
      <div className="text-center py-4 flex flex-col gap-2">
        <TitleMark title="Game over!" theme={state.theme} size="md" />
        {me.rank && (
          <p className="text-2xl mt-2">
            You finished <strong className="font-display text-accent-2 text-3xl">{ordinalLabel(me.rank)}</strong> with{" "}
            {me.points.toLocaleString()} points
          </p>
        )}
        <p className="text-muted">Thanks for playing. Everyone&apos;s a winner at this table!</p>
      </div>
      {state.standings && <Leaderboard standings={state.standings} highlightId={me.id} pageSize={5} />}
    </section>
  );
}
