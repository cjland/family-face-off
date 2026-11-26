"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import type { GameStateDTO, Phase } from "@/lib/dto";

function intervalFor(phase: Phase | undefined, hidden: boolean): number {
  if (hidden) return 10000;
  switch (phase) {
    // The next question is about to start: check in a bit more often so every screen
    // catches the start of the 5-4-3-2-1.
    case "LEADERBOARD":
    case "PREPARING":
      return 1000;
    case "QUESTION":
    case "REVEAL":
      return 1500;
    case "FINISHED":
    case "CANCELLED":
      return 15000;
    // Lobby: often enough that the first question's "Get ready!" isn't missed when the game starts.
    default:
      return 2000;
  }
}

/**
 * Polls the game state. Never overlaps requests (the next poll is scheduled only after the
 * previous one settles), slows down in the background and refreshes immediately on focus.
 * Tracks the server clock offset so countdowns render smoothly from the server deadline.
 */
export function useGameState(url: string | null) {
  const [state, setState] = useState<GameStateDTO | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let stopped = false;
    let phase: Phase | undefined;

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, intervalFor(phase, document.visibilityState === "hidden"));
    };

    async function poll() {
      if (inFlight || stopped) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      const sent = Date.now();
      let halt = false;
      try {
        const data = await api<GameStateDTO>(url!);
        const received = Date.now();
        if (stopped) return;
        setOffsetMs(new Date(data.serverNow).getTime() - (sent + received) / 2);
        phase = data.phase;
        setState(data);
        setError(null);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err);
          halt = err.status === 401 || err.status === 403 || err.status === 404;
        }
      } finally {
        inFlight = false;
        if (!halt) schedule();
      }
    }

    pollRef.current = () => void poll();
    const first = setTimeout(poll, 0);
    const onFocus = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      stopped = true;
      clearTimeout(first);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [url]);

  /** Call after a mutation to refresh right away. */
  const refresh = useCallback(() => pollRef.current(), []);

  return { state, error, offsetMs, refresh };
}

/** Ticking "now" aligned to the server clock. */
export function useServerNow(offsetMs: number, active: boolean, stepMs = 200): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now() + offsetMs);
    const first = setTimeout(update, 0);
    if (!active) return () => clearTimeout(first);
    const id = setInterval(update, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [offsetMs, active, stepMs]);
  return now;
}
