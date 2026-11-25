"use client";

import { useEffect, useRef } from "react";
import { useServerNow } from "@/hooks/useGameState";
import type { RoundDTO } from "@/lib/dto";

/**
 * Full-screen "5, 4, 3, 2, 1" before a question opens. Driven by the server's open time, so the
 * TV and every phone count down together. Renders nothing once answers are open.
 */
export function PreQuestionCountdown({
  round,
  offsetMs,
  variant,
  onTick,
}: {
  round: RoundDTO;
  offsetMs: number;
  variant: "tv" | "phone";
  onTick?: (n: number) => void;
}) {
  const opensAt = round.opensAt ? new Date(round.opensAt).getTime() : 0;
  const now = useServerNow(offsetMs, !round.paused && opensAt > 0, 100);
  const left = !round.paused && now > 0 ? opensAt - now : 0;
  const n = Math.ceil(left / 1000);
  const last = useRef(-1);
  useEffect(() => {
    if (n > 0 && n !== last.current) {
      last.current = n;
      onTick?.(n);
    }
  }, [n, onTick]);
  if (n <= 0) return null;
  const tv = variant === "tv";
  return (
    <div
      className={`${tv ? "absolute" : "fixed"} inset-0 z-40 grid place-items-center bg-[radial-gradient(circle_at_center,#2a1660,#0b0620)]`}
      role="status"
      aria-live="assertive"
      aria-label={`Question ${round.number} starts in ${n}`}
    >
      <div className="flex flex-col items-center text-center px-6">
        <p className={`font-display text-accent-2 ${tv ? "text-6xl" : "text-2xl"}`}>
          Question {round.number} of {round.total}
        </p>
        <span
          key={n}
          className={`countdown-pop font-display font-bold gold-text leading-none tabular-nums ${tv ? "text-[22rem]" : "text-[11rem]"}`}
        >
          {n}
        </span>
        <p className={`font-display font-bold ${tv ? "text-7xl" : "text-3xl"}`}>Get ready!</p>
      </div>
    </div>
  );
}
