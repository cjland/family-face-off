"use client";

import { useEffect, useState } from "react";
import { Avatar, QrCode, TitleMark } from "@/components/ui";
import type { GameStateDTO } from "@/lib/dto";

type Visual =
  | { tv: string }
  | { phone: string }
  | { phones: [string, string] }
  | { art: "scan" | "speed" | "ready" };

type Slide = { title: string; body: string; visual: Visual };

/** The walkthrough shown on the TV lobby. Images live in public/howto (real screens, fictional players). */
const SLIDES: Slide[] = [
  {
    title: "Welcome to Family Face-Off!",
    body: "A game show about the people in this room. Here's how it works in about a minute.",
    visual: { tv: "hero" },
  },
  {
    title: "Grab your phone",
    body: "Open your camera and point it at the QR code on the left, then tap the link that pops up. Nothing to download!",
    visual: { art: "scan" },
  },
  {
    title: "Type your name",
    body: "Use the name everyone knows you by, like “Grandma June” or “Uncle Ray”.",
    visual: { phone: "phone-join" },
  },
  {
    title: "Pick your game piece",
    body: "Choose one of 40 characters, or tap “📷 Use my own photo” to put your face on a costume.",
    visual: { phone: "phone-join" },
  },
  {
    title: "Answer 8 questions about yourself",
    body: "Tap one of the six answers, or “Something else…” to type your own. Rather not answer one? Swap it for another.",
    visual: { phone: "phone-questionnaire" },
  },
  {
    title: "Check your answers, then tap “I'm ready!”",
    body: "Your answers stay secret. They only come up during the game.",
    visual: { phone: "phone-review" },
  },
  {
    title: "Wait for everyone",
    body: "Your piece shows up here with a ✓ when you're ready. The host starts the game once everyone's in.",
    visual: { tv: "tv-lobby" },
  },
  {
    title: "Get ready…",
    body: "Every question starts with a big 5, 4, 3, 2, 1 countdown. Eyes on the TV!",
    visual: { tv: "tv-countdown" },
  },
  {
    title: "Read the question on the TV",
    body: "Each question is about someone here: “How did Grandma June answer…?” Guess what THEY picked.",
    visual: { tv: "tv-question" },
  },
  {
    title: "Pick A, B, C or D, then Lock in",
    body: "Tap your answer on your phone, then Lock in. You only get one try, so be sure!",
    visual: { phones: ["phone-question", "phone-locked"] },
  },
  {
    title: "Be quick!",
    body: "The TV shows who locked in 1st, 2nd, 3rd… Dawdle and you'll get teased. Question about you? Sit back and enjoy.",
    visual: { art: "speed" },
  },
  {
    title: "The big reveal",
    body: "See the right answer and what everyone guessed. Each right answer is worth 1,000 points.",
    visual: { tv: "tv-reveal" },
  },
  {
    title: "Check the leaderboards",
    body: "Between questions, see who's winning, plus fun stats like the horse race and the answer graveyard.",
    visual: { tv: "board-overall" },
  },
  {
    title: "Crown the winner",
    body: "The game ends with awards, a podium and confetti. Everyone gets bragging rights for something!",
    visual: { tv: "tv-final" },
  },
  {
    title: "Ready? Scan the code to join!",
    body: "Closed your browser by accident? Just scan the code again on the same phone and you'll jump right back in.",
    visual: { art: "ready" },
  },
];

export const HOWTO_STEP_MS = 9000;

function PhoneShot({ name, tilt = 0 }: { name: string; tilt?: number }) {
  return (
    <div
      className="rounded-[44px] border-[12px] border-[#12101c] bg-[#12101c] shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/howto/${name}.webp`} alt="" className="block h-[500px] w-auto" draggable={false} />
    </div>
  );
}

function TvShot({ name }: { name: string }) {
  return (
    <div className="rounded-[22px] border-[10px] border-[#12101c] bg-[#12101c] shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/howto/${name}.webp`} alt="" className="block h-[500px] w-auto max-w-full" draggable={false} />
    </div>
  );
}

