"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui";
import type { BoardsDTO } from "@/lib/dto";

/** Flips to true just after mount so bars and pieces can animate from their starting point. */
function useGo(delay = 120) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return go;
}

const pctColor = (pct: number) => (pct < 34 ? "bg-bad" : pct < 67 ? "bg-accent" : "bg-good");
const pctText = (pct: number) => (pct < 34 ? "text-bad" : pct < 67 ? "text-accent-2" : "text-good");

function Bar({ pct, go, delay = 0, h = "h-5" }: { pct: number; go: boolean; delay?: number; h?: string }) {
  return (
    <div className={`w-full ${h} rounded-full bg-white/10 overflow-hidden`}>
      <div
        className={`h-full rounded-full ${pctColor(pct)}`}
        style={{ width: go ? `${Math.max(pct, 1.5)}%` : 0, transition: `width 1200ms cubic-bezier(.2,.8,.3,1) ${delay}ms` }}
      />
    </div>
  );
}

// ---------- The questions that stumped everyone ----------

const BADGES = {
  impossible: { emoji: "🧱", title: "The Impossible Question", line: "Nobody got it right" },
  everybody: { emoji: "🤗", title: "Everybody Knows You", line: "Everyone got it right" },
  surprise: { emoji: "🎁", title: "The Family Surprise", line: "The right answer was the least popular pick" },
} as const;

