"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, Banner, Spinner, Stage } from "@/components/ui";
import { useGameState } from "@/hooks/useGameState";
import { api } from "@/lib/client/api";

/** iPhone 13 screen in CSS pixels (390 × 844, 19.5:9). */
const PHONE = { w: 390, h: 844 };
const TV = { w: 1920, h: 1080 };

/** A live, read-only copy of one screen, scaled to fit its box. */
function Screen({
  src,
  w,
  h,
  scale,
  title,
}: {
  src: string;
  w: number;
  h: number;
  scale: number;
  title: string;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{ width: w * scale, height: h * scale }}
    >
      <iframe
        title={title}
        src={src}
        className="absolute left-0 top-0 border-0 origin-top-left bg-black"
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/**
 * Host simulation view: every player's phone (iPhone 13 size) on one screen, plus the TV, all live.
 * Phones are read-only copies of what each player sees. Keeping this page open also drives the
 * demo bots, like the host screen does.
 */
export default function SimulatePage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { state, error } = useGameState(`/api/games/${code}/state?view=host`);
  const [scale, setScale] = useState(0.5);
  const [showTv, setShowTv] = useState(true);
  const [onlyBots, setOnlyBots] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Fit about four phones per row by default on a laptop screen.
  useEffect(() => {
    const fit = () => {
      const w = gridRef.current?.clientWidth ?? window.innerWidth;
      setScale((s) =>
        s === 0.5
          ? Math.max(0.3, Math.min(0.6, (w - 3 * 24) / 4 / PHONE.w))
          : s,
      );
    };
    fit();
  }, []);

  if (error?.status === 401 || error?.status === 403) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-xl px-5 py-16 flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">Simulation</h1>
          <p>Sign in as the host to watch everyone’s screens.</p>
          <Link className="btn btn-primary self-start" href="/host">
            Go to host sign in
          </Link>
        </main>
      </Stage>
    );
  }
  if (!state) {
    return (
      <Stage theme="classic">
        <Spinner label="Loading the game" />
      </Stage>
    );
  }

  const roster = (state.host?.roster ?? []).filter(
    (p) => p.active && (!onlyBots || p.isBot),
  );
  const bots = (state.host?.roster ?? []).filter(
    (p) => p.isBot && p.active,
  ).length;

  return (
    <Stage theme={state.theme}>
      <main className="mx-auto max-w-[1900px] px-5 py-6 flex flex-col gap-5">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold">
              📱 Simulation · {code}
            </h1>
            <p className="text-muted text-sm">
              Live, read-only copies of every phone (iPhone 13 size) and the TV.
              Run the game from the host screen; keeping this page open also
              moves the demo bots.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.host?.demoTools && state.phase === "LOBBY" && (
              <button
                className="btn btn-ghost !text-base"
                disabled={bots >= 12}
                onClick={async () => {
                  try {
                    await api(`/api/games/${code}/demo-players`, {
                      method: "POST",
                      body: { count: 4 },
                    });
                  } catch (e) {
                    setMsg(
                      e instanceof Error
                        ? e.message
                        : "Couldn't add demo players.",
                    );
                  }
                }}
              >
                + Add 4 demo players ({bots}/12)
              </button>
            )}
            <Link
              className="btn btn-primary !text-base"
              href={`/host/${code}`}
              target="_blank"
            >
              Host controls ↗
            </Link>
          </div>
        </header>
        {msg && <Banner kind="error">{msg}</Banner>}
        {!state.host?.demoTools && bots === 0 && (
          <Banner kind="error">
            Demo players are turned off on this server (ENABLE_DEMO_TOOLS). You
            can still watch real players’ phones here.
          </Banner>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span>Phone size</span>
            <input
              type="range"
              min={0.25}
              max={1}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="accent-[var(--accent)]"
            />
            <span className="tabular-nums w-10">
              {Math.round(scale * 100)}%
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={showTv}
              onChange={(e) => setShowTv(e.target.checked)}
            />
            Show the TV
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={onlyBots}
              onChange={(e) => setOnlyBots(e.target.checked)}
            />
            Only demo bots
          </label>
          <span className="text-muted">
            {state.phase} · {roster.length} screen
            {roster.length === 1 ? "" : "s"}
          </span>
        </div>

        <div
          ref={gridRef}
          className="flex flex-wrap items-start gap-6"
          aria-label="Phones"
        >
          {showTv && (
            <figure className="flex flex-col items-center gap-2">
              <div className="rounded-xl border-4 border-black/70 shadow-2xl">
                <Screen
                  title="TV display"
                  src={`/display/${code}?key=${state.host?.displayKey ?? ""}`}
                  w={TV.w}
                  h={TV.h}
                  scale={(PHONE.h * scale) / TV.h}
                />
              </div>
              <figcaption className="text-sm font-semibold">📺 TV</figcaption>
            </figure>
          )}
          {roster.length === 0 && (
            <p className="text-muted">
              No players yet. Add demo players or have people join.
            </p>
          )}
          {roster.map((p) => (
            <figure key={p.id} className="flex flex-col items-center gap-2">
              <div
                className="rounded-[2.2rem] bg-black p-[6px] shadow-2xl ring-1 ring-white/20"
                style={{ borderRadius: 48 * scale + 6 }}
              >
                <div
                  className="overflow-hidden"
                  style={{ borderRadius: 42 * scale }}
                >
                  <Screen
                    title={`${p.name}'s phone`}
                    src={`/play/${code}?as=${p.id}`}
                    w={PHONE.w}
                    h={PHONE.h}
                    scale={scale}
                  />
                </div>
              </div>
              <figcaption className="flex items-center gap-2 text-sm">
                <Avatar name={p.name} piece={p.piece} size={28} />
                <span className="font-semibold">{p.name}</span>
                {p.isBot && <span className="text-muted">bot</span>}
                {!p.ready && <span className="text-bad">not ready</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
    </Stage>
  );
}
