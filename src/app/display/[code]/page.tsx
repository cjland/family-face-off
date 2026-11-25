"use client";

import confetti from "canvas-confetti";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerTile, Avatar, Banner, CountdownRing, LETTERS, Leaderboard, Podium, QrCode, Stage, TitleMark } from "@/components/ui";
import { useGameState, useServerNow } from "@/hooks/useGameState";
import { GuessList } from "@/components/RoundPanels";
import { api, ApiClientError, joinUrlFor, prettyUrl } from "@/lib/client/api";
import { MusicPlayer } from "@/lib/client/music";
import { Sfx } from "@/lib/client/sound";
import type { GameStateDTO } from "@/lib/dto";
import { hashString } from "@/lib/prng";
import { MUSIC, type MusicStyle } from "@/lib/settings";

const W = 1920;
const H = 1080;

/** Renders a fixed 1920x1080 canvas scaled to fit the screen, so layouts are identical on any TV. */
function TvCanvas({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    // Keep a safe margin around the canvas: many TVs crop the edges (overscan), and
    // desktop taskbars can cover the bottom of a maximized browser.
    const fit = () => {
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      setScale(Math.min(w / W, h / H) * 0.94);
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale || 0.0001})`,
          transformOrigin: "center center",
        }}
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

/** Columns that give evenly filled rows (12 -> 6+6, never 11+1). */
function balancedColumns(n: number, maxCols: number): number {
  if (n <= 0) return 1;
  const rows = Math.ceil(n / maxCols);
  return Math.ceil(n / rows);
}

function RosterGrid({ players, maxCols, size }: { players: { id: string; name: string; piece: string | null }[]; maxCols: number; size: number }) {
  const cols = balancedColumns(players.length, maxCols);
  return (
    <ul className="flex flex-wrap justify-center gap-x-8 gap-y-6 mx-auto" style={{ maxWidth: cols * (size + 40) + (cols - 1) * 32 }}>
      {players.map((p) => (
        <li key={p.id} className="flex flex-col items-center gap-2 pop-in" style={{ width: size + 40 }}>
          <Avatar name={p.name} piece={p.piece} size={size} />
          <span className="font-display text-3xl text-center truncate max-w-full">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

const MUSIC_LABEL: Record<MusicStyle, string> = {
  gameshow: "Game show",
  suspense: "Suspense",
  lounge: "Lounge",
  off: "No music",
};

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
  const music = useRef<MusicPlayer | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [musicChoice, setMusicChoice] = useState<MusicStyle | null>(null);
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
  const lastKey = useRef<string>("");
  useEffect(() => {
    if (!state) return;
    const k = `${state.phase}:${state.round?.id ?? ""}`;
    if (k === lastKey.current) return;
    lastKey.current = k;
    if (!sfx.current?.enabled) return;
    if (state.phase === "QUESTION") sfx.current.question();
    if (state.phase === "REVEAL") sfx.current.reveal();
    if (state.phase === "FINISHED") sfx.current.fanfare();
  }, [state]);

  // Pop as each player locks in.
  const lockedCount = useRef(0);
  const lockedRound = useRef<string | null>(null);
  useEffect(() => {
    const r = state?.round;
    if (!r || state?.phase !== "QUESTION") return;
    const n = r.lockedPlayerIds?.length ?? 0;
    if (lockedRound.current !== r.id) {
      lockedRound.current = r.id;
      lockedCount.current = n;
      return;
    }
    if (n > lockedCount.current && sfx.current?.enabled) {
      const from = lockedCount.current;
      for (let i = from; i < n; i++) setTimeout(() => sfx.current?.lockIn(i), (i - from) * 120);
    }
    lockedCount.current = n;
  }, [state]);

  // Background music while people choose.
  const style: MusicStyle = musicChoice ?? state?.music ?? "gameshow";
  const shouldPlay = soundOn && state?.phase === "QUESTION" && !state.round?.paused && style !== "off";
  useEffect(() => {
    const ctx = sfx.current?.context;
    if (!ctx) return;
    if (!music.current) music.current = new MusicPlayer(ctx);
    if (shouldPlay) music.current.play(style);
    else music.current.stop();
  }, [shouldPlay, style]);
  useEffect(() => () => music.current?.stop(), []);

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
      <div
        className={`absolute top-6 right-8 z-50 flex gap-3 transition-opacity focus-within:opacity-100 ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      >
        <button
          type="button"
          className="btn btn-ghost !min-h-[56px] !text-xl"
          aria-pressed={soundOn}
          onClick={() => {
            if (!sfx.current) sfx.current = new Sfx();
            if (soundOn) {
              music.current?.stop();
              music.current = null;
              sfx.current.disable();
              setSoundOn(false);
            } else {
              setSoundOn(sfx.current.enable());
            }
          }}
        >
          {soundOn ? "🔊 Sound on" : "🔇 Enable sound"}
        </button>
        {soundOn && (
          <label className="btn btn-ghost !min-h-[56px] !text-xl">
            <span aria-hidden="true">🎵</span>
            <select
              className="bg-transparent outline-none"
              value={style}
              onChange={(e) => setMusicChoice(e.target.value as MusicStyle)}
              aria-label="Music style"
            >
              {MUSIC.map((m) => (
                <option key={m} value={m} className="text-black">
                  {MUSIC_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn btn-ghost !min-h-[56px] !text-xl"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
        >
          {isFull ? "Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>
      </TvCanvas>
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
    case "PREPARING": {
      const n = state.players?.length ?? 0;
      const size = n <= 6 ? 210 : n <= 12 ? 175 : n <= 21 ? 120 : 88;
      const maxCols = n <= 6 ? 6 : n <= 12 ? 6 : n <= 21 ? 7 : 10;
      return (
        <div className="h-full">
          <div className="absolute inset-x-14 top-12 bottom-[170px] flex flex-col items-center justify-center gap-8 text-center">
            <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="lg" />
            <p className="font-display text-7xl font-bold pulse-soft">Get ready!</p>
            <RosterGrid players={state.players ?? []} maxCols={maxCols} size={size} />
          </div>
          <TvFooter state={state}>
            <span className="text-4xl text-muted">
              {state.settings.perPlayer ? `${state.settings.perPlayer} questions about each person · ` : ""}the first question is coming up
            </span>
          </TvFooter>
        </div>
      );
    }
    case "QUESTION":
      return <TvQuestion key={state.round?.id} state={state} offsetMs={offsetMs} sfx={sfx} />;
    case "REVEAL":
      return <TvReveal key={state.round?.id} state={state} />;
    case "LEADERBOARD":
      return <TvLeaderboard state={state} />;
    case "FINISHED":
      return <TvFinal state={state} reduced={reduced} />;
    default:
      return null;
  }
}

function TvHeader({ state, center }: { state: GameStateDTO; center?: React.ReactNode }) {
  return (
    <div className="absolute top-0 inset-x-0 h-[110px] px-14 grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="justify-self-start">
        <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="sm" />
      </div>
      <div className="font-display text-4xl text-accent-2">{center}</div>
      <div />
    </div>
  );
}

/** Footer band kept clear of the screen edge: info on the left, the host's "next" arrow on the right. */
function TvFooter({ state, children }: { state: GameStateDTO; children?: React.ReactNode }) {
  return (
    <div className="absolute inset-x-14 bottom-12 h-[96px] flex items-center gap-6">
      <div className="flex-1 min-w-0 flex items-center gap-6">{children}</div>
      <NextArrow state={state} />
    </div>
  );
}

const NEXT_LABEL: Partial<Record<GameStateDTO["phase"], string>> = {
  LOBBY: "Start game",
  PREPARING: "Start",
  QUESTION: "Reveal",
  REVEAL: "Leaderboard",
  LEADERBOARD: "Next question",
};

/** Shown only when this browser is signed in as host. Also works with →, Space or a presentation clicker. */
function NextArrow({ state }: { state: GameStateDTO }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const round = state.round;
  let label = NEXT_LABEL[state.phase];
  if (state.phase === "LEADERBOARD" && round && round.number >= round.total) label = "Final results";
  const action = state.phase === "QUESTION" ? "reveal" : state.phase === "PREPARING" ? "open" : "next";
  const allIn = !round || round.eligibleCount === 0 || round.answeredCount >= round.eligibleCount;
  const enabled =
    state.canControl &&
    Boolean(label) &&
    (state.phase !== "LOBBY" || state.counts.ready >= 3) &&
    // No revealing (button or keyboard) until everyone eligible has locked in.
    (state.phase !== "QUESTION" || allIn);
  const [startOpen, setStartOpen] = useState(false);
  const go = useCallback(() => {
    if (!enabled || busy) return;
    if (state.phase === "LOBBY") {
      setStartOpen(true);
      return;
    }
    setBusy(true);
    setErr(null);
    api(`/api/games/${state.code}/action`, { method: "POST", body: { action, expectedVersion: state.version } })
      .catch((e) => {
        if (!(e instanceof ApiClientError && e.code === "VERSION_CONFLICT")) setErr(e instanceof Error ? e.message : "Couldn't advance");
      })
      .finally(() => setTimeout(() => setBusy(false), 600));
  }, [enabled, busy, state.code, state.version, state.phase, action]);
  useEffect(() => {
    if (!enabled || startOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, go, startOpen]);
  if (!enabled) return null;
  return (
    <div className="flex items-center gap-3">
      {startOpen && <TvStartDialog state={state} onClose={() => setStartOpen(false)} />}
      {err && <span className="text-xl text-bad max-w-[360px] truncate">{err}</span>}
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="btn btn-primary !min-h-[84px] !px-10 !text-4xl"
        aria-label={`${label} (or press the right arrow key)`}
      >
        {label} <span aria-hidden="true">➜</span>
      </button>
    </div>
  );
}

function TvLobby({ state }: { state: GameStateDTO }) {
  const joinUrl = useMemo(() => joinUrlFor(state.code), [state.code]);
  const players = state.lobby ?? [];
  const many = players.length > 15;
  const cols = balancedColumns(Math.max(players.length, 1), players.length > 24 ? 7 : players.length > 15 ? 6 : 5);
  return (
    <div className="h-full grid grid-cols-[700px_1fr] gap-12 px-16 pt-24 pb-16 overflow-hidden">
      <div className="flex flex-col items-center justify-center gap-6 text-center">
        <div className="marquee">
          <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="lg" />
        </div>
        <h2 className="font-display text-6xl font-bold">Scan to join</h2>
        <QrCode url={joinUrl} size={340} label={`QR code to join the game at ${prettyUrl(joinUrl)}`} />
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
        <ul className="flex flex-wrap justify-center content-start gap-4 flex-1 min-h-0 overflow-hidden">
          {players.map((p) => (
            <li
              key={p.id}
              className={`panel pop-in flex flex-col items-center gap-1 ${many ? "p-2" : "p-4"}`}
              style={{ width: `calc(${100 / cols}% - ${(16 * (cols - 1)) / cols}px)` }}
            >
              <div className="relative">
                <div className={p.ready ? "" : "opacity-60"}>
                  <Avatar name={p.name} piece={p.piece} size={many ? 84 : 120} />
                </div>
                <span
                  className={`absolute bottom-0 right-0 grid place-items-center rounded-full w-9 h-9 text-xl font-bold ${
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
          {players.length === 0 && <li className="w-full text-3xl text-muted py-10">Waiting for the first player…</li>}
        </ul>
        <div className="flex items-center gap-6">
          <div className="flex-1 panel-strong px-8 py-5 text-center font-display text-4xl">
            {state.counts.ready >= 3
              ? state.canControl
                ? "Everyone ready? Press Start game!"
                : "Waiting for the host to start the game"
              : "Pick a game piece and answer 8 quick questions on your phone"}
          </div>
          <NextArrow state={state} />
        </div>
      </div>
    </div>
  );
}

type Preview = { readyPlayers: number; totalPlayers: number; maxPerPlayer: number; suggestedPerPlayer: number; questionSeconds: number };

/** Host-only start dialog on the TV: choose questions per person, lock the roster, start. */
function TvStartDialog({ state, onClose }: { state: GameStateDTO; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [per, setPer] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Preview>(`/api/games/${state.code}/preview`)
      .then((p) => {
        setPreview(p);
        setPer(p.suggestedPerPlayer);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load"));
  }, [state.code]);
  const unready = state.counts.players - state.counts.ready;
  const start = useCallback(async () => {
    if (busy || !preview?.maxPerPlayer) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/games/${state.code}/start`, { method: "POST", body: { excludeUnready: unready > 0, perPlayer: per } });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start");
      setBusy(false);
    }
  }, [busy, preview, state.code, unready, per, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!preview) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") setPer((v) => Math.min(preview.maxPerPlayer, v + 1));
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") setPer((v) => Math.max(1, v - 1));
      if (e.key === "Enter") void start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, start, onClose]);
  // "fixed" here is relative to the scaled TV canvas (it has a CSS transform), so this covers the canvas.
  return (
    <div className="fixed inset-0 z-40 bg-black/75 grid place-items-center" role="dialog" aria-labelledby="tv-start-title">
      <div
        className="rounded-[2rem] border-2 border-accent p-12 flex flex-col items-center gap-8 text-center pop-in w-[1300px] shadow-2xl"
        style={{ background: "linear-gradient(160deg, var(--bg-1), var(--bg-2))" }}
      >
        {!preview ? (
          <p className="text-4xl">{err ?? "Getting ready…"}</p>
        ) : (
          <>
            <h2 id="tv-start-title" className="font-display text-6xl font-bold">
              {preview.readyPlayers} players ready. How many questions about each person?
            </h2>
            {unready > 0 && (
              <p className="text-3xl text-accent-2">
                {unready} {unready === 1 ? "person is" : "people are"} still answering and will watch instead.
              </p>
            )}
            <div className="flex gap-4 flex-wrap justify-center" role="radiogroup" aria-label="Questions per person">
              {Array.from({ length: preview.maxPerPlayer }, (_, i) => i + 1).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={per === k}
                  onClick={() => setPer(k)}
                  className={`btn ${per === k ? "btn-primary" : "btn-ghost"} !min-h-[100px] !min-w-[110px] !text-6xl`}
                >
                  {k}
                </button>
              ))}
            </div>
            <p className="text-4xl">
              {per} × {preview.readyPlayers} people = <strong>{per * preview.readyPlayers} questions</strong>, about{" "}
              {Math.max(1, Math.round((per * preview.readyPlayers * (preview.questionSeconds + 12)) / 60))} minutes
            </p>
            {err && <p className="text-3xl text-bad">{err}</p>}
            <div className="flex gap-5">
              <button type="button" className="btn btn-primary !min-h-[90px] !px-12 !text-5xl" disabled={busy} onClick={() => void start()}>
                Lock roster &amp; start ➜
              </button>
              <button type="button" className="btn btn-ghost !min-h-[90px] !px-10 !text-4xl" onClick={onClose}>
                Cancel
              </button>
            </div>
            <p className="text-2xl text-muted">← → to choose · Enter to start · Esc to cancel</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Question: lock-in strip + playful taunts ----------

const TAUNTS_ONE = [
  "Hurry up, {n}!",
  "We could play if {n} was ready.",
  "Earth to {n}… come in, {n}.",
  "{n}, it's multiple choice, not an essay.",
  "Tick tock, {n}.",
  "We've seen glaciers move faster, {n}.",
  "Take your time, {n}. We'll just age a little.",
  "Somebody nudge {n}!",
  "{n} is still thinking. Bless their heart.",
  "{n}, the turkey's getting cold!",
  "Any day now, {n}…",
  "{n} is reading the question for the fourth time.",
];
const TAUNTS_LAST = [
  "It's all on you, {n}. Everyone's waiting!",
  "Everyone's in except {n}. No pressure.",
  "{n}, the whole family is staring at you.",
];
const SHAME_LINES = [
  "Hey {n}… we are waiting.",
  "{n}, the timer gave up on you.",
  "Everyone, please turn and stare at {n}.",
  "Breaking news: {n} still hasn't answered.",
  "{n} is holding up the whole family.",
  "{n}, this is now your fault.",
  "We'd like to thank {n} for this lovely pause.",
];

const TAUNTS_MANY = ["{n}… any day now!", "Still waiting on {n}.", "{n}, the clock is not your friend."];

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
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

  const players = state.players ?? [];
  const locked = new Set(round.lockedPlayerIds ?? []);
  const subject = players.find((p) => p.id === round.subjectPlayerId);
  const guessers = players.filter((p) => p.id !== round.subjectPlayerId);
  const laggards = guessers.filter((p) => !locked.has(p.id));
  const elapsedFrac = round.durationMs ? 1 - remaining / round.durationMs : 0;
  const slot = Math.floor((round.durationMs - remaining) / 3500);

  const overtime = !round.paused && remaining <= 0 && Boolean(round.deadlineAt) && now > 0;
  const overtimeSecs = overtime && round.deadlineAt ? Math.max(0, Math.floor((now - new Date(round.deadlineAt).getTime()) / 1000)) : 0;
  const shameTargets = overtime ? laggards : [];
  const shameLine = shameTargets.length
    ? SHAME_LINES[hashString(`${round.id}:shame:${Math.floor(overtimeSecs / 3)}`) % SHAME_LINES.length].replaceAll(
        "{n}",
        joinNames(shameTargets.map((l) => l.name)),
      )
    : null;
  const sirenPlayed = useRef(false);
  useEffect(() => {
    if (shameTargets.length && !sirenPlayed.current) {
      sirenPlayed.current = true;
      if (sfx.current?.enabled) sfx.current.shame();
    }
  }, [shameTargets.length, sfx]);

  let taunt: string | null = null;
  if (state.taunts && !round.paused && remaining > 0 && laggards.length && guessers.length > 1) {
    const due = elapsedFrac >= 0.35 || (locked.size >= guessers.length / 2 && elapsedFrac >= 0.2);
    if (due) {
      const h = hashString(`${round.id}:${slot}`);
      if (laggards.length === 1 && guessers.length > 2) {
        taunt = TAUNTS_LAST[h % TAUNTS_LAST.length].replaceAll("{n}", laggards[0].name);
      } else if (laggards.length <= 3) {
        const target = laggards[h % laggards.length];
        taunt = TAUNTS_ONE[(h >>> 4) % TAUNTS_ONE.length].replaceAll("{n}", target.name);
      } else {
        taunt = TAUNTS_MANY[h % TAUNTS_MANY.length].replaceAll("{n}", joinNames(laggards.map((l) => l.name)));
      }
    }
  }
  const size = guessers.length > 24 ? 56 : guessers.length > 14 ? 72 : 92;

  return (
    <div className="h-full">
      <TvHeader state={state} center={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[110px] inset-x-14 bottom-[160px] flex flex-col gap-5">
        <div className="flex-1 flex items-center gap-10 min-h-0">
          <div className="flex-1">
            <h2 className="font-display font-bold leading-[1.05] text-[4.6rem]" style={{ textWrap: "balance" }}>
              {round.questionText}
            </h2>
            {round.clue && (
              <p className="mt-5 panel-strong inline-block px-8 py-4 font-display text-6xl">
                “{round.clue}” <span className="text-3xl text-muted font-sans align-middle">for “{round.promptText}”</span>
              </p>
            )}
            <div className="h-[96px] mt-3 flex items-center">
              {taunt && (
                <div key={taunt} className="-rotate-1 pop-in panel-strong px-8 py-3 border-4 !border-accent shadow-2xl inline-block">
                  <span className="font-display text-5xl font-bold text-accent-2 whitespace-nowrap">{taunt}</span>
                </div>
              )}
            </div>
          </div>
          <CountdownRing remainingMs={remaining} durationMs={round.durationMs} paused={round.paused} size={220} />
        </div>
        <div className="grid grid-cols-2 gap-5">
          {round.options.map((o, i) => (
            <AnswerTile key={o.id} index={i} option={o} size="tv" />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 min-h-[124px]" aria-label="Who has locked in">
          {guessers.map((p) => {
            const isIn = locked.has(p.id);
            return (
              <div key={p.id} className="flex flex-col items-center w-[96px]" title={p.name}>
                <div className={`relative transition-all duration-300 ${isIn ? "pop-in" : overtime ? "shame-wobble" : "opacity-35 grayscale"}`}>
                  <Avatar name={p.name} piece={p.piece} size={size} />
                  {isIn && (
                    <span className="absolute -bottom-1 -right-1 grid place-items-center rounded-full w-8 h-8 bg-good text-black text-lg font-bold">
                      🔒
                    </span>
                  )}
                </div>
                <span className={`text-lg truncate max-w-full ${isIn ? "text-ink" : "text-muted"}`}>{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <TvFooter state={state}>
        <span className="font-display text-4xl whitespace-nowrap" aria-live="polite">
          {round.answeredCount} of {round.eligibleCount} locked in
        </span>
        {shameLine ? (
          <div className="shame-alert rounded-2xl border-4 border-white pl-4 pr-6 py-1.5 flex items-center gap-3 min-w-0 flex-1 shadow-2xl">
            <span className="font-display text-3xl font-bold text-white whitespace-nowrap">🚨 SHAME ALERT</span>
            <span className="flex -space-x-3 flex-none">
              {shameTargets.slice(0, 4).map((p) => (
                <span key={p.id} className="shame-wobble">
                  <Avatar name={p.name} piece={p.piece} size={56} />
                </span>
              ))}
            </span>
            <span className="min-w-0">
              <span key={shameLine} className="block font-display text-2xl font-bold text-white truncate pop-in">
                {shameLine}
              </span>
              <span className="block text-lg text-white/90 truncate">
                Time ran out {overtimeSecs}s ago. You can still answer…
                {state.settings.autoReveal && overtimeSecs < state.settings.overtimeSeconds
                  ? ` Revealing in ${state.settings.overtimeSeconds - overtimeSecs}s.`
                  : ""}
              </span>
            </span>
          </div>
        ) : subject && (
          <span className="flex items-center gap-2 text-2xl text-muted min-w-0">
            <Avatar name={subject.name} piece={subject.piece} size={52} />
            <span className="truncate">{subject.name} sits this one out</span>
          </span>
        )}
      </TvFooter>
      {round.paused && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center z-30">
          <span className="font-display text-9xl font-bold">Paused</span>
        </div>
      )}
    </div>
  );
}

// ---------- Reveal: who answered what, round winner/loser, stats ----------

function PieceChip({ name, piece, compact }: { name: string; piece: string | null; compact?: boolean }) {
  if (compact) {
    return (
      <span title={name} aria-label={name}>
        <Avatar name={name} piece={piece} size={52} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/30 pr-3 pl-1 py-0.5 text-xl font-sans font-semibold">
      <Avatar name={name} piece={piece} size={40} />
      {name}
    </span>
  );
}

type StatCard = { emoji: string; title: string; who?: { name: string; piece: string | null }[]; detail: string };

function StatCarousel({ state }: { state: GameStateDTO }) {
  const s = state.stats;
  const cards = useMemo(() => {
    if (!s) return [] as StatCard[];
    const out: StatCard[] = [];
    if (s.leader.length)
      out.push({
        emoji: "👑",
        title: s.leader.length > 1 ? "Tied for the lead" : "In the lead",
        who: s.leader,
        detail: `${s.leader[0].points.toLocaleString()} points`,
      });
    if (s.last.length)
      out.push({
        emoji: "🪣",
        title: "Bringing up the rear",
        who: s.last,
        detail: `${s.last[0].points.toLocaleString()} points. Plenty of time to rally!`,
      });
    for (const a of s.awards) out.push({ emoji: a.emoji, title: a.title, who: [{ name: a.name, piece: a.piece }], detail: a.detail });
    if (s.hardest && s.roundsPlayed > 1)
      out.push({ emoji: "🤯", title: "Hardest question so far", detail: `“${s.hardest.answerText}”: only ${s.hardest.pctCorrect}% got it` });
    return out;
  }, [s]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (cards.length <= 1) return;
    const id = setInterval(() => setI((x) => x + 1), 4000);
    return () => clearInterval(id);
  }, [cards.length]);
  if (!cards.length) return null;
  const c = cards[i % cards.length];
  return (
    <div key={i} className="panel px-5 py-2 pop-in flex items-center gap-4 h-[96px] overflow-hidden">
      <span className="text-5xl" aria-hidden="true">
        {c.emoji}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-4">
        <p className="font-display text-3xl text-accent-2 whitespace-nowrap">{c.title}</p>
        {c.who && (
          <div className="flex items-center gap-3 flex-wrap">
            {c.who.slice(0, 2).map((w) => (
              <span key={w.name} className="flex items-center gap-1 font-display text-3xl font-bold whitespace-nowrap">
                <Avatar name={w.name} piece={w.piece} size={56} /> {w.name}
              </span>
            ))}
          </div>
        )}
        <p className="text-2xl text-muted truncate">{c.detail}</p>
      </div>
    </div>
  );
}

function TvReveal({ state }: { state: GameStateDTO }) {
  const round = state.round!;
  const reveal = state.reveal;
  const byOption = useMemo(() => {
    const m: Record<string, { name: string; piece: string | null }[]> = {};
    for (const g of reveal?.guesses ?? []) (m[g.optionId] ??= []).push({ name: g.name, piece: g.piece });
    return m;
  }, [reveal]);
  if (!reveal) return null;
  const correct = round.options.find((o) => o.id === reveal.correctOptionId);
  const rs = reveal.roundStats;
  const compactChips = reveal.guesses.length > 6;
  const loserPick = rs.loser?.reason === "wrong" ? reveal.guesses.find((g) => g.name === rs.loser!.name) : null;
  const loserLabel = loserPick ? round.options.find((o) => o.id === loserPick.optionId)?.label : null;
  const statLine =
    rs.eligible === 0
      ? ""
      : rs.correct === rs.eligible
        ? "Everyone got it! 🎉"
        : rs.correct === 0
          ? `Nobody got it. ${reveal.subjectName} fooled the whole family!`
          : `${rs.correct} of ${rs.eligible} got it right`;

  return (
    <div className="h-full">
      <TvHeader state={state} center={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[115px] left-14 w-[1150px] bottom-[160px] flex flex-col gap-4 overflow-hidden">
        <p className="text-3xl text-muted leading-tight">{round.questionText}</p>
        <div className="panel-strong px-7 py-5 pop-in flex items-center gap-6">
          <Avatar name={reveal.subjectName} piece={reveal.subjectPiece} size={120} />
          <div className="min-w-0">
            <p className="text-2xl text-muted">Correct answer</p>
            <p className="font-display text-6xl font-bold gold-text leading-tight break-words">{correct?.label ?? reveal.answerText}</p>
            <p className="font-display text-3xl mt-1">{reveal.subjectName} submitted this!</p>
          </div>
        </div>
        <p className="font-display text-3xl text-accent-2">How everyone answered</p>
        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          {round.options.map((o, i) => {
            const who = byOption[o.id] ?? [];
            return (
              <AnswerTile
                key={o.id}
                index={i}
                option={o}
                size="xl"
                state={o.id === reveal.correctOptionId ? "correct" : "dim"}
                count={reveal.distribution[o.id] ?? 0}
                footer={
                  who.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5 mt-2">
                      {who.slice(0, compactChips ? 12 : 4).map((w) => (
                        <PieceChip key={w.name} name={w.name} piece={w.piece} compact={compactChips} />
                      ))}
                      {who.length > (compactChips ? 12 : 4) && (
                        <span className="text-xl self-center">+{who.length - (compactChips ? 12 : 4)}</span>
                      )}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </div>
      </div>
      <div className="absolute top-[115px] right-14 w-[620px] bottom-[160px] flex flex-col gap-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-3">
          <div className="panel p-4 flex flex-col items-center text-center gap-1">
            <span className="font-display text-2xl text-good">🏆 Round winner</span>
            {rs.winner ? (
              <>
                <Avatar name={rs.winner.name} piece={rs.winner.piece} size={84} />
                <span className="font-display text-3xl font-bold truncate max-w-full">{rs.winner.name}</span>
                <span className="text-lg text-muted">Fastest right answer · {(rs.winner.elapsedMs / 1000).toFixed(1)}s</span>
              </>
            ) : (
              <span className="text-xl text-muted py-6">Nobody this time!</span>
            )}
          </div>
          <div className="panel p-4 flex flex-col items-center text-center gap-1">
            <span className="font-display text-2xl text-bad">😬 Round loser</span>
            {rs.loser ? (
              <>
                <Avatar name={rs.loser.name} piece={rs.loser.piece} size={84} />
                <span className="font-display text-3xl font-bold truncate max-w-full">{rs.loser.name}</span>
                <span className="text-lg text-muted truncate max-w-full">
                  {rs.loser.reason === "missed"
                    ? "Didn't even answer!"
                    : rs.loser.reason === "slowest"
                      ? `Slowest right answer · ${(rs.loser.elapsedMs / 1000).toFixed(1)}s`
                      : `Went with “${loserLabel ?? "?"}” · ${(rs.loser.elapsedMs / 1000).toFixed(1)}s`}
                </span>
              </>
            ) : (
              <span className="text-xl text-muted py-6">No losers this round!</span>
            )}
          </div>
        </div>
        <div className="panel p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
          <h3 className="font-display text-3xl font-bold">Who guessed what</h3>
          <GuessList state={state} size="tv" />
        </div>
      </div>
      <TvFooter state={state}>
        <span className="font-display text-4xl text-accent-2 truncate">{statLine}</span>
      </TvFooter>
    </div>
  );
}

// ---------- Full-screen leaderboard (between questions) ----------

function TvLeaderboard({ state }: { state: GameStateDTO }) {
  const hasRound = Boolean(state.reveal && state.round);
  const [view, setView] = useState<"overall" | "round">("overall");
  useEffect(() => {
    if (!hasRound) return;
    const id = setInterval(() => setView((v) => (v === "overall" ? "round" : "overall")), 5000);
    return () => clearInterval(id);
  }, [hasRound]);
  const round = state.round;
  const showRound = hasRound && view === "round";
  return (
    <div className="h-full">
      <TvHeader state={state} center={round ? `After question ${round.number} of ${round.total}` : "Leaderboard"} />
      <div className="absolute top-[120px] inset-x-14 bottom-[160px] flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col items-center gap-2">
          <h2 key={view} className="font-display text-7xl font-bold gold-text text-center pop-in">
            {showRound ? "This round" : "Leaderboard"}
          </h2>
          {hasRound && (
            <div className="flex gap-3 text-2xl" aria-hidden="true">
              <span className={`rounded-full px-4 py-1 ${!showRound ? "bg-accent text-black font-semibold" : "bg-black/30 text-muted"}`}>Overall</span>
              <span className={`rounded-full px-4 py-1 ${showRound ? "bg-accent text-black font-semibold" : "bg-black/30 text-muted"}`}>This round</span>
            </div>
          )}
        </div>
        {showRound ? <RoundBoard state={state} /> : <OverallBoard state={state} />}
      </div>
      <TvFooter state={state}>
        <div className="flex-1 min-w-0">
          <StatCarousel state={state} />
        </div>
      </TvFooter>
    </div>
  );
}

function OverallBoard({ state }: { state: GameStateDTO }) {
  const standings = state.standings ?? [];
  const perPage = 16;
  const pages = Math.max(1, Math.ceil(standings.length / perPage));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), 4500);
    return () => clearInterval(id);
  }, [pages]);
  const rows = standings.slice((page % pages) * perPage, (page % pages) * perPage + perPage);
  const twoCols = standings.length > 8;
  const half = twoCols ? Math.ceil(rows.length / 2) : rows.length;
  const cols = twoCols ? [rows.slice(0, half), rows.slice(half)] : [rows];
  const big = !twoCols;
  return (
    <>
      <div className={`grid gap-6 ${twoCols ? "grid-cols-2" : "grid-cols-1 max-w-[1300px] w-full mx-auto"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className="flex flex-col gap-3">
            {col.map((s) => (
              <li
                key={s.playerId}
                className={`flex items-center gap-4 rounded-2xl px-5 ${big ? "py-3 text-4xl" : "py-2 text-3xl"} ${
                  s.rank === 1 ? "bg-accent/25 ring-2 ring-accent" : "bg-black/30"
                } pop-in`}
              >
                <span className="font-display font-bold w-[2.2ch] text-center text-accent-2">{s.rank}</span>
                <Avatar name={s.name} piece={s.piece} size={big ? 76 : 60} />
                <span className="flex-1 min-w-0 truncate font-display font-semibold">{s.name}</span>
                {s.lastRound !== undefined && s.lastRound !== null && (
                  <span className={`text-2xl tabular-nums ${s.lastRound > 0 ? "text-good" : "text-muted"}`}>
                    {s.lastRound > 0 ? `+${s.lastRound.toLocaleString()}` : "+0"}
                  </span>
                )}
                <span className="text-2xl text-muted tabular-nums whitespace-nowrap">{s.eligible ? `${Math.round(s.accuracy * 100)}%` : "–"}</span>
                <span className="font-display font-bold tabular-nums w-[5ch] text-right">{s.points.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        ))}
      </div>
      {pages > 1 && (
        <p className="text-center text-2xl text-muted">
          Page {(page % pages) + 1} of {pages}
        </p>
      )}
    </>
  );
}

/** This round only: the answer, then everyone's pick (right answers fastest first). */
function RoundBoard({ state }: { state: GameStateDTO }) {
  const round = state.round!;
  const reveal = state.reveal!;
  const pts = new Map((state.standings ?? []).map((s) => [s.playerId, s.lastRound ?? 0]));
  const guessed = new Map(reveal.guesses.map((g) => [g.playerId, g]));
  const rows = (state.players ?? [])
    .filter((p) => p.id !== round.subjectPlayerId)
    .map((p) => ({ p, g: guessed.get(p.id) }))
    .sort(
      (a, b) =>
        Number(Boolean(b.g?.correct)) - Number(Boolean(a.g?.correct)) ||
        Number(Boolean(b.g)) - Number(Boolean(a.g)) ||
        (a.g?.elapsedMs ?? 0) - (b.g?.elapsedMs ?? 0),
    );
  const twoCols = rows.length > 7;
  const half = twoCols ? Math.ceil(rows.length / 2) : rows.length;
  const cols = twoCols ? [rows.slice(0, half), rows.slice(half)] : [rows];
  const correct = round.options.find((o) => o.id === reveal.correctOptionId);
  const rs = reveal.roundStats;
  return (
    <>
      <div className="panel-strong px-6 py-3 flex items-center gap-5 max-w-[1600px] w-full mx-auto">
        <Avatar name={reveal.subjectName} piece={reveal.subjectPiece} size={72} />
        <div className="min-w-0 flex-1">
          <p className="text-2xl text-muted truncate">{round.questionText}</p>
          <p className="font-display text-4xl font-bold truncate">
            <span className="gold-text">{correct?.label ?? reveal.answerText}</span>
            <span className="text-2xl text-muted font-sans font-normal"> · {reveal.subjectName}&apos;s answer</span>
          </p>
        </div>
        <span className="font-display text-3xl text-accent-2 whitespace-nowrap">
          {rs.correct} of {rs.eligible} right
        </span>
      </div>
      <div className={`grid gap-6 ${twoCols ? "grid-cols-2" : "grid-cols-1 max-w-[1300px] w-full mx-auto"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className="flex flex-col gap-2.5">
            {col.map(({ p, g }) => {
              const idx = g ? round.options.findIndex((o) => o.id === g.optionId) : -1;
              const late = g && g.elapsedMs > round.durationMs;
              const points = pts.get(p.id) ?? 0;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2 text-2xl pop-in ${g?.correct ? "bg-good/20" : "bg-black/30"}`}
                >
                  <span className={`font-bold text-3xl w-[1.2ch] ${g?.correct ? "text-good" : "text-bad"}`} aria-label={g?.correct ? "correct" : "wrong"}>
                    {g?.correct ? "✓" : "✗"}
                  </span>
                  <Avatar name={p.name} piece={p.piece} size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-3xl font-semibold">{p.name}</span>
                    <span className="block truncate text-xl text-muted">
                      {g ? `${LETTERS[idx] ?? "?"}: ${round.options[idx]?.label ?? ""}` : "Didn't answer"}
                    </span>
                  </span>
                  <span className={`tabular-nums whitespace-nowrap ${late ? "text-bad font-semibold" : "text-muted"}`}>
                    {g ? `${late ? "🚨 " : ""}${(g.elapsedMs / 1000).toFixed(1)}s` : "—"}
                  </span>
                  <span className={`font-display font-bold tabular-nums w-[5ch] text-right ${points > 0 ? "text-good" : "text-muted"}`}>
                    +{points.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </>
  );
}

// ---------- Final: awards, then podium ----------

function TvFinal({ state, reduced }: { state: GameStateDTO; reduced: boolean }) {
  const standings = state.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  const awards = state.stats?.awards ?? [];
  const [awardsDone, setAwardsDone] = useState(false);
  const showPodium = awardsDone || awards.length === 0;
  useEffect(() => {
    if (showPodium) return;
    const id = setTimeout(() => setAwardsDone(true), Math.min(16000, 5000 + awards.length * 2000));
    return () => clearTimeout(id);
  }, [showPodium, awards.length]);

  useEffect(() => {
    if (reduced || !showPodium) return;
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
  }, [reduced, showPodium, state.theme]);

  if (!showPodium) {
    return (
      <div className="h-full flex flex-col px-16 pt-10 pb-16 gap-8 overflow-hidden">
        <div className="text-center">
          <p className="font-display text-4xl text-accent-2">Before we crown a winner…</p>
          <h2 className="font-display text-8xl font-bold gold-text">The Awards</h2>
        </div>
        <div className="grid grid-cols-3 gap-6 content-start">
          {awards.map((a, i) => (
            <div key={a.key} className="panel p-6 flex flex-col items-center text-center gap-2 rise" style={{ animationDelay: `${i * 700}ms` }}>
              <span className="text-6xl" aria-hidden="true">
                {a.emoji}
              </span>
              <span className="font-display text-3xl text-accent-2">{a.title}</span>
              <Avatar name={a.name} piece={a.piece} size={120} />
              <span className="font-display text-4xl font-bold">{a.name}</span>
              <span className="text-2xl text-muted">{a.detail}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-14 pt-10 pb-16 gap-6 overflow-hidden">
      <div className="text-center">
        <p className="font-display text-4xl text-accent-2">Final results</p>
        <h2 className="font-display text-8xl font-bold gold-text leading-tight">
          {winners.length > 2
            ? `A ${winners.length}-way tie for first!`
            : winners.length === 2
              ? `${winners[0].name} & ${winners[1].name} tie for the win!`
              : winners[0]
                ? `${winners[0].name} wins!`
                : "Thanks for playing!"}
        </h2>
      </div>
      <div className="flex-1 grid grid-cols-[1fr_620px] gap-10 min-h-0">
        <div className="flex flex-col justify-end items-center gap-6">
          <Podium standings={standings} size="tv" />
          <p className="text-3xl text-muted">
            Thanks for playing, everyone. What a {state.familyName ? `${state.familyName} family` : "family"}!
          </p>
        </div>
        <div className="panel p-6 flex flex-col gap-4 min-h-0">
          <h3 className="font-display text-4xl font-bold">Everyone</h3>
          <Leaderboard standings={standings} size="tv" pageSize={8} autoPageMs={6000} showAccuracy />
        </div>
      </div>
    </div>
  );
}
