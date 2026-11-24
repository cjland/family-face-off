"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { OptionDTO, StandingDTO } from "@/lib/dto";
import type { Theme } from "@/lib/settings";

// ---------- Stage / theme ----------

const LEAVES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 73) % 100,
  delay: (i * 1.7) % 12,
  duration: 11 + ((i * 5) % 9),
  size: 18 + ((i * 7) % 22),
  hue: ["#e0701f", "#c2412c", "#e8a33a", "#9c3b1b"][i % 4],
}));

function Leaf({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 2c1 2.5 3.5 3 5.5 2.5-.4 2 .4 3.6 2.5 4.5-1.6 1-2 2.5-1 4.5-2 0-3.4.8-4 2.6L12 22l-3-5.9c-.6-1.8-2-2.6-4-2.6 1-2 .6-3.5-1-4.5 2.1-.9 2.9-2.5 2.5-4.5C8.5 5 11 4.5 12 2z"
      />
    </svg>
  );
}

export function Stage({
  theme,
  children,
  className = "",
}: {
  theme: Theme;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-theme={theme} className={`stage stage-beams ${className}`}>
      {theme === "thanksgiving" && (
        <div className="leaves" aria-hidden="true">
          {LEAVES.map((l, i) => (
            <span
              key={i}
              className="leaf"
              style={{ left: `${l.left}%`, animationDelay: `${l.delay}s`, animationDuration: `${l.duration}s` }}
            >
              <Leaf color={l.hue} size={l.size} />
            </span>
          ))}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function TitleMark({ title, theme, size = "md" }: { title: string; theme: Theme; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl", xl: "text-7xl" }[size];
  return (
    <div className="flex flex-col items-center">
      {theme === "thanksgiving" && (
        <span className="font-display text-accent-2 tracking-[0.3em] uppercase text-sm mb-1">Thanksgiving Edition</span>
      )}
      <h1 className={`font-display font-bold gold-text leading-none text-center ${cls}`}>{title}</h1>
    </div>
  );
}

// ---------- Countdown ring ----------

export function CountdownRing({
  remainingMs,
  durationMs,
  paused,
  size = 120,
}: {
  remainingMs: number;
  durationMs: number;
  paused: boolean;
  size?: number;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;
  const secs = Math.ceil(remainingMs / 1000);
  const urgent = !paused && secs <= 5;
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={paused ? "Paused" : `${secs} seconds left`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="rgba(0,0,0,0.3)" className="ring-track" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className="ring-bar"
          data-urgent={urgent}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="font-display font-bold relative" style={{ fontSize: size * 0.36 }}>
        {paused ? "❚❚" : secs}
      </span>
    </div>
  );
}

// ---------- Answer tiles ----------

export const LETTERS = ["A", "B", "C", "D"] as const;
const SHAPES = ["▲", "◆", "●", "■"];
const TILE_BG = ["bg-tile-a", "bg-tile-b", "bg-tile-c", "bg-tile-d"];

export type TileState = "idle" | "selected" | "correct" | "dim";

export function AnswerTile({
  index,
  option,
  state = "idle",
  onClick,
  disabled,
  size = "md",
  footer,
  count,
}: {
  index: number;
  option: OptionDTO;
  state?: TileState;
  onClick?: () => void;
  disabled?: boolean;
  size?: "md" | "lg" | "xl" | "tv";
  footer?: React.ReactNode;
  count?: number;
}) {
  const pad = { md: "p-3 text-xl min-h-[76px]", lg: "p-4 text-2xl min-h-[96px]", xl: "p-5 text-[2.3rem] min-h-[150px]", tv: "p-6 text-[2.6rem] min-h-[150px]" }[size];
  const badge = { md: "w-12 h-12 text-2xl", lg: "w-14 h-14 text-3xl", xl: "w-20 h-20 text-4xl", tv: "w-24 h-24 text-5xl" }[size];
  const label =
    `${LETTERS[index]}: ${option.label}` +
    (state === "correct" ? " (correct answer)" : "") +
    (state === "selected" ? " (your choice)" : "") +
    (count !== undefined ? `, ${count} ${count === 1 ? "guess" : "guesses"}` : "");
  const content = (
    <>
      <span className={`tile-badge ${badge}`} aria-hidden="true">
        <span className="flex flex-col items-center">
          <span>{LETTERS[index]}</span>
          <span className="text-[0.45em] opacity-80 mt-0.5">{SHAPES[index]}</span>
        </span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block break-words leading-tight">{option.label}</span>
        {footer}
      </span>
      {state === "correct" && (
        <span className="flex-none text-[1.2em]" aria-hidden="true">
          ✓
        </span>
      )}
      {count !== undefined && (
        <span className="flex-none font-display font-bold rounded-full bg-black/30 px-3 py-1 text-[0.8em]" aria-hidden="true">
          {count}
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`tile ${TILE_BG[index]} ${pad}`}
        data-state={state}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={state === "selected"}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`tile ${TILE_BG[index]} ${pad}`} data-state={state} aria-label={label} role="group">
      {content}
    </div>
  );
}

// ---------- Avatars ----------

const AVATAR_COLORS = ["#e2556d", "#4a7bf0", "#e0a020", "#2fae6b", "#9b5de5", "#f15bb5", "#00a6a6", "#f28c28"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full font-display font-bold text-white flex-none shadow-md"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4, border: "3px solid rgba(255,255,255,0.85)" }}
    >
      {initials || "?"}
    </span>
  );
}

// ---------- Leaderboard ----------

export function Leaderboard({
  standings,
  highlightId,
  pageSize = 8,
  autoPageMs = 0,
  size = "md",
  showAccuracy = false,
}: {
  standings: StandingDTO[];
  highlightId?: string;
  pageSize?: number;
  autoPageMs?: number;
  size?: "md" | "tv";
  showAccuracy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(standings.length / pageSize));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!autoPageMs || pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), autoPageMs);
    return () => clearInterval(id);
  }, [autoPageMs, pages]);
  const current = Math.min(page, pages - 1);
  const rows = standings.slice(current * pageSize, current * pageSize + pageSize);
  const text = size === "tv" ? "text-3xl" : "text-lg";
  const av = size === "tv" ? 52 : 36;
  return (
    <div>
      <ol className="flex flex-col gap-2" aria-label="Standings">
        {rows.map((s) => (
          <li
            key={s.playerId}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${text} ${
              s.playerId === highlightId ? "bg-accent/25 ring-2 ring-accent" : "bg-black/25"
            }`}
          >
            <span className="font-display font-bold w-[2.2em] text-center text-accent-2" aria-label={`Rank ${s.rank}`}>
              {s.rank}
            </span>
            <Avatar name={s.name} size={av} />
            <span className="flex-1 min-w-0 truncate font-semibold">{s.name}</span>
            {showAccuracy && (
              <span className="text-muted text-[0.75em] whitespace-nowrap" title="Correct answers / questions answered">
                {s.correct}/{s.eligible}
              </span>
            )}
            <span className="font-display font-bold tabular-nums">{s.points.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3 text-muted">
          {!autoPageMs && (
            <button type="button" className="btn btn-ghost !min-h-[44px] !px-3 !text-base" onClick={() => setPage((p) => (p - 1 + pages) % pages)} aria-label="Previous page">
              ‹
            </button>
          )}
          <span className={size === "tv" ? "text-2xl" : "text-sm"}>
            Page {current + 1} of {pages}
          </span>
          {!autoPageMs && (
            <button type="button" className="btn btn-ghost !min-h-[44px] !px-3 !text-base" onClick={() => setPage((p) => (p + 1) % pages)} aria-label="Next page">
              ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Podium ----------

export function Podium({ standings, size = "md" }: { standings: StandingDTO[]; size?: "md" | "tv" }) {
  const top = standings.filter((s) => s.rank <= 3).slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as StandingDTO[];
  const heights: Record<number, string> = size === "tv" ? { 1: "h-64", 2: "h-48", 3: "h-36" } : { 1: "h-32", 2: "h-24", 3: "h-16" };
  const colors: Record<number, string> = { 1: "var(--accent)", 2: "#b9c2d6", 3: "#cd8a4b" };
  return (
    <div className="flex items-end justify-center gap-4" aria-label="Podium">
      {order.map((s, i) => (
        <div key={s.playerId} className="flex flex-col items-center rise" style={{ animationDelay: `${(2 - i) * 250 + 200}ms` }}>
          <Avatar name={s.name} size={size === "tv" ? 112 : 64} />
          <div className={`font-display font-bold mt-2 text-center max-w-[12ch] truncate ${size === "tv" ? "text-4xl" : "text-xl"}`}>
            {s.name}
          </div>
          <div className={`text-muted tabular-nums ${size === "tv" ? "text-2xl" : "text-base"}`}>{s.points.toLocaleString()} pts</div>
          <div
            className={`mt-2 ${heights[s.rank] ?? heights[3]} ${size === "tv" ? "w-56" : "w-24"} rounded-t-2xl grid place-items-start justify-center pt-3 shadow-xl`}
            style={{ background: `linear-gradient(180deg, ${colors[s.rank] ?? colors[3]}, rgba(0,0,0,0.35))` }}
          >
            <span className={`font-display font-bold text-black/80 ${size === "tv" ? "text-6xl" : "text-3xl"}`}>
              {s.rank}
              <sup className="text-[0.45em]">{s.rank === 1 ? "st" : s.rank === 2 ? "nd" : "rd"}</sup>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- QR ----------

export function QrCode({ url, size = 240, label }: { url: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url, size]);
  return (
    <div className="rounded-2xl bg-white p-3 shadow-2xl" style={{ width: size + 24, height: size + 24 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} alt={label} />
      ) : (
        <div style={{ width: size, height: size }} className="grid place-items-center text-black/60 text-sm" role="img" aria-label={label}>
          Loading QR…
        </div>
      )}
    </div>
  );
}

// ---------- Misc ----------

export function Banner({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  const color = kind === "error" ? "border-bad bg-bad/15" : kind === "success" ? "border-good bg-good/15" : "border-line bg-panel";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${color}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16" role="status">
      <div className="w-12 h-12 rounded-full border-4 border-accent/30 border-t-accent animate-spin" aria-hidden="true" />
      <span className="text-muted">{label}…</span>
    </div>
  );
}