export function StumpersBoard({ boards }: { boards: BoardsDTO }) {
  const go = useGo();
  const rows = boards.stumpers.slice(0, 6);
  const achievements = (Object.keys(BADGES) as (keyof typeof BADGES)[])
    .map((k) => ({ k, q: boards.stumpers.find((s) => s.badge === k) }))
    .filter((a) => a.q);
  return (
    <div className="flex flex-col gap-4 max-w-[1500px] w-full mx-auto flex-1 min-h-0">
      <ol className="panel px-6 py-4 flex flex-col gap-3">
        {rows.map((q, i) => (
          <li key={q.number} className="tile-in" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="flex items-center gap-3">
              <Avatar name={q.name} piece={q.piece} size={52} />
              <span className="font-display text-3xl font-semibold truncate flex-1 min-w-0">
                {q.name}: <span className="text-muted font-sans font-normal">{q.prompt}</span>
              </span>
              <span className="text-xl text-muted whitespace-nowrap">Q{q.number}</span>
              <span className={`font-display text-3xl font-bold tabular-nums whitespace-nowrap w-[6.5ch] text-right ${pctText(q.pctCorrect)}`}>
                {q.pctCorrect}%
              </span>
            </div>
            <div className="pl-[64px] mt-1">
              <Bar pct={q.pctCorrect} go={go} delay={200 + i * 90} h="h-4" />
            </div>
          </li>
        ))}
      </ol>
      {achievements.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${achievements.length}, minmax(0, 1fr))` }}>
          {achievements.map(({ k, q }, i) => (
            <div key={k} className="panel-strong px-5 py-3 flex items-center gap-4 tile-in" style={{ animationDelay: `${800 + i * 150}ms` }}>
              <span className="text-6xl leader-float" style={{ animationDelay: `${-i * 0.7}s` }} aria-hidden="true">
                {BADGES[k].emoji}
              </span>
              <div className="min-w-0">
                <div className="font-display text-3xl font-bold text-accent-2 truncate">{BADGES[k].title}</div>
                <div className="text-xl truncate">
                  {q!.name}: {q!.prompt}
                </div>
                <div className="text-lg text-muted truncate">{BADGES[k].line}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Who's heating up? ----------

function heatLabel(last: ("right" | "wrong" | "missed")[]) {
  const n = last.length || 1;
  const right = last.filter((x) => x === "right").length;
  const recent = last.slice(-2).filter((x) => x === "right").length;
  if (right === n && n >= 3) return { text: "ON FIRE", cls: "text-[#ff8a3d]", emoji: "🔥" };
  if (right / n >= 0.6 && recent === 2) return { text: "Heating up", cls: "text-accent-2", emoji: "♨️" };
  if (right / n >= 0.4) return { text: "Steady", cls: "text-good", emoji: "🙂" };
  if (right > 0) return { text: "Cooling down", cls: "text-[#8ab4ff]", emoji: "🌬️" };
  return { text: "Deep freeze", cls: "text-[#9fd6ff]", emoji: "🥶" };
}

export function HeatingBoard({ boards }: { boards: BoardsDTO }) {
  const rows = boards.form.filter((f) => f.last.length > 0);
  const twoCols = rows.length > 6;
  const half = Math.ceil(rows.length / 2);
  const cols = twoCols ? [rows.slice(0, half), rows.slice(half)] : [rows];
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <p className="text-center text-2xl text-muted -mt-1">Last five questions each player could answer</p>
      <div className={`grid gap-6 ${twoCols ? "grid-cols-2" : "grid-cols-1 max-w-[1300px] w-full mx-auto"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className="flex flex-col gap-2.5">
            {col.map((f, i) => {
              const h = heatLabel(f.last);
              const k = ci * half + i;
              return (
                <li key={f.playerId} className="panel flex items-center gap-4 px-4 py-2 tile-in" style={{ animationDelay: `${k * 80}ms` }}>
                  <Avatar name={f.name} piece={f.piece} size={twoCols ? 56 : 68} />
                  <div className="min-w-0 flex-1">
                    <div className={`font-display font-semibold truncate ${twoCols ? "text-3xl" : "text-4xl"}`}>{f.name}</div>
                    <div className={`font-display text-2xl font-bold ${h.cls}`}>
                      <span className={h.text === "ON FIRE" ? "inline-block flame" : ""}>{h.emoji}</span> {h.text}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {f.last.map((x, j) => (
                      <span
                        key={j}
                        className={`grid place-items-center rounded-xl font-bold tile-in ${twoCols ? "w-12 h-12 text-2xl" : "w-14 h-14 text-3xl"} ${
                          x === "right"
                            ? "bg-good/30 text-good border-2 border-good/70"
                            : x === "wrong"
                              ? "bg-bad/25 text-bad border-2 border-bad/60"
                              : "bg-black/30 text-muted border-2 border-white/15"
                        }`}
                        style={{ animationDelay: `${300 + k * 80 + j * 90}ms` }}
                        aria-label={x}
                      >
                        {x === "right" ? "✓" : x === "wrong" ? "✗" : "–"}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </div>
  );
}

// ---------- The family mystery meter ----------

export function MysteryBoard({ boards }: { boards: BoardsDTO }) {
  const go = useGo();
  const list = boards.mystery;
  const most = list[0];
  const open = list[list.length - 1];
  const twoCols = list.length > 6;
  const half = Math.ceil(list.length / 2);
  const cols = twoCols ? [list.slice(0, half), list.slice(half)] : [list];
  return (
    <div className="flex flex-col gap-4 max-w-[1600px] w-full mx-auto flex-1 min-h-0">
      <div className="grid grid-cols-2 gap-6">
        {[
          { p: most, title: "Most mysterious", emoji: "🕵️", tone: "bg-[#3a2050]/70 border-bad/50" },
          { p: open, title: "Open book", emoji: "📖", tone: "bg-[#173f3a]/70 border-good/50" },
        ].map((c, i) => (
          <div key={c.title} className={`rounded-3xl border-2 ${c.tone} px-6 py-3 flex items-center gap-5 tile-in`} style={{ animationDelay: `${i * 200}ms` }}>
            <span className="text-6xl" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="leader-float" style={{ animationDelay: `${-i * 1.1}s` }}>
              <Avatar name={c.p.name} piece={c.p.piece} size={110} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-2xl uppercase tracking-wide text-muted">{c.title}</div>
              <div className="font-display text-5xl font-bold truncate">{c.p.name}</div>
              <div className="text-2xl text-muted">guessed right {Math.round(c.p.rate * 100)}% of the time</div>
            </div>
            <span className={`font-display text-6xl font-bold tabular-nums ${pctText(Math.round(c.p.rate * 100))}`}>{Math.round(c.p.rate * 100)}%</span>
          </div>
        ))}
      </div>
      <div className={`grid gap-x-10 ${twoCols ? "grid-cols-2" : "grid-cols-1"}`}>
        {cols.map((col, ci) => (
          <ol key={ci} className="flex flex-col gap-2">
            {col.map((m, i) => {
              const pct = Math.round(m.rate * 100);
              const k = ci * half + i;
              return (
                <li key={m.playerId} className="flex items-center gap-4">
                  <Avatar name={m.name} piece={m.piece} size={48} />
                  <span className="font-display text-2xl font-semibold w-[220px] truncate">{m.name}</span>
                  <div className="flex-1">
                    <Bar pct={pct} go={go} delay={300 + k * 80} h="h-6" />
                  </div>
                  <span className={`font-display text-2xl font-bold tabular-nums w-[4ch] text-right ${pctText(pct)}`}>{pct}%</span>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </div>
  );
}

// ---------- The family galaxy ----------

export function GalaxyBoard({ boards }: { boards: BoardsDTO }) {
  const go = useGo(200);
  const pts = boards.galaxy;
  const times = pts.map((p) => p.avgMs).sort((a, b) => a - b);
  const minMs = times[0] ?? 0;
  const maxMs = times[times.length - 1] ?? 1;
  const midMs = times.length ? times[Math.floor((times.length - 1) / 2)] : 0;
  // Fixed star field (deterministic so it doesn't jump between renders).
  const stars = useMemo(
    () => Array.from({ length: 70 }, (_, i) => ({ x: (i * 37.3) % 100, y: (i * 61.7) % 100, s: 1 + ((i * 7) % 3), d: (i % 9) * 0.4 })),
    [],
  );
  const xOf = (ms: number) => {
    // Split at the median time so both halves get used; spread each half across its side.
    if (maxMs === minMs) return 50;
    if (ms <= midMs) return 8 + (midMs === minMs ? 20 : ((ms - minMs) / (midMs - minMs)) * 36);
    return 56 + (maxMs === midMs ? 20 : ((ms - midMs) / (maxMs - midMs)) * 36);
  };
  const yOf = (acc: number) => 90 - acc * 80;
  const size = pts.length > 8 ? 72 : 92;
  // Nudge apart anyone who would land on top of someone else (positions in % of a ~1360x570 chart).
  const placed = useMemo(() => {
    const W = 1360;
    const H = 570;
    const minX = 150; // px between centers: room for the piece and the name
    const minY = size + 34;
    const ps = pts.map((p) => ({ id: p.playerId, x: (xOf(p.avgMs) / 100) * W, y: (yOf(p.accuracy) / 100) * H }));
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i];
          const b = ps[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            moved = true;
            // Push along the axis that needs the smaller move.
            const px = (minX - Math.abs(dx)) / 2 + 1;
            const py = (minY - Math.abs(dy)) / 2 + 1;
            if (px < py) {
              const s = dx >= 0 ? 1 : -1;
              a.x -= s * px;
              b.x += s * px;
            } else {
              const s = dy >= 0 ? 1 : -1;
              a.y -= s * py;
              b.y += s * py;
            }
          }
        }
      for (const p of ps) {
        p.x = Math.min(W - 80, Math.max(80, p.x));
        // Keep clear of the corner labels at the top and bottom.
        p.y = Math.min(H - 120, Math.max(size / 2 + 60, p.y));
      }
      if (!moved) break;
    }
    return new Map(ps.map((p) => [p.id, { x: (p.x / W) * 100, y: (p.y / H) * 100 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, size]);
  const quads = [
    { label: "⚡ Lightning geniuses", cls: "left-0 top-0 bg-[#123a4a]/60 text-good", pos: "top-3 left-5" },
    { label: "🧠 Deep thinkers", cls: "right-0 top-0 bg-[#3a3020]/60 text-accent-2", pos: "top-3 right-5" },
    { label: "🚀 Space cadets", cls: "left-0 bottom-0 bg-[#3a1a3f]/60 text-bad", pos: "bottom-3 left-5" },
    { label: "🛸 Lost in space", cls: "right-0 bottom-0 bg-[#24204a]/60 text-[#c4b5fd]", pos: "bottom-3 right-5" },
  ];
  return (
    <div className="flex gap-4 flex-1 min-h-0 max-w-[1500px] w-full mx-auto">
      <div className="flex items-center">
        <span className="font-display text-2xl text-muted [writing-mode:vertical-rl] rotate-180">More right answers →</span>
      </div>
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="relative flex-1 rounded-3xl border-2 border-white/15 overflow-hidden bg-[#0b0820]">
          {stars.map((st, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white twinkle"
              style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s * 2, height: st.s * 2, animationDelay: `${st.d}s` }}
              aria-hidden="true"
            />
          ))}
          {quads.map((q) => (
            <div key={q.label} className={`absolute w-1/2 h-1/2 ${q.cls}`}>
              <span className={`absolute ${q.pos} font-display text-3xl font-bold uppercase tracking-wide opacity-90`}>{q.label}</span>
            </div>
          ))}
          <div className="absolute left-1/2 top-0 bottom-0 border-l-2 border-dashed border-white/30" aria-hidden="true" />
          <div className="absolute top-1/2 left-0 right-0 border-t-2 border-dashed border-white/30" aria-hidden="true" />
          {pts.map((p, i) => (
            <div
              key={p.playerId}
              className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${go ? placed.get(p.playerId)!.x : 50}%`,
                top: `${go ? placed.get(p.playerId)!.y : 50}%`,
                opacity: go ? 1 : 0,
                transition: `left 1400ms cubic-bezier(.2,.9,.3,1.1) ${i * 90}ms, top 1400ms cubic-bezier(.2,.9,.3,1.1) ${i * 90}ms, opacity 400ms ${i * 90}ms`,
              }}
              title={`${p.name}: ${Math.round(p.accuracy * 100)}% right, ${(p.avgMs / 1000).toFixed(1)}s average`}
            >
              <span className="leader-float" style={{ animationDelay: `${-i * 0.5}s` }}>
                <Avatar name={p.name} piece={p.piece} size={size} />
              </span>
              <span className="font-display text-2xl font-semibold whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-2xl text-muted px-2">
          <span>⚡ Faster</span>
          <span>Average answer time</span>
          <span>Slower 🐢</span>
        </div>
      </div>
    </div>
  );
}

// ---------- The answer graveyard ----------

export function GraveyardBoard({ boards }: { boards: BoardsDTO }) {
  const go = useGo(150);
  const graves = boards.graveyard;
  const worst = graves[0];
  // Biggest in the middle, like a podium.
  const order = graves.length === 3 ? [graves[1], graves[0], graves[2]] : graves;
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 max-w-[1500px] w-full mx-auto">
      <p className="text-center text-2xl text-muted -mt-1">In memory of our very confident wrong answers</p>
      <div className="relative flex-1 min-h-0 rounded-3xl overflow-hidden bg-gradient-to-b from-[#120c2c] to-[#1c1440] border-2 border-white/10">
        <div className="absolute right-[8%] top-[8%] w-28 h-28 rounded-full bg-[#e8e4c0] shadow-[0_0_80px_rgba(232,228,192,0.5)]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-[#24452f] rounded-t-[50%_30%]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-[6%] flex justify-center items-end gap-16">
          {order.map((g, i) => {
            const tall = g === worst;
            return (
              <div key={g.label + i} className="flex flex-col items-center">
                <div
                  className={`relative flex flex-col items-center justify-start text-center rounded-t-[999px] border-4 border-[#b9b4cc] bg-[#6a6680] px-6 pt-8 ${
                    tall ? "w-[320px] h-[300px]" : "w-[280px] h-[250px]"
                  }`}
                  style={{
                    transform: go ? "translateY(0)" : "translateY(120%)",
                    transition: `transform 1100ms cubic-bezier(.2,.9,.3,1.15) ${300 + i * 250}ms`,
                  }}
                >
                  <span className="font-display text-4xl font-bold text-[#2a2640]">R.I.P.</span>
                  <span className="font-display text-4xl font-bold mt-3 leading-tight line-clamp-2">{g.label}</span>
                  <span className="text-3xl text-[#ffd1da] mt-2">{g.fooled} fooled</span>
                </div>
                <span className="text-6xl -mt-3 leader-float relative z-10" style={{ animationDelay: `${-i * 0.9}s` }} aria-hidden="true">
                  {tall ? "💀" : "👻"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {worst && (
        <div className="panel-strong px-6 py-3 tile-in" style={{ animationDelay: "1.3s" }}>
          <div className="text-xl text-muted">Biggest fake-out of the night</div>
          <div className="text-3xl">
            <strong className="font-display">{worst.subjectName}</strong>: {worst.prompt} {worst.fooled} people guessed <strong>{worst.label}</strong>.{" "}
            {worst.subjectName} actually chose <strong className="text-accent-2">{worst.actual}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