function Art({ kind }: { kind: "scan" | "speed" | "ready" }) {
  if (kind === "speed") {
    return (
      <div className="flex flex-col items-center gap-10">
        <div className="flex gap-8">
          {[
            ["1st", "bg-[#ffd54a]"],
            ["2nd", "bg-[#d9dee8]"],
            ["3rd", "bg-[#e0a066]"],
          ].map(([t, bg], i) => (
            <span
              key={t}
              className={`tile-in grid place-items-center rounded-full w-40 h-40 font-display text-6xl font-bold text-black shadow-2xl ${bg}`}
              style={{ animationDelay: `${200 + i * 250}ms` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="shame-alert rounded-2xl border-4 border-white px-8 py-3 font-display text-5xl font-bold text-white tile-in" style={{ animationDelay: "1s" }}>
          🚨 SHAME ALERT
        </div>
        <p className="text-3xl text-muted tile-in" style={{ animationDelay: "1.3s" }}>
          (Late answers still count, but everyone will know.)
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-12">
      {/* Drawn arrow (emoji hands point different ways on different TVs). */}
      <span className="font-display text-[13rem] font-bold leading-none text-accent-2 howto-point drop-shadow-[0_6px_20px_rgba(0,0,0,0.5)]" aria-hidden="true">
        ←
      </span>
      <div className="flex flex-col items-center gap-4">
        <span className="text-[14rem] leading-none leader-float" aria-hidden="true">
          📱
        </span>
        <span className="font-display text-5xl font-bold text-accent-2">{kind === "ready" ? "Scan me!" : "Camera → QR code"}</span>
      </div>
    </div>
  );
}

/**
 * Full-screen, looping "How to play" walkthrough for the TV lobby. The join QR code, game code and
 * who has joined stay on screen the whole time, so people can keep joining while it plays.
 */
export function HowToPlay({
  state,
  joinUrl,
  prettyJoin,
  startButton,
  onClose,
}: {
  state: GameStateDTO;
  joinUrl: string;
  prettyJoin: string;
  startButton: React.ReactNode;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [cycle, setCycle] = useState(0); // restarts the step timer after a manual move
  const n = SLIDES.length;
  const go = (d: number) => {
    setI((v) => (v + d + n) % n);
    setCycle((c) => c + 1);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      setI((v) => (v + 1) % n);
      setCycle((c) => c + 1);
    }, HOWTO_STEP_MS);
    return () => clearTimeout(t);
  }, [cycle, n]);
  // Arrow keys move through the steps (instead of starting the game); Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setI((v) => (v + (e.key === "ArrowRight" ? 1 : -1) + n) % n);
        setCycle((c) => c + 1);
      } else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [n, onClose]);

  const slide = SLIDES[i];
  const v = slide.visual;
  const players = state.lobby ?? [];
  return (
    <div className="absolute inset-0 z-30 stage-solid grid grid-cols-[560px_1fr] gap-10 px-14 pt-20 pb-12" role="dialog" aria-label="How to play">
      {/* Always on screen: how to join, and who has. */}
      <div className="flex flex-col items-center gap-4 text-center min-h-0">
        <TitleMark title={state.title} family={state.familyName} theme={state.theme} size="sm" />
        <h2 className="font-display text-5xl font-bold">Scan to join</h2>
        <QrCode url={joinUrl} size={300} label={`QR code to join the game at ${prettyJoin}`} />
        <div className="text-2xl">
          or go to <span className="font-semibold text-accent-2">{prettyJoin.replace(/\/join\/.*/, "")}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl text-muted">Code</span>
          <span className="font-display text-7xl font-bold tracking-[0.15em] gold-text">{state.code}</span>
        </div>
        <div className="panel w-full px-4 py-3 flex flex-col gap-2 min-h-0">
          <div className="font-display text-2xl">
            {state.counts.players} joined · <span className="text-good">{state.counts.ready} ready</span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 overflow-hidden max-h-[132px]">
            {players.map((p) => (
              <span key={p.id} className={`pop-in ${p.ready ? "" : "opacity-50"}`} title={p.name}>
                <Avatar name={p.name} piece={p.piece} size={60} />
              </span>
            ))}
            {players.length === 0 && <span className="text-xl text-muted py-3">Be the first!</span>}
          </div>
        </div>
        <div className="mt-auto">{startButton}</div>
      </div>

      {/* The walkthrough */}
      <div className="panel-strong flex flex-col min-h-0 overflow-hidden px-10 pt-6 pb-5">
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-accent text-black font-display font-bold text-2xl px-4 py-1">📖 How to play</span>
          <span className="font-display text-2xl text-muted tabular-nums">
            Step {i + 1} of {n}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost !min-h-[56px] !px-5 !text-3xl" onClick={(e) => (e.currentTarget.blur(), go(-1))} aria-label="Previous step">
              ‹
            </button>
            <button type="button" className="btn btn-ghost !min-h-[56px] !px-5 !text-3xl" onClick={(e) => (e.currentTarget.blur(), go(1))} aria-label="Next step">
              ›
            </button>
            <button type="button" className="btn btn-ghost !min-h-[56px] !px-5 !text-2xl" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-4">
          <div key={cycle} className="tab-timer h-full bg-accent" style={{ "--tab-ms": `${HOWTO_STEP_MS}ms` } as React.CSSProperties} />
        </div>
        <div key={i} className="flex-1 min-h-0 flex flex-col">
          <h3 className="font-display text-6xl font-bold mt-6 tile-in">
            {i > 0 && i < n - 1 && <span className="text-accent-2">{i}. </span>}
            {slide.title}
          </h3>
          <p className="text-3xl leading-snug mt-3 max-w-[1150px] tile-in" style={{ animationDelay: "120ms" }}>
            {slide.body}
          </p>
          <div className="flex-1 min-h-0 grid place-items-center mt-4 tile-in" style={{ animationDelay: "250ms" }}>
            {"tv" in v ? (
              <TvShot name={v.tv} />
            ) : "phone" in v ? (
              <PhoneShot name={v.phone} />
            ) : "phones" in v ? (
              <div className="flex gap-12 items-center">
                <PhoneShot name={v.phones[0]} tilt={-3} />
                <span className="text-7xl" aria-hidden="true">
                  ➜
                </span>
                <PhoneShot name={v.phones[1]} tilt={3} />
              </div>
            ) : (
              <Art kind={v.art} />
            )}
          </div>
        </div>
        <div className="flex justify-center gap-2 pt-3" aria-hidden="true">
          {SLIDES.map((_, k) => (
            <span key={k} className={`h-3 rounded-full transition-all ${k === i ? "w-10 bg-accent" : "w-3 bg-white/25"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
