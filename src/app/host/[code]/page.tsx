"use client";

import { defaultBonusCount, DIFFICULTY_LABEL, roundLabel } from "@/lib/bonus";
import { formatMinutes, plannedMinutes, plannedQuestions } from "@/lib/plan";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { GuessList, LockInList } from "@/components/RoundPanels";
import { SettingsForm, type SettingsDraft } from "@/components/SettingsForm";
import { AnswerTile, Avatar, Banner, CountdownRing, Leaderboard, QrCode, Spinner, Stage, TitleMark } from "@/components/ui";
import { useGameState, useServerNow } from "@/hooks/useGameState";
import { api, ApiClientError, joinUrlFor, prettyUrl } from "@/lib/client/api";
import type { GameStateDTO } from "@/lib/dto";
import { isPhotoPiece } from "@/lib/pieces";

type Preview = { readyPlayers: number; totalPlayers: number; maxPerPlayer: number; suggestedPerPlayer: number; questionSeconds: number };

export default function HostConsole() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { state, error, offsetMs, refresh } = useGameState(`/api/games/${code}/state?view=host`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);

  const act = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true);
      setNotice(null);
      try {
        await fn();
        if (ok) setNotice({ kind: "success", text: ok });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "VERSION_CONFLICT") {
          setNotice({ kind: "info", text: "The game moved on already. Refreshed." });
        } else {
          setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
        }
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  if (error && (error.status === 401 || error.status === 404)) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-lg px-5 py-16 flex flex-col gap-4 items-center text-center">
          <Banner kind="error">{error.status === 401 ? "Please sign in as the host first." : error.message}</Banner>
          <Link className="btn btn-primary" href="/host">
            Go to host dashboard
          </Link>
        </main>
      </Stage>
    );
  }
  if (!state) {
    return (
      <Stage theme="classic">
        <Spinner label="Loading game" />
        {error && error.status >= 500 && (
          <div className="mx-auto max-w-lg px-5">
            <Banner kind="error">
              Couldn&apos;t load the game ({error.message}). If the app was just updated, run the latest <code>neon-setup.sql</code> in the
              Neon SQL Editor, then check <code>/api/health</code>. Retrying…
            </Banner>
          </div>
        )}
      </Stage>
    );
  }

  const action = (a: string, ok?: string) =>
    act(() => api(`/api/games/${code}/action`, { method: "POST", body: { action: a, expectedVersion: state.version } }), ok);

  return (
    <Stage theme={state.theme}>
      <main className="mx-auto max-w-6xl px-4 py-6 flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/host" className="btn btn-ghost !text-base" aria-label="Back to dashboard">
              ‹ Games
            </Link>
            <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="sm" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="panel px-4 py-2 font-display text-2xl tracking-[0.3em]" aria-label={`Game code ${code}`}>
              {code}
            </span>
            <a
              className="btn btn-primary !text-base"
              href={`/display/${code}?key=${state.host?.displayKey ?? ""}`}
              target="_blank"
              rel="noopener"
            >
              Open TV display ↗
            </a>
          </div>
        </header>

        {error && error.status === 0 && <Banner kind="error">{error.message}</Banner>}
        {notice && <Banner kind={notice.kind === "info" ? "info" : notice.kind}>{notice.text}</Banner>}

        {state.phase === "LOBBY" && <LobbyControls state={state} code={code} busy={busy} act={act} />}
        {state.phase === "PREPARING" && (
          <section className="panel p-6 flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Questions are ready</h2>
            <p className="text-lg">
              {state.host?.plannedRounds ?? 0} questions for {state.counts.players} players. The roster and answers are locked.
            </p>
            {state.host?.prepareNote && <Banner kind="info">{state.host.prepareNote}</Banner>}
            <div className="flex gap-3 flex-wrap">
              <button className="btn btn-primary" disabled={busy || !state.host?.plannedRounds} onClick={() => action("open")}>
                Start first question
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => action("prepare", "Questions regenerated.")}>
                Regenerate questions
              </button>
              <EndButton busy={busy} onEnd={() => action("end")} />
            </div>
          </section>
        )}
        {(state.phase === "QUESTION" || state.phase === "REVEAL" || state.phase === "LEADERBOARD") && state.round && (
          <RoundControls state={state} offsetMs={offsetMs} busy={busy} action={action} />
        )}
        {state.phase === "FINISHED" && (
          <section className="panel p-6 flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Game over: final standings</h2>
            {state.standings && <Leaderboard standings={state.standings} pageSize={10} showAccuracy />}
            <Link href="/host" className="btn btn-primary self-start">
              Back to dashboard
            </Link>
          </section>
        )}
      </main>
    </Stage>
  );
}

