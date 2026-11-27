"use client";

import { animate, stagger } from "animejs";
import {
  Children,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * TV text and entrance animations, built on anime.js (MIT). Everything respects the game's
 * "TV animations" setting: html.no-motion turns them off, html.force-motion keeps them on even
 * when the computer asks for reduced motion.
 */
export function motionOk(): boolean {
  if (typeof document === "undefined") return false;
  const c = document.documentElement.classList;
  if (c.contains("no-motion")) return false;
  if (c.contains("force-motion")) return true;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// useLayoutEffect on the client (so hidden-then-animated text never flashes), useEffect on the server.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Effect = "rise" | "drop" | "pop" | "wave";

const EFFECTS: Record<Effect, Record<string, unknown>> = {
  rise: {
    opacity: [0, 1],
    translateY: ["0.55em", "0em"],
    rotate: [-6, 0],
    filter: ["blur(8px)", "blur(0px)"],
    ease: "outBack(1.4)",
  },
  drop: { opacity: [0, 1], translateY: ["-0.9em", "0em"], ease: "outBounce" },
  pop: { opacity: [0, 1], scale: [0.2, 1], ease: "outElastic(1, .55)" },
  wave: {
    opacity: [0, 1],
    translateY: ["0.8em", "0em"],
    scale: [0.6, 1],
    ease: "outBack(2)",
  },
};

/**
 * Text that animates in letter by letter (or word by word). Words never break in the middle, so
 * it wraps like normal text. Re-animates when the text changes.
 */
export function SplitText({
  text,
  by = "chars",
  effect = "rise",
  delay = 0,
  step,
  duration = 700,
  className = "",
  play = true,
}: {
  text: string;
  /** Hold the text hidden until this turns true, then animate (e.g. when the countdown ends). */
  play?: boolean;
  by?: "chars" | "words";
  effect?: Effect;
  delay?: number;
  /** Milliseconds between letters/words (defaults suit each mode). */
  step?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    const parts = Array.from(el.querySelectorAll<HTMLElement>("[data-part]"));
    if (!parts.length) return;
    if (!play) {
      parts.forEach((p) => (p.style.opacity = "0"));
      return;
    }
    const a = animate(parts, {
      ...EFFECTS[effect],
      duration,
      delay: stagger(step ?? (by === "chars" ? 28 : 75), { start: delay }),
    });
    return () => {
      a.pause();
    };
  }, [text, by, effect, delay, step, duration, play]);
  const words = text.split(/(\s+)/);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((w, i) =>
        /^\s+$/.test(w) ? (
          <Fragment key={i}>{w}</Fragment>
        ) : by === "words" ? (
          <span
            key={i}
            data-part=""
            aria-hidden="true"
            className="inline-block whitespace-nowrap"
          >
            {w}
          </span>
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className="inline-block whitespace-nowrap"
          >
            {[...w].map((ch, j) => (
              <span key={j} data-part="" className="inline-block">
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </span>
  );
}

/** Children spring in one after another (answer tiles, leaderboard rows…). */
export function StaggerIn({
  children,
  className = "",
  delay = 0,
  step = 90,
  from = "below",
  play = true,
}: {
  children: React.ReactNode;
  play?: boolean;
  className?: string;
  delay?: number;
  step?: number;
  from?: "below" | "sides" | "scale";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (!kids.length) return;
    if (!play) {
      kids.forEach((k) => (k.style.opacity = "0"));
      return;
    }
    const base = { duration: 650, ease: "outBack(1.3)" as const };
    const anims =
      from === "sides"
        ? // Odd children come from the right, even from the left, still one after another.
          kids.map((k, i) =>
            animate(k, {
              ...base,
              opacity: [0, 1],
              translateX: [i % 2 ? "60px" : "-60px", "0px"],
              delay: delay + i * step,
            }),
          )
        : [
            animate(kids, {
              ...base,
              ...(from === "scale"
                ? { scale: [0.6, 1] }
                : { translateY: ["40px", "0px"] }),
              opacity: [0, 1],
              delay: stagger(step, { start: delay }),
            }),
          ];
    return () => {
      anims.forEach((a) => a.pause());
    };
  }, [count, delay, step, from, play]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#?!";

/** Letters shuffle like a flip board, then settle left to right into the real text. */
export function ScrambleText({
  text,
  duration = 1100,
  delay = 0,
  className = "",
}: {
  text: string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  // Null = show the real text (no animation running).
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!motionOk()) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const settled = Math.floor(t * text.length);
      setShown(
        t >= 1
          ? null
          : [...text]
              .map((ch, i) =>
                i < settled || /\s/.test(ch)
                  ? ch
                  : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
              )
              .join(""),
      );
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, delay]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{shown ?? text}</span>
    </span>
  );
}

/** A number that counts up to its new value (scores). */
export function CountUp({
  value,
  duration = 1200,
  delay = 0,
  className = "",
}: {
  value: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  // Null = show the real value (no animation running).
  const [n, setN] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (!motionOk()) {
      from.current = value;
      return;
    }
    const o = { v: from.current };
    const a = animate(o, {
      v: value,
      duration,
      delay,
      ease: "outExpo",
      onUpdate: () => setN(Math.round(o.v)),
      onComplete: () => {
        from.current = value;
        setN(null);
      },
    });
    return () => {
      a.pause();
      from.current = value;
    };
  }, [value, duration, delay]);
  return <span className={className}>{(n ?? value).toLocaleString()}</span>;
}
