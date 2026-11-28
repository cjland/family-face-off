"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { BODIES, type BodyId } from "@/lib/bodies";
import { api, ApiClientError } from "@/lib/client/api";
import {
  MASH_DEFAULT_CROP,
  MASH_LIMITS,
  mashLabel,
  mashPiece,
  parseMash,
  type Mash,
} from "@/lib/mash";
import { PIECES, type PieceId } from "@/lib/pieces";

type Pack = {
  id: string;
  name: string;
  characters: { name: string; piece: string }[];
  updatedAt: string;
};
type Draft = {
  id: string | null;
  name: string;
  characters: { name: string; piece: string }[];
};

const NEW_PACK: Draft = { id: null, name: "My characters", characters: [] };
const MAX = 40;

const randomOf = <T,>(a: readonly T[]) =>
  a[Math.floor(Math.random() * a.length)];
const surprise = (): Mash => ({
  head: randomOf(PIECES).id,
  body: randomOf(BODIES).id,
  ...MASH_DEFAULT_CROP,
});

/**
 * Host page: build character packs by mashing characters together — any game piece's head on any
 * costume body. Packs are saved to the database; pick them per game under "Character groups".
 */
export default function CharactersPage() {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [msg, setMsg] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [draft, setDraft] = useState<Draft>(NEW_PACK);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mash, setMash] = useState<Mash>({
    head: "dino",
    body: "hero",
    ...MASH_DEFAULT_CROP,
  });
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ packs: Pack[] }>("/api/packs");
      setPacks(r.packs);
      return r.packs;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) setSignedOut(true);
      else
        setMsg({
          kind: "error",
          text: e instanceof Error ? e.message : "Couldn't load packs.",
        });
      return [];
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      void load().then((ps) => {
        if (ps[0])
          setDraft({
            id: ps[0].id,
            name: ps[0].name,
            characters: ps[0].characters,
          });
      });
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const piece = useMemo(() => mashPiece(mash), [mash]);
  const shownName = name.trim() || mashLabel(mash);
  const inPack = draft.characters.some(
    (c, i) => c.piece === piece && i !== editing,
  );

  const change = (d: Draft) => {
    setDraft(d);
    setDirty(true);
  };
  const openPack = (p: Pack | null) => {
    if (
      dirty &&
      !confirm("You have unsaved changes to this pack. Switch anyway?")
    )
      return;
    setDraft(
      p ? { id: p.id, name: p.name, characters: p.characters } : NEW_PACK,
    );
    setDirty(false);
    setEditing(null);
    setMsg(null);
  };
  const addOrUpdate = () => {
    const entry = { name: shownName.slice(0, 24), piece };
    if (editing !== null) {
      change({
        ...draft,
        characters: draft.characters.map((c, i) => (i === editing ? entry : c)),
      });
      setEditing(null);
    } else {
      change({ ...draft, characters: [...draft.characters, entry] });
    }
    setName("");
  };
  const edit = (i: number) => {
    const c = draft.characters[i];
    const m = parseMash(c.piece);
    if (!m) return;
    setMash(m);
    setName(c.name === mashLabel(m) ? "" : c.name);
    setEditing(i);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = { name: draft.name, characters: draft.characters };
      const r = draft.id
        ? await api<{ pack: Pack }>(`/api/packs/${draft.id}`, {
            method: "PATCH",
            body,
          })
        : await api<{ pack: Pack }>("/api/packs", { method: "POST", body });
      setDraft({
        id: r.pack.id,
        name: r.pack.name,
        characters: r.pack.characters,
      });
      setDirty(false);
      await load();
      setMsg({
        kind: "success",
        text: `Saved “${r.pack.name}”. Pick it under Character groups when you set up a game.`,
      });
    } catch (e) {
      setMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't save the pack.",
      });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!draft.id) return openPack(null);
    if (
      !confirm(
        `Delete the pack “${draft.name}”? Games already set up with it go back to the built-in characters.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/api/packs/${draft.id}`, { method: "DELETE" });
      const ps = await load();
      setDirty(false);
      setDraft(
        ps[0]
          ? { id: ps[0].id, name: ps[0].name, characters: ps[0].characters }
          : NEW_PACK,
      );
    } finally {
      setBusy(false);
    }
  };

  if (signedOut) {
    return (
      <Stage theme="classic">
        <main className="mx-auto max-w-xl px-5 py-16 flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">Characters</h1>
          <p>Sign in as the host to build character packs.</p>
          <Link className="btn btn-primary self-start" href="/host">
            Go to host sign in
          </Link>
        </main>
      </Stage>
    );
  }

  const slider = (key: "zoom" | "cx" | "cy", label: string, step: number) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="range"
        min={MASH_LIMITS[key][0]}
        max={MASH_LIMITS[key][1]}
        step={step}
        value={mash[key]}
        onChange={(e) => setMash({ ...mash, [key]: Number(e.target.value) })}
        className="accent-[var(--accent)]"
      />
    </label>
  );

  return (
    <Stage theme="classic">
      <main className="mx-auto max-w-[1500px] px-5 py-8 flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" aria-label="Home">
            <TitleMark title="Family Face-Off" theme="classic" size="sm" />
          </Link>
          <Link className="btn btn-ghost !text-base" href="/host">
            ← Back to games
          </Link>
        </header>
        <div>
          <h1 className="font-display text-4xl font-bold">Characters</h1>
          <p className="text-muted mt-1">
            Mash characters together: put any character’s head on any costume,
            name it, and add it to a pack. Players pick from your packs when
            they join.
          </p>
        </div>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        {!packs ? (
          <Spinner />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[260px_1fr_400px]">
            {/* Packs */}
            <nav
              aria-label="Character packs"
              className="panel p-3 flex flex-col gap-1 self-start"
            >
              <h2 className="font-display text-xl font-bold px-2 pb-1">
                Packs
              </h2>
              {packs.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={draft.id === p.id}
                  onClick={() => openPack(p)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left min-h-[44px] ${draft.id === p.id ? "bg-accent/20 font-semibold" : "hover:bg-white/10"}`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-sm text-muted">
                    {p.characters.length}
                  </span>
                </button>
              ))}
              {packs.length === 0 && (
                <p className="text-sm text-muted px-2">No packs yet.</p>
              )}
              <button
                className="btn btn-ghost !text-sm mt-2"
                onClick={() => openPack(null)}
              >
                + New pack
              </button>
            </nav>

            {/* Builder */}
            <section
              className="panel p-5 flex flex-col gap-4"
              aria-labelledby="builder"
            >
              <h2 id="builder" className="font-display text-2xl font-bold">
                {editing !== null ? "Edit character" : "Mash one up"}
              </h2>
              <div className="grid gap-5 md:grid-cols-[260px_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl bg-black/25 p-3">
                    <Avatar name={shownName} piece={piece} size={230} />
                  </div>
                  <p className="font-display text-xl font-bold text-center">
                    {shownName}
                  </p>
                  <button
                    className="btn btn-ghost !text-sm"
                    onClick={() => setMash(surprise())}
                  >
                    🎲 Surprise me
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-semibold">Name (optional)</span>
                    <input
                      className="input"
                      maxLength={24}
                      placeholder={mashLabel(mash)}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <p className="text-sm font-semibold -mb-1">Fit the head</p>
                  {slider("zoom", "Zoom", 0.1)}
                  {slider("cx", "Left / right", 0.01)}
                  {slider("cy", "Up / down", 0.01)}
                  <button
                    className="btn btn-ghost !text-sm self-start"
                    onClick={() => setMash({ ...mash, ...MASH_DEFAULT_CROP })}
                  >
                    Reset fit
                  </button>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <button
                      className="btn btn-primary"
                      disabled={
                        inPack ||
                        (editing === null && draft.characters.length >= MAX)
                      }
                      onClick={addOrUpdate}
                    >
                      {editing !== null
                        ? "Update character"
                        : inPack
                          ? "Already in the pack"
                          : `Add to “${draft.name || "pack"}”`}
                    </button>
                    {editing !== null && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <fieldset>
                <legend className="font-semibold mb-2">Head</legend>
                <div
                  className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-1.5"
                  role="radiogroup"
                  aria-label="Head"
                >
                  {PIECES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={mash.head === p.id}
                      aria-label={p.label}
                      title={p.label}
                      onClick={() =>
                        setMash({ ...mash, head: p.id as PieceId })
                      }
                      className={`rounded-xl p-1 grid place-items-center ${mash.head === p.id ? "bg-accent/30 ring-2 ring-accent" : "bg-black/20 hover:bg-white/10"}`}
                    >
                      <Avatar name={p.label} piece={p.id} size={48} />
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="font-semibold mb-2">Costume</legend>
                <div
                  className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-1.5"
                  role="radiogroup"
                  aria-label="Costume"
                >
                  {BODIES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={mash.body === b.id}
                      aria-label={b.label}
                      title={b.label}
                      onClick={() => setMash({ ...mash, body: b.id as BodyId })}
                      className={`rounded-xl p-1 flex flex-col items-center ${mash.body === b.id ? "bg-accent/30 ring-2 ring-accent" : "bg-black/20 hover:bg-white/10"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/bodies/${b.id}.webp`}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain"
                        draggable={false}
                      />
                      <span className="text-[10px] leading-tight">
                        {b.label}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>

            {/* Pack contents */}
            <section
              className="panel p-5 flex flex-col gap-3 self-start"
              aria-labelledby="pack"
            >
              <h2 id="pack" className="sr-only">
                Pack
              </h2>
              <label className="flex flex-col gap-1">
                <span className="font-semibold">Pack name</span>
                <input
                  className="input"
                  maxLength={40}
                  value={draft.name}
                  onChange={(e) => change({ ...draft, name: e.target.value })}
                />
              </label>
              <p className="text-sm text-muted">
                {draft.characters.length} of {MAX} characters
                {dirty ? " · unsaved changes" : ""}
              </p>
              {draft.characters.length === 0 ? (
                <p className="text-muted">
                  Mash some characters and add them here.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2">
                  {draft.characters.map((c, i) => (
                    <li
                      key={c.piece}
                      className={`rounded-xl bg-black/20 p-2 flex flex-col items-center gap-1 ${editing === i ? "ring-2 ring-accent" : ""}`}
                    >
                      <Avatar name={c.name} piece={c.piece} size={72} />
                      <span className="text-xs text-center leading-tight">
                        {c.name}
                      </span>
                      <span className="flex gap-1">
                        <button
                          className="text-xs underline"
                          onClick={() => edit(i)}
                          aria-label={`Edit ${c.name}`}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs underline text-bad"
                          aria-label={`Remove ${c.name}`}
                          onClick={() => {
                            change({
                              ...draft,
                              characters: draft.characters.filter(
                                (_, j) => j !== i,
                              ),
                            });
                            if (editing === i) setEditing(null);
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  disabled={
                    busy || !draft.name.trim() || (!dirty && !!draft.id)
                  }
                  onClick={save}
                >
                  {busy ? "Saving…" : draft.id ? "Save pack" : "Create pack"}
                </button>
                {(draft.id || draft.characters.length > 0) && (
                  <button
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={remove}
                  >
                    {draft.id ? "Delete pack" : "Discard"}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </Stage>
  );
}
