"use client";

import confetti from "canvas-confetti";
import { useParams, useSearchParams } from "next/navigation";
import { createContext, Fragment, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnswerTile, Avatar, Banner, CountdownRing, LETTERS, Leaderboard, Podium, QrCode, Stage, TitleMark } from "@/components/ui";
import { useGameState, useServerNow } from "@/hooks/useGameState";
import { GuessList } from "@/components/RoundPanels";
import { api, ApiClientError, joinUrlFor, prettyUrl } from "@/lib/client/api";
import { splitQuestion } from "@/lib/questionText";
import { FitText } from "@/components/FitText";
import { PreQuestionCountdown } from "@/components/PreQuestionCountdown";
import { HowToPlay } from "@/components/tv/HowToPlay";
import { BOARD_IDS, BOARD_INFO, DEFAULT_BOARDS, type BoardId } from "@/lib/boards";
import { GalaxyBoard, GraveyardBoard, HeatingBoard, MysteryBoard, StumpersBoard } from "@/components/tv/Boards";
import { MusicPlayer } from "@/lib/client/music";
import { Announcer } from "@/lib/client/announcer";

/** Lets the leaderboard and final screens cue the announcer (null when the voice is off). */
const AnnouncerContext = createContext<React.RefObject<Announcer | null> | null>(null);
const useAnnouncer = () => useContext(AnnouncerContext)?.current ?? null;
import { Sfx } from "@/lib/client/sound";
import type { BoardsDTO, GameStateDTO } from "@/lib/dto";
import { hashString } from "@/lib/prng";
import type { MusicStyle } from "@/lib/settings";

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
  const [isFull, setIsFull] = useState(false);
  const prefersReduced = usePrefersReducedMotion();
  // Animations are a game setting (on by default, even if this computer asks for reduced motion).
  const motion = state?.animations ?? true;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("force-motion", motion);
    root.classList.toggle("no-motion", !motion);
    return () => root.classList.remove("force-motion", "no-motion");
  }, [motion]);

  // Sound is a game setting too. Browsers only allow sound after someone clicks or presses a key
  // on the page (unless they already trust the site), so try right away, then on the first
  // interaction, without needing a special button.
  const soundWanted = state ? state.sound : false;
  useEffect(() => {
    if (!soundWanted) {
      if (sfx.current?.enabled) {
        music.current?.stop();
        music.current = null;
        sfx.current.disable();
      }
      const t = setTimeout(() => setSoundOn(false), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    const tryUnlock = async () => {
      if (!sfx.current) sfx.current = new Sfx();
      const ok = await sfx.current.unlock();
      if (cancelled) return ok;
      if (ok) {
        setSoundOn(true);
        void sfx.current.preloadClips();
        remove();
      }
      return ok;
    };
    const onGesture = () => void tryUnlock();
    const remove = () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    void tryUnlock();
    return () => {
      cancelled = true;
      remove();
    };
  }, [soundWanted]);
  const reduced = prefersReduced && !motion;
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
  const style: MusicStyle = state?.music ?? "gameshow";
  const shouldPlay = soundOn && state?.phase === "QUESTION" && !state.round?.paused && style !== "off";
  useEffect(() => {
    const ctx = sfx.current?.context;
    if (!ctx) return;
    if (!music.current) music.current = new MusicPlayer(ctx);
    if (shouldPlay) music.current.play(style);
    else music.current.stop();
  }, [shouldPlay, style]);
  useEffect(() => () => music.current?.stop(), []);

  // ---- Announcer voice (TV only; a game setting, needs TV sound) ----
  const announcer = useRef<Announcer | null>(null);
  const voiceOn = soundOn && Boolean(state?.voice);
  useEffect(() => {
    const ctx = sfx.current?.context;
    if (!voiceOn || !ctx) {
      announcer.current?.stop();
      announcer.current = null;
      music.current?.duck(false);
      return;
    }
    if (!announcer.current) {
      announcer.current = new Announcer(ctx, (speaking) => music.current?.duck(speaking));
      void announcer.current.load();
    }
  }, [voiceOn]);
  useEffect(() => () => announcer.current?.stop(), []);

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const spokenRound = useRef<string | null>(null);
  const spokenPhase = useRef<string>("");
  useEffect(() => {
    const a = announcer.current;
    const r = state?.round;
    if (!a || !state) return;
    const serverNow = Date.now() + offsetMs;
    const phaseKey = `${state.phase}:${r?.id ?? ""}`;
    const phaseChanged = phaseKey !== spokenPhase.current;
    spokenPhase.current = phaseKey;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (state.phase === "QUESTION" && r && r.id !== spokenRound.current) {
      spokenRound.current = r.id;
      const opensAt = r.opensAt ? new Date(r.opensAt).getTime() : serverNow;
      void a.preload(r.promptId);
      // Joined late (TV refreshed mid-question)? Stay quiet rather than talk over the game.
      if (serverNow < opensAt + 3000) {
        if (serverNow < opensAt) void a.intro(r.number, r.total);
        // Count down with the big numbers (only the ones he has room for after the intro).
        for (const n of [5, 4, 3, 2, 1] as const) {
          const at = opensAt - n * 1000;
          if (at > serverNow)
            timers.push(
              setTimeout(() => {
                if (latest.current?.phase === "QUESTION" && latest.current.round?.id === r.id && !latest.current.round.paused) void a.count(n);
              }, at - serverNow),
            );
        }
        // "Go!" and read the question as it appears (after the countdown).
        timers.push(
          setTimeout(() => {
            // Skipped or ended during the countdown? Then don't read the old question.
            if (latest.current?.phase === "QUESTION" && latest.current.round?.id === r.id) void a.question(r.promptId);
          }, Math.max(0, opensAt - serverNow)),
        );
        // "Ten seconds left!" if people are still thinking.
        if (r.durationMs > 15000 && r.deadlineAt) {
          const at = new Date(r.deadlineAt).getTime() - 10000;
          timers.push(
            setTimeout(() => {
              const s = latest.current;
              const cur = s?.round;
              if (s?.phase === "QUESTION" && cur?.id === r.id && !cur.paused && cur.answeredCount < cur.eligibleCount) void a.extra("ten-seconds");
            }, Math.max(0, at - serverNow)),
          );
        }
      }
    } else if (phaseChanged && state.phase === "REVEAL") {
      void a.extra(Math.random() < 0.5 ? "drumroll" : "reveal", true);
    } else if (phaseChanged && state.phase === "LEADERBOARD") {
      void a.line("leaderboard", { interrupt: true });
    }
    // Only clean up the question timers when the round itself changes.
    if (timers.length) {
      const id = r?.id;
      return () => {
        if (latest.current?.round?.id !== id || latest.current?.phase !== "QUESTION") timers.forEach(clearTimeout);
      };
    }
  }, [state, offsetMs, voiceOn]);

  // Lobby: a "still waiting on a few players…" line now and then (every 25s, never over another line).
  const inLobby = state?.phase === "LOBBY";
  useEffect(() => {
    if (!inLobby || !voiceOn) return;
    const id = setInterval(() => void announcer.current?.line("waiting", { onlyIfQuiet: true }), 25000);
    return () => clearInterval(id);
  }, [inLobby, voiceOn]);

  // "Everyone's locked in!" when the last person locks in before time runs out.
  const allLockedSaid = useRef<string | null>(null);
  useEffect(() => {
    const r = state?.round;
    if (!announcer.current || state?.phase !== "QUESTION" || !r || r.eligibleCount < 2) return;
    if (r.answeredCount >= r.eligibleCount && allLockedSaid.current !== r.id && r.remainingMs > 0) {
      allLockedSaid.current = r.id;
      void announcer.current.extra("all-locked");
    }
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
          <div className="h-full flex flex-col items-center justify-center gap-10">
            <TitleMark title="Family Face-Off" theme={theme} size="xl" />
            {error && error.status >= 500 && (
              <p className="max-w-[1200px] text-center text-4xl text-bad">Couldn&apos;t load the game. If the app was just updated, the host needs to run the latest neon-setup.sql. Retrying…</p>
            )}
          </div>
        ) : (
          <AnnouncerContext.Provider value={announcer}>
            <TvScreen state={state} offsetMs={offsetMs} sfx={sfx} reduced={reduced} />
          </AnnouncerContext.Provider>
        )}
      <div
        className={`absolute top-6 right-8 z-50 flex gap-3 transition-opacity focus-within:opacity-100 ${controlsVisible || (soundWanted && !soundOn) ? "opacity-100" : "opacity-0"}`}
      >
        {soundWanted && !soundOn && (
          <span className="panel px-4 grid place-items-center text-xl text-muted min-h-[56px]" role="status">
            🔈 Click anywhere for sound
          </span>
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

function TvHeader({ state, center, right }: { state: GameStateDTO; center?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="absolute top-0 inset-x-0 h-[110px] px-14 grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="justify-self-start">
        <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="sm" />
      </div>
      <div className="font-display text-4xl text-accent-2">{center}</div>
      <div className="justify-self-end font-display text-4xl text-accent-2 pr-[340px]">{right}</div>
    </div>
  );
}

/** Footer band kept clear of the screen edge: info on the left, the host's "next" arrow on the right. */
function TvFooter({ state, children }: { state: GameStateDTO; children?: React.ReactNode }) {
  return (
    <div className="absolute inset-x-14 bottom-12 h-[96px] flex items-center gap-6">
      {state.phase !== "LOBBY" && state.phase !== "FINISHED" && <RejoinQr code={state.code} />}
      <div className="flex-1 min-w-0 flex items-center gap-6">{children}</div>
      <NextArrow state={state} />
    </div>
  );
}

/** Small corner QR so anyone who closed their browser can scan back in (their phone remembers them). */
function RejoinQr({ code }: { code: string }) {
  const url = useMemo(() => joinUrlFor(code), [code]);
  return (
    <div className="flex-none flex items-center gap-3">
      <QrCode url={url} size={76} label={`QR code to rejoin game ${code}`} />
      <div className="leading-tight text-muted">
        <div className="text-lg">Lost your spot?</div>
        <div className="text-lg">Scan to rejoin</div>
        <div className="font-display text-xl text-accent-2 tracking-wider">{code}</div>
      </div>
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
  // Someone walked away? Once time is up, a small arrow lets the host reveal without them.
  // It takes two taps (and no keyboard shortcut) so it can't happen by accident.
  if (!enabled) {
    const timeUp = state.phase === "QUESTION" && round && !round.paused && round.remainingMs <= 0;
    if (state.canControl && timeUp && !allIn) return <RevealAnyway state={state} />;
    return null;
  }
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

function RevealAnyway({ state }: { state: GameStateDTO }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(id);
  }, [armed]);
  const missing = (state.players ?? []).filter(
    (p) => p.id !== state.round?.subjectPlayerId && !(state.round?.lockedPlayerIds ?? []).includes(p.id),
  );
  const who = missing.length === 1 ? missing[0].name : `${missing.length} players`;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.currentTarget.blur();
        if (!armed) return setArmed(true);
        setBusy(true);
        api(`/api/games/${state.code}/action`, { method: "POST", body: { action: "reveal", expectedVersion: state.version } })
          .catch(() => undefined)
          .finally(() => setTimeout(() => setBusy(false), 600));
      }}
      className={
        armed
          ? "btn btn-primary flex-none !min-h-[64px] !px-6 !text-2xl whitespace-nowrap"
          : "flex-none rounded-full border-2 font-display bg-black/40 text-ink border-white/40 w-[64px] h-[64px] text-3xl grid place-items-center hover:bg-white/15"
      }
      aria-label={armed ? `Reveal without ${who}` : "Reveal without waiting (tap twice)"}
      title="Reveal without waiting"
    >
      {armed ? <>Reveal without {who}? ➜</> : <span aria-hidden="true">⏭</span>}
    </button>
  );
}

function TvLobby({ state }: { state: GameStateDTO }) {
  const joinUrl = useMemo(() => joinUrlFor(state.code), [state.code]);
  // "How to play" walkthrough: stays open (and survives a TV refresh) until someone closes it.
  const howtoKey = `ffo_howto_${state.code}`;
  const [howto, setHowto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(howtoKey) === "1") setHowto(true);
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [howtoKey]);
  const toggleHowto = (open: boolean) => {
    setHowto(open);
    try {
      if (open) localStorage.setItem(howtoKey, "1");
      else localStorage.removeItem(howtoKey);
    } catch {
      /* storage unavailable */
    }
  };
  if (howto) {
    return (
      <HowToPlay
        state={state}
        joinUrl={joinUrl}
        prettyJoin={prettyUrl(joinUrl)}
        startButton={<NextArrow state={state} />}
        onClose={() => toggleHowto(false)}
      />
    );
  }
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
        <div className="flex items-end justify-between gap-4">
          <h3 className="font-display text-5xl font-bold">Who&apos;s playing</h3>
          <button
            type="button"
            className="btn btn-ghost !min-h-[56px] !text-2xl ml-auto"
            onClick={(e) => {
              e.currentTarget.blur();
              toggleHowto(true);
            }}
          >
            📖 How to play
          </button>
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

const HURRY_EVERY_S = 8;

function TvQuestion({ state, offsetMs, sfx }: { state: GameStateDTO; offsetMs: number; sfx: React.RefObject<Sfx | null> }) {
  const round = state.round!;
  const now = useServerNow(offsetMs, !round.paused, 100);
  const remaining =
    round.paused || !round.deadlineAt || !now ? round.remainingMs : Math.min(round.durationMs, Math.max(0, new Date(round.deadlineAt).getTime() - now));
  const secs = Math.ceil(remaining / 1000);
  const onCountdownTick = () => {
    if (sfx.current?.enabled) sfx.current.tick();
  };
  const lastTick = useRef<number>(-1);
  useEffect(() => {
    if (!round.paused && secs <= 5 && secs > 0 && secs !== lastTick.current) {
      lastTick.current = secs;
      if (sfx.current?.enabled) sfx.current.finalBeep(secs);
    }
  }, [secs, round.paused, sfx]);

  const players = state.players ?? [];
  const locked = new Set(round.lockedPlayerIds ?? []);
  const order = new Map((round.lockedPlayerIds ?? []).map((id, i) => [id, i]));
  const subject = players.find((p) => p.id === round.subjectPlayerId);
  // "Who submitted this answer?" rounds must not reveal who the subject is.
  const secret = round.type === "WHO_ANSWERED";
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
  // While someone is still holding things up: "Hurry up!" the moment time runs out, then
  // every 8 seconds until they answer or the round is revealed. (No siren.)
  const hurryBucket = shameTargets.length ? Math.floor(overtimeSecs / HURRY_EVERY_S) : -1;
  const lastHurry = useRef(-1);
  useEffect(() => {
    if (hurryBucket >= 0 && hurryBucket !== lastHurry.current) {
      lastHurry.current = hurryBucket;
      if (sfx.current?.enabled) sfx.current.hurryUp();
    }
  }, [hurryBucket, sfx]);

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
  // Lock-in strip: people slide left into the order they locked in (1st on the far left),
  // with everyone still thinking after them. Mystery rounds keep the roster order.
  const stripOrder = secret
    ? players
    : [
        ...guessers.filter((p) => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!),
        ...guessers.filter((p) => !order.has(p.id)),
      ];
  const stripRowH = size + 32;
  const stripRows = Math.max(1, Math.ceil(stripOrder.length / STRIP_PER_ROW));

  return (
    <div className="h-full">
      <TvHeader state={state} right={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[110px] inset-x-14 bottom-[180px] flex flex-col gap-5">
        <div className="flex-1 flex items-center gap-10 min-h-0">
          {secret ? (
            <div
              className="flex-none grid place-items-center rounded-full bg-black/30 border-4 border-accent font-display text-[9rem] text-accent-2"
              style={{ width: 230, height: 230 }}
              aria-label="Mystery player"
            >
              ?
            </div>
          ) : (
            subject && (
              <div className="flex-none flex flex-col items-center pop-in" key={subject.id}>
                <Avatar name={subject.name} piece={subject.piece} size={250} />
              </div>
            )
          )}
          <div className="flex-1 min-w-0">
            {(() => {
              const q = splitQuestion(round.questionText);
              return q.lead ? (
                <h2 className="font-display font-bold">
                  <span className="block text-5xl text-accent-2 truncate leading-tight">{q.lead}</span>
                  {/* Always two lines at most: long questions get smaller instead of spilling into the answers. */}
                  <FitText text={q.question} max={86} min={44} className="mt-2" />
                </h2>
              ) : (
                <h2 className="font-display font-bold">
                  <FitText text={round.questionText} max={74} min={40} />
                </h2>
              );
            })()}
            {round.clue && (
              <p className="mt-5 panel-strong inline-block px-8 py-4 font-display text-6xl">
                “{round.clue}” <span className="text-3xl text-muted font-sans align-middle">for “{round.promptText}”</span>
              </p>
            )}
            <div className="h-[96px] mt-3 flex items-center">
              {taunt && (
                <div key={taunt} className="-rotate-1 pop-in panel-strong px-8 py-3 border-4 !border-accent shadow-2xl inline-block max-w-full">
                  {/* Stays inside the question column so it never runs under the countdown ring. */}
                  <span className={`block font-display font-bold text-accent-2 truncate ${taunt.length > 44 ? "text-4xl" : "text-5xl"}`}>{taunt}</span>
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
        <div className="relative" style={{ height: stripRows * stripRowH }} aria-label="Who has locked in">
          {stripOrder.map((p, i) => {
            // On mystery rounds the subject is shown like everyone else (as locked in) so nobody can tell.
            const isIn = locked.has(p.id) || (secret && p.id === round.subjectPlayerId);
            return (
              <div
                key={p.id}
                className="absolute flex flex-col items-center w-[96px] transition-[left,top] duration-500 ease-out"
                style={{ left: (i % STRIP_PER_ROW) * STRIP_SLOT, top: Math.floor(i / STRIP_PER_ROW) * stripRowH }}
                title={p.name}
              >
                <div className={`relative transition-all duration-300 ${isIn ? "pop-in" : overtime ? "shame-wobble" : "opacity-35 grayscale"}`}>
                  <Avatar name={p.name} piece={p.piece} size={size} />
                  {isIn &&
                    (order.has(p.id) && !secret ? (
                      <span
                        className={`absolute -bottom-1 -right-2 rounded-full px-2 h-8 grid place-items-center font-display text-lg font-bold text-black shadow-lg ${
                          ORDINAL_BG[order.get(p.id)!] ?? "bg-good"
                        }`}
                        aria-label={`Locked in ${ordinal(order.get(p.id)! + 1)}`}
                      >
                        {ordinal(order.get(p.id)! + 1)}
                      </span>
                    ) : (
                      <span className="absolute -bottom-1 -right-1 grid place-items-center rounded-full w-8 h-8 bg-good text-black text-lg font-bold">
                        🔒
                      </span>
                    ))}
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
        ) : secret ? (
          <span className="text-2xl text-muted">One mystery person sits this one out 🤫</span>
        ) : subject && (
          <span className="flex items-center gap-2 text-2xl text-muted min-w-0">
            <span className="truncate">{subject.name} sits this one out</span>
          </span>
        )}
      </TvFooter>
      {round.paused && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center z-30">
          <span className="font-display text-9xl font-bold">Paused</span>
        </div>
      )}
      <PreQuestionCountdown round={round} offsetMs={offsetMs} variant="tv" seconds={state.countdownSeconds} onTick={onCountdownTick} />
    </div>
  );
}

const STRIP_SLOT = 108; // 96px item + 12px gap
const STRIP_PER_ROW = 16;

const ORDINAL_BG: Record<number, string> = { 0: "bg-[#ffd54a]", 1: "bg-[#d9dee8]", 2: "bg-[#e0a066]" };

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** A winner's or loser's catchphrase, as a speech bubble that pops in after the card. */
function SloganBubble({ text, kind }: { text: string; kind: "win" | "lose" }) {
  if (!text) return null;
  return (
    <span
      className={`slogan-pop relative mt-2 max-w-full rounded-2xl px-4 py-1.5 font-display text-2xl font-bold leading-tight ${
        kind === "win" ? "bg-accent text-black" : "bg-bad/80 text-white"
      }`}
      style={{ animationDelay: "0.9s" }}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1/2 -top-2 -translate-x-1/2 w-4 h-4 rotate-45 ${kind === "win" ? "bg-accent" : "bg-bad/80"}`}
      />
      <span className="relative line-clamp-2">“{text}”</span>
    </span>
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
          <div className="flex items-center gap-3 flex-none min-w-0">
            {c.who.slice(0, 2).map((w) => (
              <span key={w.name} className="flex items-center gap-1 font-display text-3xl font-bold whitespace-nowrap">
                <Avatar name={w.name} piece={w.piece} size={56} /> {w.name}
              </span>
            ))}
            {c.who.length > 2 && <span className="font-display text-2xl text-muted whitespace-nowrap">+{c.who.length - 2} more</span>}
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
      <TvHeader state={state} right={`Question ${round.number} of ${round.total}`} />
      <div className="absolute top-[115px] left-14 w-[1150px] bottom-[176px] flex flex-col gap-4 overflow-hidden px-2 pb-2">
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
      <div className="absolute top-[115px] right-14 w-[620px] bottom-[176px] flex flex-col gap-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-3">
          <div className="panel p-4 flex flex-col items-center text-center gap-1">
            <span className="font-display text-2xl text-good">🏆 Round winner</span>
            {rs.winner ? (
              <>
                <Avatar name={rs.winner.name} piece={rs.winner.piece} size={68} />
                <span className="font-display text-3xl font-bold truncate max-w-full">{rs.winner.name}</span>
                <span className="text-lg text-muted">Fastest right answer · {(rs.winner.elapsedMs / 1000).toFixed(1)}s</span>
                <SloganBubble text={rs.winner.slogan} kind="win" />
              </>
            ) : (
              <span className="text-xl text-muted py-6">Nobody this time!</span>
            )}
          </div>
          <div className="panel p-4 flex flex-col items-center text-center gap-1">
            <span className="font-display text-2xl text-bad">😬 Round loser</span>
            {rs.loser ? (
              <>
                <Avatar name={rs.loser.name} piece={rs.loser.piece} size={68} />
                <span className="font-display text-3xl font-bold truncate max-w-full">{rs.loser.name}</span>
                <span className="text-lg text-muted truncate max-w-full">
                  {rs.loser.reason === "missed"
                    ? "Didn't even answer!"
                    : rs.loser.reason === "slowest"
                      ? `Slowest right answer · ${(rs.loser.elapsedMs / 1000).toFixed(1)}s`
                      : `Went with “${loserLabel ?? "?"}” · ${(rs.loser.elapsedMs / 1000).toFixed(1)}s`}
                </span>
                <SloganBubble text={rs.loser.slogan} kind="lose" />
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

type BoardView = BoardId;
const BOARD_VIEWS: { id: BoardView; label: string; title: string }[] = BOARD_IDS.map((id) => ({
  id,
  label: BOARD_INFO[id].label,
  title: BOARD_INFO[id].title,
}));

const ROTATE_MS = 5000;
const MANUAL_HOLD_MS = 20000;

function TvLeaderboard({ state }: { state: GameStateDTO }) {
  const hasRound = Boolean(state.reveal && state.round);
  const [view, setView] = useState<BoardView>("overall");
  const hasLeader = Boolean(state.stats?.leaderRun);
  const b = state.stats?.boards;
  const played = state.stats?.roundsPlayed ?? 0;
  const available: Record<BoardView, boolean> = {
    overall: true,
    round: true,
    reaction: true,
    bets: true,
    heating: Boolean(b && played >= 2 && b.form.length > 0),
    stumpers: Boolean(b && b.stumpers.length >= 2),
    mystery: Boolean(b && b.mystery.length >= 2),
    galaxy: Boolean(b && b.galaxy.length >= 2),
    graveyard: Boolean(b && b.graveyard.length > 0),
    leader: hasLeader,
  };
  const chosen = new Set(state.boards?.length ? state.boards : DEFAULT_BOARDS);
  const views = BOARD_VIEWS.filter((v) => available[v.id] && chosen.has(v.id));
  if (!views.length) views.push(BOARD_VIEWS[0]);
  const viewKey = views.map((v) => v.id).join(",");
  // Each "cycle" is one timed stretch: ROTATE_MS normally, MANUAL_HOLD_MS after someone picks a tab.
  const [cycle, setCycle] = useState({ n: 0, ms: ROTATE_MS, held: false });
  useEffect(() => {
    if (!hasRound) return;
    const ids = viewKey.split(",") as BoardView[];
    const id = setTimeout(() => {
      if (!cycle.held) setView((v) => ids[(ids.indexOf(v) + 1) % ids.length]);
      setCycle((c) => ({ n: c.n + 1, ms: ROTATE_MS, held: false }));
    }, cycle.ms);
    return () => clearTimeout(id);
  }, [hasRound, viewKey, cycle]);
  const pick = (v: BoardView) => {
    setView(v);
    setCycle((c) => ({ n: c.n + 1, ms: MANUAL_HOLD_MS, held: true }));
  };
  const round = state.round;
  const current: BoardView = views.some((v) => v.id === view) && hasRound ? view : views[0].id;
  // "Let's see who nailed that round" the first time the This round page comes up.
  const announcer = useAnnouncer();
  const roundCued = useRef(false);
  useEffect(() => {
    if (current !== "round" || roundCued.current || !announcer) return;
    roundCued.current = true;
    void announcer.line("round-winner");
  }, [current, announcer]);
  return (
    <div className="h-full">
      <TvHeader state={state} center={round ? `After question ${round.number} of ${round.total}` : "Leaderboard"} />
      <div className="absolute top-[120px] inset-x-14 bottom-[176px] flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col items-center gap-2">
          <h2 key={current} className="font-display text-7xl font-bold gold-text text-center pop-in">
            {(() => {
              // Emoji sit outside the gold gradient text, otherwise they render as solid gold blobs.
              const t = BOARD_VIEWS.find((v) => v.id === current)!.title;
              const m = /^(.*?)\s*(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)$/u.exec(t);
              return m ? (
                <>
                  {m[1]}{" "}
                  <span className="emoji-plain" aria-hidden="true">
                    {m[2]}
                  </span>
                </>
              ) : (
                t
              );
            })()}
          </h2>
          {hasRound && (
            <div className="flex items-center justify-center flex-wrap gap-2 text-xl" role="tablist" aria-label="Leaderboard pages">
              {views.map((v) => {
                const active = current === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={(e) => {
                      pick(v.id);
                      // Keep Enter/Space for the host's "next" shortcut, not this tab.
                      e.currentTarget.blur();
                    }}
                    className={`relative overflow-hidden rounded-full px-4 py-1 transition-colors ${
                      active ? "bg-accent text-black font-semibold" : "bg-black/30 text-muted hover:bg-white/15 hover:text-ink"
                    }`}
                  >
                    {v.label}
                    {active && (
                      <span
                        key={cycle.n}
                        aria-hidden="true"
                        className={`tab-timer absolute left-0 bottom-0 h-2 ${cycle.held ? "bg-[#b3264f]" : "bg-black/55"}`}
                        style={{ "--tab-ms": `${cycle.ms}ms` } as React.CSSProperties}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {current === "round" ? (
          <RoundBoard state={state} onBrowse={() => pick("round")} />
        ) : current === "reaction" ? (
          <ReactionBoard state={state} />
        ) : current === "bets" ? (
          <BetsBoard state={state} />
        ) : current === "leader" ? (
          <LeaderBoardPage state={state} />
        ) : current === "heating" && b ? (
          <HeatingBoard boards={b} />
        ) : current === "stumpers" && b ? (
          <StumpersBoard boards={b} />
        ) : current === "mystery" && b ? (
          <MysteryBoard boards={b} />
        ) : current === "galaxy" && b ? (
          <GalaxyBoard boards={b} />
        ) : current === "graveyard" && b ? (
          <GraveyardBoard boards={b} />
        ) : (
          <OverallBoard state={state} />
        )}
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
  // The leader gets a double-height spotlight row. With a tie for first (or nobody scoring yet)
  // a spotlight would be misleading, so up to two co-leaders share it and bigger ties use the plain list.
  const leaders = standings.filter((s) => s.rank === 1);
  const spotlight = leaders.length <= 2 && (leaders[0]?.points ?? 0) > 0 ? leaders : [];
  const rest = standings.slice(spotlight.length);
  const twoCols = spotlight.length ? rest.length > 4 : rest.length > 5;
  const perPage = spotlight.length ? (twoCols ? 10 : 4) : 16;
  const pages = Math.max(1, Math.ceil(rest.length / perPage));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), 4500);
    return () => clearInterval(id);
  }, [pages]);
  const rows = rest.slice((page % pages) * perPage, (page % pages) * perPage + perPage);
  const half = twoCols ? Math.ceil(rows.length / 2) : rows.length;
  const cols = twoCols ? [rows.slice(0, half), rows.slice(half)] : [rows];
  const big = !twoCols;
  return (
    <>
      {spotlight.length > 0 && (
        <div className={`grid gap-6 w-full mx-auto ${spotlight.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[1300px]"}`}>
          {spotlight.map((s) => {
            const duo = spotlight.length > 1;
            return (
              <div
                key={s.playerId}
                className={`flex items-center rounded-3xl h-[196px] bg-accent/25 ring-4 ring-inset ring-accent shadow-[0_0_60px_rgba(255,200,60,0.25)] pop-in ${duo ? "gap-4 px-6" : "gap-6 px-8"}`}
                aria-label={`First place: ${s.name}, ${s.points} points`}
              >
                {!duo && <span className="text-8xl w-[1.2em] text-center" aria-hidden="true">👑</span>}
                <Avatar name={s.name} piece={s.piece} size={duo ? 150 : 164} />
                <div className="flex-1 min-w-0">
                  <div className={`truncate font-display font-bold ${duo ? "text-5xl" : "text-7xl"}`}>
                    {duo && <span aria-hidden="true">👑 </span>}
                    {s.name}
                  </div>
                  <div className="flex gap-5 text-3xl text-muted tabular-nums mt-2 whitespace-nowrap">
                    {!duo && <span>1st place</span>}
                    {duo && <span>Tied for 1st</span>}
                    {s.lastRound != null && (
                      <span className={s.lastRound > 0 ? "text-good" : ""}>{s.lastRound > 0 ? `+${s.lastRound.toLocaleString()}` : "+0"}</span>
                    )}
                    {!duo && s.eligible > 0 && <span>{Math.round(s.accuracy * 100)}%</span>}
                  </div>
                </div>
                <span className={`font-display font-bold tabular-nums gold-text ${duo ? "text-6xl" : "text-8xl"}`}>{s.points.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className={`grid gap-6 ${twoCols ? "grid-cols-2" : "grid-cols-1 max-w-[1300px] w-full mx-auto"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className={`flex flex-col ${twoCols ? "gap-2" : "gap-3"}`}>
            {col.map((s) => (
              <li
                key={s.playerId}
                className={`flex items-center gap-4 rounded-2xl px-5 ${big ? "h-[98px] text-4xl" : "h-[72px] text-3xl"} ${
                  s.rank === 1 ? "bg-accent/25 ring-2 ring-inset ring-accent" : "bg-black/30"
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

/**
 * "Place your bets": a horse race where everyone's piece has run as far as their points.
 * The leader sits near (not on) the finish line until the game is over; odds come from each
 * player's share of the points, so it's for fun, not a prediction.
 */
const RACE_MS = 2200;
const RACE_STAGGER = 70;

function BetsBoard({ state }: { state: GameStateDTO }) {
  const standings = state.standings ?? [];
  const round = state.round;
  const toGo = round ? Math.max(0, round.total - round.number) : 0;
  const top = Math.max(1, standings[0]?.points ?? 0);
  const weights = standings.map((s) => (s.points + 500) ** 2);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const laneH = Math.min(84, Math.floor(540 / Math.max(1, standings.length)));
  const av = Math.max(36, Math.min(76, laneH - 4));
  const compact = laneH < 64;
  // Everyone starts at the gate and gallops to their spot each time this page appears.
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGo(true), 120);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <p className="text-center text-3xl text-muted -mt-1">
        {toGo > 0 ? `${toGo} question${toGo === 1 ? "" : "s"} to go. Who's your money on?` : "Down the final stretch!"}
      </p>
      <div className="relative mx-auto w-full max-w-[1760px] rounded-3xl overflow-hidden border-4 border-white/70 bg-[#2f7d3a] shadow-2xl">
        {/* Finish line */}
        <div
          className="absolute top-0 bottom-0 right-[190px] w-6 z-10"
          style={{ background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 12px 12px" }}
          aria-hidden="true"
        />
        <ol aria-label="Horse race standings">
          {standings.map((s, i) => {
            const pct = s.points <= 0 ? 0 : (s.points / top) * 0.86;
            const share = weights[i] / sum;
            const fav = i === 0 && s.points > 0 && (standings[1]?.points ?? -1) < s.points;
            const odds = Math.max(1, Math.round((1 - share) / share));
            const oddsText = fav ? "Favorite" : odds >= 50 ? "Long shot" : `${odds}–1`;
            return (
              <li
                key={s.playerId}
                className={`relative flex items-center border-b-2 border-dashed border-white/40 last:border-b-0 ${i % 2 ? "bg-[#2a7334]" : ""}`}
                style={{ height: laneH }}
              >
                <span className="w-[300px] flex-none flex items-center gap-3 pl-4 pr-2 bg-black/35 h-full">
                  <span className="font-display text-3xl text-accent-2 w-[1.6ch] text-right">{s.rank}</span>
                  <span className={`truncate font-display font-semibold ${laneH < 56 ? "text-2xl" : "text-3xl"}`}>{s.name}</span>
                </span>
                <span className="relative flex-1 h-full">
                  {/* Trail: a line under each runner from the gate to where they are now. */}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 bottom-[3px] h-[6px] rounded-full bg-gradient-to-r from-white/10 via-white/50 to-accent ease-out"
                    style={{
                      width: go ? `calc(${pct * 100}% - ${pct * av}px + ${av / 2}px)` : 0,
                      transition: `width ${RACE_MS}ms cubic-bezier(.25,.8,.3,1) ${i * RACE_STAGGER}ms`,
                    }}
                  />
                  <span
                    className="absolute top-1/2"
                    style={{
                      left: go ? `calc(${pct * 100}% - ${pct * av}px)` : 0,
                      transform: "translateY(-50%)",
                      transition: `left ${RACE_MS}ms cubic-bezier(.25,.8,.3,1) ${i * RACE_STAGGER}ms`,
                    }}
                  >
                    <span
                      className={`block ${s.points > 0 ? "gallop" : ""}`}
                      style={{ animationDelay: `${i * RACE_STAGGER}ms` }}
                    >
                      <Avatar name={s.name} piece={s.piece} size={av} />
                    </span>
                  </span>
                </span>
                <span className={`w-[190px] flex-none tabular-nums ${compact ? "flex items-baseline justify-center gap-2" : "text-center"}`}>
                  <span className={`font-display font-bold leading-none ${compact ? "text-2xl" : "block text-3xl"}`}>{oddsText}</span>
                  <span className={`text-white/80 ${compact ? "text-lg" : "block text-xl"}`}>{compact ? s.points.toLocaleString() : `${s.points.toLocaleString()} pts`}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-center text-xl text-muted">Odds are just for fun. Bragging rights only!</p>
    </>
  );
}

const RESULT_STYLE = {
  right: { mark: "✓", cls: "bg-good/30 border-good text-good", label: "right" },
  wrong: { mark: "✗", cls: "bg-bad/20 border-bad text-bad", label: "wrong" },
  missed: { mark: "–", cls: "bg-black/30 border-white/20 text-muted", label: "no answer" },
  subject: { mark: "★", cls: "bg-accent/20 border-accent text-accent-2", label: "question about them" },
} as const;

/** The last page: everything about the current leader, round by round. */
const FIELD_COLORS = ["#7dd3fc", "#f9a8d4", "#86efac", "#c4b5fd", "#fdba74", "#67e8f9", "#fca5a5", "#bef264", "#a5b4fc", "#fcd34d", "#5eead4", "#f0abfc"];

/** The last page: everything about the current leader, round by round, against the whole field. */
function LeaderBoardPage({ state }: { state: GameStateDTO }) {
  const run = state.stats!.leaderRun!;
  const accuracy = run.eligible ? Math.round((run.correct / run.eligible) * 100) : 0;
  const recent = run.history.slice(-12);
  const field = run.field.length ? run.field : [{ playerId: run.playerId, name: run.name, piece: run.piece, ranks: run.history.map((h) => h.rank) }];
  const maxRank = Math.max(2, ...field.flatMap((f) => f.ranks));
  const W = 1040;
  const Hh = 250;
  const padR = 70; // room for the end-of-line pieces
  const n = run.history.length;
  const x = (i: number) => (n <= 1 ? (W - padR) / 2 : 36 + (i * (W - padR - 50)) / (n - 1));
  const y = (rank: number) => 18 + ((rank - 1) * (Hh - 36)) / (maxRank - 1);
  const pathFor = (ranks: number[]) => ranks.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const others = field.filter((f) => f.playerId !== run.playerId);
  // End-of-line pieces: players sharing a final rank are fanned out sideways so none hide another.
  const ends = new Map<number, number>();
  const endPos = field.map((f) => {
    const r = f.ranks[f.ranks.length - 1] ?? 1;
    const k = ends.get(r) ?? 0;
    ends.set(r, k + 1);
    return { f, r, k };
  });
  const endSize = field.length > 8 ? 30 : 40;
  return (
    <div className="flex gap-8 flex-1 min-h-0 max-w-[1760px] w-full mx-auto">
      <div className="panel-strong w-[560px] flex-none flex flex-col items-center justify-center gap-3 px-6 py-4 ring-4 ring-inset ring-accent overflow-hidden">
        <span className="text-5xl leading-none leader-float" style={{ animationDelay: "-0.4s" }} aria-hidden="true">
          👑
        </span>
        <span className="leader-float">
          <Avatar name={run.name} piece={run.piece} size={200} />
        </span>
        <span className="font-display text-6xl font-bold text-center leading-tight">{run.name}</span>
        <span className="text-3xl text-muted">{run.tied ? "Tied for 1st" : "In 1st place"}</span>
        <span className="font-display text-7xl font-bold gold-text tabular-nums pop-in">{run.points.toLocaleString()}</span>
        <div className="grid grid-cols-3 gap-3 w-full text-center">
          {[
            { big: `${accuracy}%`, small: `${run.correct} of ${run.eligible} right` },
            { big: `🔥 ${run.bestStreak}`, small: "best streak" },
            { big: run.avgCorrectMs === null ? "–" : `${(run.avgCorrectMs / 1000).toFixed(1)}s`, small: "avg right answer" },
          ].map((c, i) => (
            <div key={c.small} className="rounded-2xl bg-black/30 py-2 tile-in" style={{ animationDelay: `${300 + i * 120}ms` }}>
              <div className="font-display text-4xl font-bold">{c.big}</div>
              <div className="text-lg text-muted">{c.small}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="panel p-4">
          <h3 className="font-display text-3xl">
            Where everyone stood after each question <span className="text-2xl text-accent-2 font-sans">· gold = {run.name}</span>
          </h3>
          <div className="relative w-full" style={{ height: Hh }}>
            <svg
              viewBox={`0 0 ${W} ${Hh}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full overflow-visible"
              role="img"
              aria-label={`${run.name}'s rank after each question: ${run.history.map((h) => h.rank).join(", ")}`}
            >
              {Array.from({ length: maxRank }, (_, r) => (
                <line key={r} x1={30} x2={W - padR + 10} y1={y(r + 1)} y2={y(r + 1)} stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
              ))}
              {others.map((f, i) => (
                <path
                  key={f.playerId}
                  d={pathFor(f.ranks)}
                  pathLength={1}
                  className="draw-line"
                  style={{ ["--len" as string]: 1, animationDelay: `${i * 60}ms` } as React.CSSProperties}
                  fill="none"
                  stroke={FIELD_COLORS[i % FIELD_COLORS.length]}
                  strokeOpacity={0.55}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                d={pathFor(run.history.map((h) => h.rank))}
                pathLength={1}
                className="draw-line"
                style={{ ["--len" as string]: 1, animationDelay: "250ms" } as React.CSSProperties}
                fill="none"
                stroke="#f5c542"
                strokeWidth={8}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="absolute left-0 text-xl text-muted" style={{ top: `calc(${(y(1) / Hh) * 100}% - 0.7em)` }}>
              1
            </span>
            <span className="absolute left-0 text-xl text-muted" style={{ top: `calc(${(y(maxRank) / Hh) * 100}% - 0.7em)` }}>
              {maxRank}
            </span>
            {endPos.map(({ f, r, k }) => (
              <span
                key={f.playerId}
                className={`absolute pop-in ${f.playerId === run.playerId ? "z-10" : ""}`}
                style={{
                  left: `calc(${(x(n - 1) / W) * 100}% + ${8 + k * (endSize * 0.55)}px)`,
                  top: `calc(${(y(r) / Hh) * 100}% - ${endSize / 2}px)`,
                  animationDelay: "1.4s",
                }}
                title={f.name}
              >
                <Avatar name={f.name} piece={f.piece} size={f.playerId === run.playerId ? endSize + 12 : endSize} />
              </span>
            ))}
          </div>
        </div>
        <div className="panel p-4 flex-1 min-h-0 overflow-hidden">
          <h3 className="font-display text-3xl mb-3">
            {run.name}&apos;s questions{run.history.length > recent.length ? ` (last ${recent.length})` : ""}
          </h3>
          <ol className="grid grid-cols-6 gap-3">
            {recent.map((h, i) => {
              const st = RESULT_STYLE[h.result];
              return (
                <li
                  key={h.number}
                  className={`rounded-2xl border-2 ${st.cls} px-3 py-2 tile-in`}
                  style={{ animationDelay: `${500 + i * 70}ms` }}
                  aria-label={`Question ${h.number}: ${st.label}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-accent text-black font-display font-bold text-2xl px-3 leading-snug">Q{h.number}</span>
                    <span className="font-display text-4xl font-bold leading-none">{st.mark}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1 whitespace-nowrap">
                    <span className="text-xl text-ink tabular-nums">
                      {h.result === "subject" ? "About them" : h.points > 0 ? `+${h.points.toLocaleString()}` : "+0"}
                    </span>
                    {h.elapsedMs !== null && <span className="text-lg text-muted tabular-nums">{(h.elapsedMs / 1000).toFixed(1)}s</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * This round's reaction times in a 2x2: quick or slow (split at the round's median answer time)
 * against right or wrong. Anyone who didn't answer lands in slow + wrong.
 */
function ReactionBoard({ state }: { state: GameStateDTO }) {
  const round = state.round!;
  const reveal = state.reveal!;
  const guessed = new Map(reveal.guesses.map((g) => [g.playerId, g]));
  const times = reveal.guesses.map((g) => g.elapsedMs).sort((a, b) => a - b);
  const cutoff = times.length >= 2 ? times[Math.floor((times.length - 1) / 2)] : round.durationMs / 2;
  type Entry = { id: string; name: string; piece: string | null; ms: number | null };
  const boxes: Record<"fastRight" | "fastWrong" | "slowRight" | "slowWrong", Entry[]> = {
    fastRight: [],
    fastWrong: [],
    slowRight: [],
    slowWrong: [],
  };
  for (const p of state.players ?? []) {
    if (p.id === round.subjectPlayerId) continue;
    const g = guessed.get(p.id);
    const e: Entry = { id: p.id, name: p.name, piece: p.piece, ms: g ? g.elapsedMs : null };
    const fast = g ? g.elapsedMs <= cutoff : false;
    boxes[fast ? (g!.correct ? "fastRight" : "fastWrong") : g?.correct ? "slowRight" : "slowWrong"].push(e);
  }
  for (const list of Object.values(boxes)) list.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  const cells: { key: keyof typeof boxes; emoji: string; title: string; sub: string; tone: string }[] = [
    { key: "fastRight", emoji: "⚡", title: "Quick & right", sub: "Lightning brains", tone: "bg-good/25 border-good" },
    { key: "fastWrong", emoji: "🙈", title: "Quick & wrong", sub: "Trigger happy", tone: "bg-bad/20 border-bad" },
    { key: "slowRight", emoji: "🐢", title: "Slow & right", sub: "Slow and steady", tone: "bg-good/10 border-good/60" },
    { key: "slowWrong", emoji: "🫠", title: "Slow & wrong", sub: "Took their time… still wrong", tone: "bg-black/30 border-white/20" },
  ];
  // Bigger chips when the busiest box has room for them.
  const many = Math.max(...Object.values(boxes).map((b) => b.length)) > 4;
  return (
    <>
      <p className="text-center text-2xl text-muted -mt-1">
        Quick = answered in {(cutoff / 1000).toFixed(1)}s or less this round
      </p>
      <div className="grid grid-cols-[auto_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-3 flex-1 min-h-0 max-w-[1700px] w-full mx-auto">
        <span />
        <span className="text-center font-display text-3xl text-good">✓ Right</span>
        <span className="text-center font-display text-3xl text-bad">✗ Wrong</span>
        {(["Quick", "Slow"] as const).map((rowLabel, ri) => (
          <Fragment key={rowLabel}>
            <span className="font-display text-3xl text-accent-2 self-center [writing-mode:vertical-rl] rotate-180">
              {rowLabel === "Quick" ? "⚡ Quick" : "🐢 Slow"}
            </span>
            {cells.slice(ri * 2, ri * 2 + 2).map((c) => (
              <div key={c.key} className={`rounded-3xl border-2 ${c.tone} px-5 py-3 flex flex-col gap-2 min-h-0 overflow-hidden pop-in`}>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-4xl font-bold whitespace-nowrap">
                    {c.emoji} {c.title}
                  </span>
                  <span className="text-2xl text-muted truncate">{c.sub}</span>
                  <span className="ml-auto font-display text-4xl text-accent-2">{boxes[c.key].length}</span>
                </div>
                <div className="flex flex-wrap gap-2 content-start">
                  {boxes[c.key].length === 0 && <span className="text-2xl text-muted">Nobody</span>}
                  {boxes[c.key].map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-2 rounded-full bg-black/30 pl-1 pr-5 py-1 pop-in">
                      <Avatar name={e.name} piece={e.piece} size={many ? 64 : 84} />
                      <span className={`font-display font-semibold ${many ? "text-2xl" : "text-3xl"}`}>{e.name}</span>
                      <span className={`tabular-nums text-muted ${many ? "text-xl" : "text-2xl"}`}>
                        {e.ms === null ? "no answer" : `${(e.ms / 1000).toFixed(1)}s`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
}

/** This round only: the answer, then everyone's pick (right answers fastest first). */
type HistoryEntry = BoardsDTO["history"][number];

/** The question just revealed, in the same shape as the history entries. */
function currentAsHistory(state: GameStateDTO): HistoryEntry {
  const round = state.round!;
  const reveal = state.reveal!;
  const pts = new Map((state.standings ?? []).map((s) => [s.playerId, s.lastRound ?? 0]));
  const guessed = new Map(reveal.guesses.map((g) => [g.playerId, g]));
  const rows = (state.players ?? [])
    .filter((p) => p.id !== round.subjectPlayerId)
    .map((p) => {
      const g = guessed.get(p.id);
      const idx = g ? round.options.findIndex((o) => o.id === g.optionId) : -1;
      return {
        playerId: p.id,
        name: p.name,
        piece: p.piece,
        letter: idx >= 0 ? LETTERS[idx] : null,
        label: idx >= 0 ? round.options[idx].label : null,
        correct: Boolean(g?.correct),
        elapsedMs: g ? g.elapsedMs : null,
        points: pts.get(p.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.correct) - Number(a.correct) ||
        Number(b.elapsedMs !== null) - Number(a.elapsedMs !== null) ||
        (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0),
    );
  return {
    number: round.number,
    roundId: round.id,
    questionText: round.questionText,
    subject: { playerId: round.subjectPlayerId ?? "", name: reveal.subjectName, piece: reveal.subjectPiece },
    answer: round.options.find((o) => o.id === reveal.correctOptionId)?.label ?? reveal.answerText,
    durationMs: round.durationMs,
    right: reveal.roundStats.correct,
    eligible: reveal.roundStats.eligible,
    rows,
  };
}

/**
 * "This round": everyone's pick for the question just revealed, with ‹ › to step back through
 * every earlier question (browsing holds the leaderboard rotation, like clicking a tab).
 */
function RoundBoard({ state, onBrowse }: { state: GameStateDTO; onBrowse: () => void }) {
  const latest = currentAsHistory(state);
  const past = (state.stats?.boards?.history ?? []).filter((h) => h.roundId !== latest.roundId);
  const all = [...past, latest];
  const [back, setBack] = useState(0); // 0 = the question just revealed
  const idx = Math.max(0, all.length - 1 - back);
  const h = all[idx];
  const move = (d: number) => {
    setBack((b) => Math.min(all.length - 1, Math.max(0, b + d)));
    onBrowse();
  };
  const twoCols = h.rows.length > 5;
  const half = twoCols ? Math.ceil(h.rows.length / 2) : h.rows.length;
  const cols = twoCols ? [h.rows.slice(0, half), h.rows.slice(half)] : [h.rows];
  return (
    <>
      <div className="flex items-center gap-4 max-w-[1600px] w-full mx-auto">
        <button
          type="button"
          className="btn btn-ghost !min-h-[72px] !px-5 !text-4xl disabled:opacity-30"
          disabled={idx === 0}
          onClick={(e) => {
            e.currentTarget.blur();
            move(1);
          }}
          aria-label="Earlier question"
        >
          ‹
        </button>
        <div key={h.roundId} className="panel-strong px-6 py-3 flex items-center gap-5 flex-1 min-w-0 tile-in">
          <Avatar name={h.subject.name} piece={h.subject.piece} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-2xl text-muted truncate">
              <span className="rounded-full bg-accent text-black font-display font-bold px-3 mr-2">Q{h.number}</span>
              {h.questionText}
            </p>
            <p className="font-display text-4xl font-bold truncate">
              <span className="gold-text">{h.answer}</span>
              <span className="text-2xl text-muted font-sans font-normal"> · {h.subject.name}&apos;s answer</span>
            </p>
          </div>
          <span className="font-display text-3xl text-accent-2 whitespace-nowrap">
            {h.right} of {h.eligible} right
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost !min-h-[72px] !px-5 !text-4xl disabled:opacity-30"
          disabled={back === 0}
          onClick={(e) => {
            e.currentTarget.blur();
            move(-1);
          }}
          aria-label="Later question"
        >
          ›
        </button>
      </div>
      {back > 0 && (
        <p className="text-center text-2xl text-accent-2 -mt-2">
          Looking back at question {h.number}.{" "}
          <button
            type="button"
            className="underline"
            onClick={(e) => {
              e.currentTarget.blur();
              setBack(0);
              onBrowse();
            }}
          >
            Back to the latest
          </button>
        </p>
      )}
      <div key={`rows-${h.roundId}`} className={`grid gap-6 ${twoCols ? "grid-cols-2" : "grid-cols-1 max-w-[1300px] w-full mx-auto"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className="flex flex-col gap-2.5">
            {col.map((r) => {
              const late = r.elapsedMs !== null && r.elapsedMs > h.durationMs;
              return (
                <li
                  key={r.playerId}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2 text-2xl pop-in ${r.correct ? "bg-good/20" : "bg-black/30"}`}
                >
                  <span className={`font-bold text-3xl w-[1.2ch] ${r.correct ? "text-good" : "text-bad"}`} aria-label={r.correct ? "correct" : "wrong"}>
                    {r.correct ? "✓" : "✗"}
                  </span>
                  <Avatar name={r.name} piece={r.piece} size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-3xl font-semibold">{r.name}</span>
                    <span className="block truncate text-xl text-muted">{r.letter ? `${r.letter}: ${r.label}` : "Didn't answer"}</span>
                  </span>
                  <span className={`tabular-nums whitespace-nowrap ${late ? "text-bad font-semibold" : "text-muted"}`}>
                    {r.elapsedMs !== null ? `${late ? "🚨 " : ""}${(r.elapsedMs / 1000).toFixed(1)}s` : "—"}
                  </span>
                  <span className={`font-display font-bold tabular-nums w-[5ch] text-right ${r.points > 0 ? "text-good" : "text-muted"}`}>
                    +{r.points.toLocaleString()}
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
  // Announcer: "Are we ready to crown our winner?" over the awards, then "And your champion is…"
  // with the podium appearing right as he finishes, then a game-over line.
  const announcer = useAnnouncer();
  const said = useRef(false);
  useEffect(() => {
    if (said.current || !announcer) return;
    said.current = true;
    if (awards.length) void announcer.crown();
    else void announcer.extra(Math.random() < 0.5 ? "game-over" : "game-over-2", true);
  }, [announcer, awards.length]);
  useEffect(() => {
    if (showPodium) return;
    let alive = true;
    const id = setTimeout(async () => {
      if (announcer) await announcer.champion();
      if (!alive) return;
      setAwardsDone(true);
      void announcer?.extra(Math.random() < 0.5 ? "game-over" : "game-over-2");
    }, Math.min(16000, 5000 + awards.length * 2000));
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [showPodium, awards.length, announcer]);

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
        {winners.length > 0 && winners.length <= 2 && (
          <div className="flex justify-center gap-10 mt-3">
            {winners.map((w) => {
              const slogan = state.players?.find((p) => p.id === w.playerId)?.winSlogan;
              return slogan ? (
                <p key={w.playerId} className="font-display text-5xl font-bold slogan-pop" style={{ animationDelay: "0.6s" }}>
                  <span className="text-accent-2">“</span>
                  {slogan}
                  <span className="text-accent-2">”</span>
                  {winners.length > 1 && <span className="text-3xl text-muted font-sans font-normal"> {w.name}</span>}
                </p>
              ) : null;
            })}
          </div>
        )}
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
