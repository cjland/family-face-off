"use client";

import confetti from "canvas-confetti";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnswerTile, Avatar, Banner, CountdownRing, Leaderboard, Podium, QrCode, Stage, TitleMark } from "@/components/ui";
import { useGameState, useServerNow } from "@/hooks/useGameState";
import { joinUrlFor, prettyUrl } from "@/lib/client/api";
import { Sfx } from "@/lib/client/sound";
import type { GameStateDTO } from "@/lib/dto";

const W = 1920;
const H = 1080;

/** Renders a fixed 1920x1080 canvas scaled to fit the screen, so layouts are identical on any TV. */
function TvCanvas({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden grid place-items-center">
      <div
        style={{ width: W, height: H, transform: `scale(${scale || 0.0001})`, transformOrigin: "center center", flex: "none" }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function DisplayPage() {
  return (
    <Suspense fallback={null}>
      <Display />
    </Suspense>
  );
}

function Display() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = (params.code ?? "").toUpperCase();
  const key = search.get("key") ?? "";
  const { state, error, offsetMs } = useGameState(`/api/games/${code}/state?view=display&key=${encodeURIComponent(key)}`);
  const sfx = useRef<Sfx | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const reduced = usePrefersReducedMotion();
  const [controlsVisible, setControlsVisible] = useState(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    window.addEventListener("touchstart", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Sound cues on phase changes (only after the user enabled sound with a click).
  const lastPhase = useRef<string | null>(null);
  const lastRound = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.round?.id ?? ""}`;
    if (key === `${lastPhase.current}:${lastRound.current}`) return;
    lastPhase.current = state.phase;
    lastRound.current = state.round?.id ?? null;
    if (!sfx.current?.enabled) return;
    if (state.phase === "QUESTION") sfx.current.question();
    if (state.phase === "REVEAL") sfx.current.reveal();
    if (state.phase === "FINISHED") sfx.current.fanfare();
  }, [state]);

  if (error && (error.status === 403 || error.status === 404 || error.status === 401)) {
    return (
      <Stage theme="classic">
        <main className="min-h-dvh grid place-items-center p-8">
          <div className="max-w-xl text-center flex flex-col gap-4">
            <TitleMark title="Family Face-Off" theme="classic" size="lg" />
            <Banner kind="error">{error.message}</Banner>
          </div>
        </main>
      </Stage>
    );
  }

  const theme = state?.theme ?? "classic";
  return (
    <Stage theme={theme}>
      <TvCanvas>
        {!state ? (
          <div className="h-full grid place-items-center">
            <TitleMark title="Family Face-Off" theme={theme} size="xl" />
          </div>
        ) : (
          <TvScreen state={state} offsetMs={offsetMs} sfx={sfx} reduced={reduced} />
        )}
      </TvCanvas>
      <div
        className={`fixed top-3 right-3 z-50 flex gap-2 transition-opacity focus-within:opacity-100 ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      >
        <button
          type="button"
          className="btn btn-ghost !min-h-[44px] !text-sm"
          aria-pressed={soundOn}
          onClick={() => {
            if (!sfx.current) sfx.current = new Sfx();
            if (soundOn) {
              sfx.current.disable();
              setSoundOn(false);
            } else {
              setSoundOn(sfx.current.enable());
            }
          }}
        >
          {soundOn ? "🔊 Sound on" : "🔇 Enable sound"}
        </button>
        <button
          type="button"
          className="btn btn-ghost !min-h-[44px] !text-sm"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
        >
          {isFull ? "Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>
      {error && error.status === 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
          <Banner kind="error">Reconnecting…</Banner>
        </div>
      )}
    </Stage>
  );
}

function TvScreen({
  state,
  offsetMs,
  sfx,
  reduced,
}: {
  state: GameStateDTO;
  offsetMs: number;
  sfx: React.RefObject<Sfx | null>;
  reduced: boolean;
}) {
  switch (state.phase) {
    case "LOBBY":
      return <TvLobby state={state} />;
    case "PREPARING":
      return (
        <div className="h-full flex flex-col items-center justify-center gap-10 text-center">
          <TitleMark title={state.title} theme={state.theme} size="xl" />
          <p className="font-display text-7xl font-bold pulse-soft">Get ready!</p>
          <p className="text-4xl text-muted">
            {state.counts.players} players · the first question is coming up
          </p>
        </div>
      );
    case "QUESTION":
      return <TvQuestion state={state} offsetMs={offsetMs} sfx={sfx} />;
    case "REVEAL":
      return <TvReveal state={state} />;
    case "FINISHED":
      return <TvFinal state={state} reduced={reduced} />;
    default:
      return null;
  }
}

function TvHeader({ state, center }: { state: GameStateDTO; center?: React.ReactNode }) {
  return (
    <div className="absolute top-0 inset-x-0 h-[110px] px-14 flex items-center justify-between">
      <TitleMark title={state.title} theme={state.theme} size="sm" />
      <div className="font-display text-4xl text-accent-2">{center}</div>
      <div className="text-2xl text-muted">
        Join: <span className="font-display text-ink tracking-[0.25em] text-3xl">{state.code}</span>
      </div>
    </div>
  );
}

function TvLobby({ state }: { state: GameStateDTO }) {
  const joinUrl = useMemo(() => joinUrlFor(state.code), [state.code]);
  const players = state.lobby ?? [];
  const many = players.length > 20;
  const cols = players.length > 30 ? 6 : 5;
  return (
    <div className="h-full grid grid-cols-[700px_1fr] gap-12 px-16 py-14">
      <div className="flex flex-col items-center justify-center gap-7 text-center">
        <div className="marquee">
          <TitleMark title={state.title} theme={state.theme} size="lg" />
        </div>
        <h2 className="font-display text-6xl font-bold">Scan to join</h2>
        <QrCode url={joinUrl} size={360} label={`QR code to join the game at ${prettyUrl(joinUrl)}`} />
        <div className="text-3xl">
          or go to <span className="font-semibold text-accent-2">{prettyUrl(joinUrl).replace(/\/join\/.*/, "")}</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl text-muted">Code</span>
          <span className="font-display text-8xl font-bold tracking-[0.15em] gold-text">{state.code}</span>
        </div>
      </div>
      <div className="flex flex-col gap-6 min-h-0">
        <div className="flex items-end justify-between">
          <h3 className="font-display text-5xl font-bold">Who&apos;s playing</h3>
          <span className="text-3xl text-muted" aria-live="polite">
            {state.counts.ready} of {state.counts.players} ready
          </span>
        </div>
        <ul className="grid gap-4 content-start flex-1 min-h-0 overflow-hidden" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {players.map((p) => (
            <li
              key={p.id}
              className={`panel pop-in flex flex-col items-center gap-2 ${many ? "p-2" : "p-4"} ${p.ready ? "" : "opacity-70"}`}
            >
              <div className="relative">
                <Avatar name={p.name} size={many ? 64 : 96} />
                <span
                  className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full w-9 h-9 text-xl font-bold ${
                    p.ready ? "bg-good text-black" : "bg-black/60 text-muted"
                  }`}
                  aria-label={p.ready ? "ready" : "still answering"}
                >
                  {p.ready ? "✓" : "…"}
                </span>
              </div>
              <span className={`font-display font-semibold text-center truncate w-full ${many ? "text-xl" : "text-2xl"}`}>{p.name}</span>
              {!many && <span className="text-lg text-muted">{p.ready ? "Ready!" : "Answering…"}</span>}
            </li>
          ))}
          {players.length === 0 && <li className="col-span-full text-3xl text-muted py-10">Waiting for the first player…</li>}
        </ul>
        <div className="panel-strong px-8 py-5 text-center font-display text-4xl">
          {state.counts.ready >= 3 ? "Waiting for the host to start the game" : "Answer 8 quick questions about yourself on your phone"}
        </div>
      </div>
    </div>
  );
}

function TvQuestion({ state, offsetMs, sfx }: { state: GameStateDTO; offsetMs: number; sfx: React.RefObject<Sfx | null> }) {
  const round = state.round!;
  const now = useServerNow(offsetMs, !round.paused, 100);
  const remaining = round.paused || !round.deadlineAt || !now ? round.remainingMs : Math.max(0, new Date(round.deadlineAt).getTime() - now);
  const secs = Math.ceil(remaining / 1000);
  const lastTick = useRef<number>(-1);
  useEffect(() => {
    if (!round.paused && secs <= 5 && secs > 0 && secs !== lastTick.current) {
      lastTick.current = secs;
      if (sfx.current?.enabled) sfx.current.tick();
    }
  }, [secs, round.paused, sfx]);
  const pct = round.eligibleCount ? (round.answeredCount / round.eligibleCount) * 100 : 0;

  return (
    <div className="h-full">
      <TvHeader state={state} center={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[110px] bottom-[110px] inset-x-14 flex flex-col gap-8">
        <div className="flex-1 flex items-center gap-10 min-h-0">
          <div className="flex-1">
            <h2 className="font-display font-bold leading-[1.05] text-[5.2rem]" style={{ textWrap: "balance" }}>
              {round.questionText}
            </h2>
            {round.clue && (
              <p className="mt-5 panel-strong inline-block px-8 py-4 font-display text-6xl">
                “{round.clue}” <span className="text-3xl text-muted font-sans align-middle">for “{round.promptText}”</span>
              </p>
            )}
          </div>
          <CountdownRing remainingMs={remaining} durationMs={round.durationMs} paused={round.paused} size={240} />
        </div>
        <div className="grid grid-cols-2 gap-6">
          {round.options.map((o, i) => (
            <AnswerTile key={o.id} index={i} option={o} size="tv" />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-14 bottom-10 flex items-center gap-6">
        <div className="flex-1 h-5 rounded-full bg-black/40 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-display text-4xl whitespace-nowrap" aria-live="polite">
          {round.answeredCount} of {round.eligibleCount} locked in
        </span>
      </div>
      {round.paused && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center">
          <span className="font-display text-9xl font-bold">Paused</span>
        </div>
      )}
    </div>
  );
}

function TvReveal({ state }: { state: GameStateDTO }) {
  const round = state.round!;
  const reveal = state.reveal;
  const byOption = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const g of reveal?.guesses ?? []) (m[g.optionId] ??= []).push(g.name);
    return m;
  }, [reveal]);
  if (!reveal) return null;
  const correct = round.options.find((o) => o.id === reveal.correctOptionId);
  return (
    <div className="h-full">
      <TvHeader state={state} center={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[120px] left-14 w-[1150px] bottom-12 flex flex-col gap-6">
        <p className="text-4xl text-muted leading-tight">{round.questionText}</p>
        <div className="panel-strong px-8 py-6 pop-in">
          <p className="text-3xl text-muted">Correct answer</p>
          <p className="font-display text-7xl font-bold gold-text leading-tight break-words">{correct?.label ?? reveal.answerText}</p>
          <p className="font-display text-4xl mt-2">{reveal.subjectName} submitted this!</p>
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          {round.options.map((o, i) => {
            const names = byOption[o.id] ?? [];
            return (
              <AnswerTile
                key={o.id}
                index={i}
                option={o}
                size="xl"
                state={o.id === reveal.correctOptionId ? "correct" : "dim"}
                count={reveal.distribution[o.id] ?? 0}
                footer={
                  names.length > 0 ? (
                    <span className="block text-2xl font-sans font-normal opacity-95 mt-1 line-clamp-2">{names.join(" · ")}</span>
                  ) : null
                }
              />
            );
          })}
        </div>
      </div>
      <div className="absolute top-[120px] right-14 w-[620px] bottom-12 panel p-6 flex flex-col gap-4">
        <h3 className="font-display text-4xl font-bold">Leaderboard</h3>
        {state.standings && <Leaderboard standings={state.standings} size="tv" pageSize={8} autoPageMs={5000} />}
      </div>
    </div>
  );
}

function TvFinal({ state, reduced }: { state: GameStateDTO; reduced: boolean }) {
  const standings = state.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  useEffect(() => {
    if (reduced) return;
    const end = Date.now() + 4000;
    let raf = 0;
    const colors = state.theme === "thanksgiving" ? ["#f28c28", "#a3203a", "#ffc46b", "#fff6e6"] : ["#f5c542", "#ffffff", "#7c5cff", "#ff5d8f"];
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      confetti.reset();
    };
  }, [reduced, state.theme]);

  return (
    <div className="h-full flex flex-col px-14 py-10 gap-8">
      <div className="text-center">
        <p className="font-display text-4xl text-accent-2">Final results</p>
        <h2 className="font-display text-8xl font-bold gold-text leading-tight">
          {winners.length > 2
            ? `A ${winners.length}-way tie for first!`
            : winners.length === 2
              ? `${winners[0].name} & ${winners[1].name} tie for the win!`
              : winners[0] ? `${winners[0].name} wins!` : "Thanks for playing!"}
        </h2>
      </div>
      <div className="flex-1 grid grid-cols-[1fr_620px] gap-10 min-h-0">
        <div className="flex flex-col justify-end items-center gap-6">
          <Podium standings={standings} size="tv" />
          <p className="text-3xl text-muted">Thanks for playing, everyone. What a family!</p>
        </div>
        <div className="panel p-6 flex flex-col gap-4 min-h-0">
          <h3 className="font-display text-4xl font-bold">Everyone</h3>
          <Leaderboard standings={standings} size="tv" pageSize={8} autoPageMs={6000} showAccuracy />
        </div>
      </div>
    </div>
  );
}
