"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Banner } from "@/components/ui";

type Group = { name: string; count: number; genres: string[]; easy: number; medium: number; hard: number };
type UploadResult = { added: number; skipped: number; groups: string[]; errors: { row: number; message: string }[] };

/**
 * Host page: your own questions for Custom mode. Download the template, fill it in (Excel,
 * Numbers or Google Sheets, saved as CSV), upload it, and pick its groups when setting up a game.
 */
export function QuestionLibrary({ onChange }: { onChange?: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ groups: Group[] }>("/api/questions")
      .then((r) => setGroups(r.groups))
      .catch(() => setGroups([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      if (file.size > 600_000) throw new Error("That file is too big (600 KB max). Split it into smaller files.");
      const csv = await file.text();
      const r = await api<UploadResult>("/api/questions", { method: "POST", body: { csv, replace } });
      setResult(r);
      load();
      onChange?.();
      window.dispatchEvent(new Event("questions-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const enc = encodeURIComponent;
  return (
    <section className="panel p-5 flex flex-col gap-3" aria-labelledby="library">
      <h2 id="library" className="font-display text-2xl font-bold">
        Question library
      </h2>
      <p className="text-sm text-muted">
        Your own questions for <strong>Custom</strong> mode. Fill in the template (each row: group name, genre, difficulty, the question,
        four choices and which one is right), save it as CSV, and upload it.
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-ghost !text-sm !min-h-[44px]" href="/api/questions/template" download>
          ⬇ Template
        </a>
        <label className={`btn btn-primary !text-sm !min-h-[44px] ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : "⬆ Upload CSV"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
        <a className="btn btn-ghost !text-sm !min-h-[44px]" href="/api/questions/audio-list" download title="Which announcer clips to record">
          🎙 Audio list
        </a>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace groups that are already uploaded (instead of adding to them)
      </label>
      {err && <Banner kind="error">{err}</Banner>}
      {result && (
        <Banner kind={result.errors.length ? "info" : "success"}>
          Added {result.added} question{result.added === 1 ? "" : "s"}
          {result.skipped ? ` (${result.skipped} already there)` : ""}
          {result.groups.length ? ` to ${result.groups.join(", ")}` : ""}.
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {result.errors.slice(0, 8).map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
              {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
            </ul>
          )}
        </Banner>
      )}
      {groups === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted">No groups yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.name} className="rounded-xl bg-black/25 px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0">
                <span className="font-semibold block truncate">{g.name}</span>
                <span className="text-xs text-muted block truncate">
                  {g.count} · {g.easy} easy, {g.medium} medium, {g.hard} hard{g.genres.length ? ` · ${g.genres.join(", ")}` : ""}
                </span>
              </span>
              <a className="btn btn-ghost !text-xs !min-h-[36px] !px-2" href={`/api/questions/export?group=${enc(g.name)}`} download title="Download to edit">
                ⬇
              </a>
              <a className="btn btn-ghost !text-xs !min-h-[36px] !px-2" href={`/api/questions/audio-list?group=${enc(g.name)}`} download title="Audio list">
                🎙
              </a>
              <button
                type="button"
                className="btn btn-danger !text-xs !min-h-[36px] !px-2"
                aria-label={`Delete group ${g.name}`}
                onClick={async () => {
                  if (!window.confirm(`Delete all ${g.count} questions in "${g.name}"? Games already played keep their questions.`)) return;
                  await api(`/api/questions?group=${enc(g.name)}`, { method: "DELETE" });
                  load();
                  onChange?.();
                  window.dispatchEvent(new Event("questions-changed"));
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        <strong>Audio list:</strong> each question gets an Audio ID. Record <code>questions/&lt;Audio ID&gt;.mp3</code> to have the announcer read it
        (until then he says &ldquo;read it on the screen&rdquo;). Answer clips are listed for later.
      </p>
    </section>
  );
}