/**
 * Ending the game is deliberately hard to do by accident: a small, separate link opens a
 * confirmation that requires typing END.
 */
function EndButton({ busy, onEnd }: { busy: boolean; onEnd: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        className="ml-auto text-sm text-muted underline underline-offset-4 min-h-[44px] px-2 hover:text-bad"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        End game early…
      </button>
    );
  }
  const ok = typed.trim().toUpperCase() === "END";
  return (
    <div className="basis-full panel-strong !border-bad p-4 flex flex-col gap-3 pop-in" role="alertdialog" aria-labelledby="end-title">
      <p id="end-title" className="font-display text-xl font-bold text-bad">Are you sure you want to end the game?</p>
      <p className="text-sm text-muted">This ends it for everyone and jumps straight to the final results. It can&apos;t be undone.</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm">
          Type <strong>END</strong> to confirm
        </span>
        <input className="input !min-h-[44px] max-w-[200px] uppercase" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          className="btn btn-danger !text-base"
          disabled={!ok || busy}
          onClick={() => {
            onEnd();
            setOpen(false);
            setTyped("");
          }}
        >
          Yes, end the game
        </button>
        <button
          type="button"
          className="btn btn-ghost !text-base"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Keep playing
        </button>
      </div>
    </div>
  );
}

function LobbyControls({
  state,
  code,
  busy,
  act,
}: {
  state: GameStateDTO;
  code: string;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const joinUrl = useMemo(() => joinUrlFor(code), [code]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>({
    theme: state.theme,
    roundCount: state.settings.roundCount,
    questionSeconds: state.settings.questionSeconds,
    speedBonus: state.settings.speedBonus,
    autoReveal: state.settings.autoReveal,
    overtimeSeconds: state.settings.overtimeSeconds,
    autoNext: state.settings.autoNext,
    aiDistractors: state.host?.aiDistractors ?? false,
    music: state.music,
    taunts: state.taunts,
    shameSpotlight: state.shameSpotlight,
    sound: state.sound,
    animations: state.animations,
    voice: state.voice,
    boards: state.boards,
    perPlayer: state.settings.perPlayer ?? undefined,
    plannedPlayers: state.settings.plannedPlayers ?? undefined,
    fastestBonus: state.settings.fastestBonus,
    bonusQuestions: state.settings.bonusQuestions,
    bonusCount: state.settings.bonusCount ?? undefined,
    pieceGroups: state.settings.pieceGroups as SettingsDraft["pieceGroups"],
  });
  const roster = state.host?.roster.filter((p) => p.active) ?? [];
  const ready = roster.filter((p) => p.ready).length;
  const unready = roster.length - ready;

  const [startDialog, setStartDialog] = useState<Preview | null>(null);
  const [perPlayer, setPerPlayer] = useState(2);

  const openStart = () =>
    act(async () => {
      const p = await api<Preview>(`/api/games/${code}/preview`);
      setPerPlayer(p.suggestedPerPlayer);
      setStartDialog(p);
    });

  const confirmStart = () =>
    act(async () => {
      await api(`/api/games/${code}/start`, { method: "POST", body: { excludeUnready: unready > 0, perPlayer } });
      setStartDialog(null);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="panel p-6 flex flex-col items-center gap-4 text-center">
        <h2 className="font-display text-3xl font-bold">Scan to join</h2>
        <QrCode url={joinUrl} size={220} label={`QR code to join game ${code}`} />
        <p className="text-lg">
          or visit <span className="font-semibold text-accent-2 break-all">{prettyUrl(joinUrl)}</span>
        </p>
        {/localhost|127\.0\.0\.1/.test(joinUrl) && (
          <Banner kind="info">
            Phones can&apos;t open &quot;localhost&quot;. Set NEXT_PUBLIC_APP_URL to your computer&apos;s network address (see README) or use the
            deployed site.
          </Banner>
        )}
      </section>

      <section className="panel p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-3xl font-bold">Players</h2>
          <span className="text-lg" aria-live="polite">
            <strong className="text-good">{ready} ready</strong> · {unready} still answering
          </span>
        </div>
        {roster.length === 0 ? (
          <p className="text-muted">Nobody has joined yet. Share the QR code!</p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-[420px] overflow-auto pr-1">
            {roster.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2">
                <Avatar name={p.name} piece={p.piece} size={40} />
                <span className={`text-xl ${p.ready ? "text-good" : "text-muted"}`} aria-hidden="true">
                  {p.ready ? "✔" : "…"}
                </span>
                <span className="flex-1 min-w-0 truncate font-semibold">
                  {p.name} {p.isBot && <span className="text-xs text-muted font-normal">(demo bot)</span>}
                </span>
                <span className="text-sm text-muted">{p.ready ? "Ready" : `${p.answered}/8 answered`}</span>
                {isPhotoPiece(p.piece) && (
                  <button
                    className="btn btn-ghost !min-h-[44px] !px-3 !text-sm"
                    disabled={busy}
                    aria-label={`Remove ${p.name}'s photo`}
                    onClick={() => {
                      if (window.confirm(`Remove ${p.name}'s photo? They'll get a game piece instead.`)) {
                        void act(() => api(`/api/games/${code}/players/${p.id}/photo`, { method: "DELETE" }));
                      }
                    }}
                  >
                    Remove photo
                  </button>
                )}
                <button
                  className="btn btn-ghost !min-h-[44px] !px-3 !text-sm"
                  disabled={busy}
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    if (window.confirm(`Remove ${p.name} from the game?`)) {
                      void act(() => api(`/api/games/${code}/players/${p.id}`, { method: "DELETE" }));
                    }
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 flex-wrap items-center">
          <button className="btn btn-primary" disabled={busy || ready < 3} onClick={openStart}>
            Start game…
          </button>
          {state.host?.demoTools && (
            <button
              className="btn btn-ghost !text-base"
              disabled={busy || roster.filter((p) => p.isBot).length >= 12}
              title="Up to 12 fictional demo players"
              onClick={() => act(() => api(`/api/games/${code}/demo-players`, { method: "POST", body: { count: 4 } }), "Added demo players.")}
            >
              + Add 4 demo players ({roster.filter((p) => p.isBot).length}/12)
            </button>
          )}
        </div>
        {ready < 3 && <p className="text-sm text-muted">You need at least 3 ready players to start.</p>}
        {startDialog && (
          <div className="panel-strong p-5 flex flex-col gap-4 pop-in" role="dialog" aria-labelledby="start-title">
            <h3 id="start-title" className="font-display text-2xl font-bold">
              {startDialog.readyPlayers} players are ready. How many questions about each person?
            </h3>
            {unready > 0 && (
              <Banner kind="info">
                {unready} {unready === 1 ? "person is" : "people are"} still answering and will watch instead of play.
              </Banner>
            )}
            {startDialog.maxPerPlayer === 0 ? (
              <Banner kind="error">Not enough different questions yet. Wait for more answers.</Banner>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Questions per person">
                  {Array.from({ length: startDialog.maxPerPlayer }, (_, i) => i + 1).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={perPlayer === k}
                      className={`btn ${perPlayer === k ? "btn-primary" : "btn-ghost"} !min-w-[56px]`}
                      onClick={() => setPerPlayer(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <p className="text-lg">
                  {perPlayer} × {startDialog.readyPlayers} people = <strong>{plannedQuestions(startDialog.readyPlayers, perPlayer)} questions</strong>, about{" "}
                  {formatMinutes(plannedMinutes(plannedQuestions(startDialog.readyPlayers, perPlayer), startDialog.questionSeconds))}
                  {state.settings.bonusQuestions &&
                    `, plus ${Math.min(state.settings.bonusCount ?? defaultBonusCount(perPlayer), Math.max(0, plannedQuestions(startDialog.readyPlayers, perPlayer) - 1))} 🎁 bonus`}
                  .
                </p>
                <p className="text-sm text-muted">
                  Up to {startDialog.maxPerPlayer} per person is possible without ever repeating a question.
                </p>
              </>
            )}
            <div className="flex gap-3">
              <button className="btn btn-primary" disabled={busy || startDialog.maxPerPlayer === 0} onClick={confirmStart}>
                Lock roster & start
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setStartDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <details open={editing} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)} className="rounded-xl bg-black/20 p-4">
          <summary className="cursor-pointer font-semibold">Game settings</summary>
          <div className="mt-4 flex flex-col gap-4">
            <SettingsForm value={draft} onChange={setDraft} aiAvailable={state.host?.aiAvailable ?? false} />
            <button
              className="btn btn-primary self-start !text-base"
              disabled={busy}
              onClick={() => act(() => api(`/api/games/${code}/settings`, { method: "PATCH", body: draft }), "Settings saved.")}
            >
              Save settings
            </button>
          </div>
        </details>
      </section>
    </div>
  );
}

function RoundControls({
  state,
  offsetMs,
  busy,
  action,
}: {
  state: GameStateDTO;
  offsetMs: number;
  busy: boolean;
  action: (a: string, ok?: string) => Promise<void>;
}) {
  const round = state.round!;
  const isQuestion = state.phase === "QUESTION";
  const now = useServerNow(offsetMs, isQuestion && !round.paused);
  const remaining = round.paused || !round.deadlineAt ? round.remainingMs : Math.max(0, new Date(round.deadlineAt).getTime() - now);
  const reveal = state.reveal;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="panel p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <span className="font-display text-xl text-accent-2">
            {roundLabel(round)}
            {round.bonus && ` · ${DIFFICULTY_LABEL[round.bonus.difficulty]}, up to ${round.bonus.points.toLocaleString()}`}
          </span>
          {isQuestion && <CountdownRing remainingMs={now ? remaining : round.remainingMs} durationMs={round.durationMs} paused={round.paused} size={88} />}
        </div>
        <h2 className="font-display text-3xl font-bold leading-tight">{round.questionText}</h2>
        {round.clue && <p className="text-2xl font-display">“{round.clue}” <span className="text-muted text-base">({round.promptText})</span></p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {round.options.map((o, i) => (
            <AnswerTile
              key={o.id}
              index={i}
              option={o}
              state={reveal ? (o.id === reveal.correctOptionId ? "correct" : "dim") : "idle"}
              count={reveal ? reveal.distribution[o.id] ?? 0 : undefined}
            />
          ))}
        </div>
        <p className="text-lg" aria-live="polite">
          {round.answeredCount} of {round.eligibleCount} locked in
          {round.paused && <strong className="ml-2 text-accent">· Paused</strong>}
        </p>
        {reveal && (
          <Banner kind="success">
            Correct answer: <strong>{reveal.answerText}</strong>
            {round.bonus ? " (bonus question)" : <>, submitted by <strong>{reveal.subjectName}</strong></>}
          </Banner>
        )}
        <div className="flex gap-3 flex-wrap">
          {isQuestion ? (
            <>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  const missing = round.eligibleCount - round.answeredCount;
                  if (missing > 0 && !window.confirm(`${missing} ${missing === 1 ? "person hasn't" : "people haven't"} locked in yet. Reveal anyway?`)) return;
                  void action("reveal");
                }}
              >
                Reveal answer
              </button>
              {round.paused ? (
                <button className="btn btn-ghost" disabled={busy} onClick={() => action("resume")}>
                  ▶ Resume
                </button>
              ) : (
                <button className="btn btn-ghost" disabled={busy} onClick={() => action("pause")}>
                  ❚❚ Pause
                </button>
              )}
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Skip this question? Nobody scores for it.")) void action("skip");
                }}
              >
                Skip question
              </button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => action("next")}>
              {state.phase === "REVEAL" ? "Show leaderboard ➜" : round.number >= round.total ? "Show final results ➜" : "Next question ➜"}
            </button>
          )}
          <EndButton busy={busy} onEnd={() => action("end")} />
        </div>
        <p className="text-sm text-muted">
          {state.settings.autoReveal ? `Auto reveal is on (+${state.settings.overtimeSeconds}s after time runs out). ` : ""}
          {state.settings.autoNext ? `Auto next after ${state.settings.revealSeconds}s. ` : ""}
          The correct answer stays hidden here until the reveal, so you can play along on your phone too.
        </p>
      </section>
      <section className="panel p-6 flex flex-col gap-4">
        {state.phase === "QUESTION" && (
          <>
            <h2 className="font-display text-2xl font-bold">
              Locking in · {round.answeredCount}/{round.eligibleCount}
            </h2>
            <LockInList state={state} overtime={Boolean(now) && remaining <= 0 && !round.paused} />
          </>
        )}
        {state.phase === "REVEAL" && (
          <>
            <h2 className="font-display text-2xl font-bold">Who guessed what</h2>
            <GuessList state={state} />
          </>
        )}
        {state.phase === "LEADERBOARD" && state.standings && (
          <>
            <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
            <Leaderboard standings={state.standings} pageSize={12} showAccuracy />
          </>
        )}
      </section>
    </div>
  );
}
