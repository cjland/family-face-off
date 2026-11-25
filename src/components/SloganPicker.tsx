"use client";

import { useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import type { MeDTO } from "@/lib/dto";
import { LOSE_SLOGANS, SLOGAN_MAX, WIN_SLOGANS, type SloganKind } from "@/lib/slogans";

const COPY: Record<SloganKind, { title: string; hint: string; list: string[]; chip: string }> = {
  win: {
    title: "🏆 When you win a round",
    hint: "Shown on the TV when you're the fastest right answer, and if you win the game.",
    list: WIN_SLOGANS,
    chip: "bg-accent text-black",
  },
  lose: {
    title: "😬 When you lose a round",
    hint: "Shown on the TV when you're the round's loser. Own it!",
    list: LOSE_SLOGANS,
    chip: "bg-bad/80 text-white",
  },
};

/** Lets a player pick (or write) their win and lose catchphrases. */
export function SloganPicker({ code, me, onSaved }: { code: string; me: MeDTO; onSaved: () => void }) {
  return (
    <div className="panel p-4 flex flex-col gap-5">
      <div>
        <p className="font-display text-xl font-bold">Your catchphrases</p>
        <p className="text-sm text-muted">Pick one or write your own (up to {SLOGAN_MAX} characters). You can change them any time.</p>
      </div>
      <SloganRow code={code} kind="win" current={me.slogans.win} custom={me.slogans.customWin} onSaved={onSaved} />
      <SloganRow code={code} kind="lose" current={me.slogans.lose} custom={me.slogans.customLose} onSaved={onSaved} />
    </div>
  );
}

function SloganRow({ code, kind, current, custom, onSaved }: { code: string; kind: SloganKind; current: string; custom: boolean; onSaved: () => void }) {
  const c = COPY[kind];
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/games/${code}/slogans`, { method: "PATCH", body: { [kind]: value } });
      setWriting(false);
      setDraft("");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-label={c.title}>
      <p className="font-semibold">{c.title}</p>
      <p className={`self-start rounded-2xl px-4 py-2 font-display text-lg font-bold ${c.chip}`}>
        “{current}”{!custom && <span className="ml-2 text-xs font-sans font-normal opacity-75">picked for you</span>}
      </p>
      <p className="text-xs text-muted">{c.hint} Swipe for ideas →</p>
      {/* One sideways-scrolling row of ideas keeps the screen short. */}
      <div
        className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
        role="group"
        aria-label={`${kind === "win" ? "Winning" : "Losing"} catchphrase ideas`}
      >
        {c.list.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => save(s)}
            className={`flex-none whitespace-nowrap rounded-full border px-3 min-h-[44px] text-sm ${
              custom && s === current ? "border-accent bg-accent/20" : "border-white/20 bg-black/25"
            }`}
            aria-pressed={custom && s === current}
          >
            {s}
          </button>
        ))}
      </div>
      {writing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft);
          }}
        >
          <label className="sr-only" htmlFor={`slogan-${kind}`}>
            Write your own
          </label>
          <input
            id={`slogan-${kind}`}
            className="input"
            value={draft}
            maxLength={SLOGAN_MAX}
            placeholder={kind === "win" ? "e.g. Grandma always wins!" : "e.g. I let you have that one"}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted tabular-nums mr-auto">
              {draft.length}/{SLOGAN_MAX}
            </span>
            <button type="button" className="btn btn-ghost !text-base !min-h-[44px]" onClick={() => setWriting(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !text-base !min-h-[44px]" disabled={busy || !draft.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost !text-sm !min-h-[44px] !px-4" disabled={busy} onClick={() => setWriting(true)}>
            ✏️ Write my own
          </button>
          {custom && (
            <button type="button" className="btn btn-ghost !text-sm !min-h-[44px] !px-4" disabled={busy} onClick={() => save(null)}>
              🎲 Surprise me
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
