"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_DRAFT, SettingsForm, type SettingsDraft } from "@/components/SettingsForm";
import { Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client/api";

type GameRow = { code: string; title: string; phase: string; createdAt: string; expiresAt: string; playerCount: number; theme: string };
type Me = { host: true; aiAvailable: boolean; demoTools: boolean };

const PHASE_LABEL: Record<string, string> = {
  LOBBY: "In lobby",
  PREPARING: "Getting ready",
  QUESTION: "Playing",
  REVEAL: "Playing",
  FINISHED: "Finished",
  CANCELLED: "Cancelled",
};

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel p-6 w-full max-w-md flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/host/login", { method: "POST", body: { password } });
          onDone();
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : "Login failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-display text-3xl font-bold">Host sign in</h2>
      <label htmlFor="pw" className="font-semibold">
        Host password
      </label>
      <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <Banner kind="error">{error}</Banner>}
      <button className="btn btn-primary" disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function HostDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [gamesList, setGames] = useState<GameRow[]>([]);
  const [title, setTitle] = useState("Family Face-Off");
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>("/api/host/me");
      setMe(m);
      const g = await api<{ games: GameRow[] }>("/api/games");
      setGames(g.games);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) setMe(null);
      else setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not load games." });
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!checked) {
    return (
      <Stage theme="classic">
        <Spinner />
      </Stage>
    );
  }

  return (
    <Stage theme={draft.theme}>
      <main className="mx-auto max-w-4xl px-5 py-8 flex flex-col gap-8">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" aria-label="Home">
            <TitleMark title="Family Face-Off" theme={draft.theme} size="sm" />
          </Link>
          {me && (
            <button
              className="btn btn-ghost !text-base"
              onClick={async () => {
                await api("/api/host/logout", { method: "POST" }).catch(() => {});
                setMe(null);
              }}
            >
              Sign out
            </button>
          )}
        </header>

        {!me ? (
          <div className="flex justify-center">
            <Login onDone={load} />
          </div>
        ) : (
          <>
            {message && <Banner kind={message.kind}>{message.text}</Banner>}
            <section className="panel p-6 flex flex-col gap-5" aria-labelledby="new-game">
              <h2 id="new-game" className="font-display text-3xl font-bold">
                New game
              </h2>
              <label className="flex flex-col gap-1">
                <span className="font-semibold">Title</span>
                <input className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <SettingsForm value={draft} onChange={setDraft} aiAvailable={me.aiAvailable} />
              <button
                className="btn btn-primary self-start"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMessage(null);
                  try {
                    const res = await api<{ code: string }>("/api/games", { method: "POST", body: { title, settings: draft } });
                    router.push(`/host/${res.code}`);
                  } catch (err) {
                    setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not create the game." });
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Creating…" : "Create game"}
              </button>
            </section>

            <section className="panel p-6 flex flex-col gap-4" aria-labelledby="recent">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 id="recent" className="font-display text-3xl font-bold">
                  Recent games
                </h2>
                <button
                  className="btn btn-ghost !text-base"
                  onClick={async () => {
                    const r = await api<{ deletedGames: number }>("/api/host/cleanup", { method: "POST" });
                    setMessage({ kind: "success", text: `Cleanup done. Removed ${r.deletedGames} expired game(s).` });
                    void load();
                  }}
                >
                  Delete expired data
                </button>
              </div>
              <p className="text-sm text-muted">Games and everyone&apos;s answers are kept for 7 days, or until you delete them here.</p>
              {gamesList.length === 0 ? (
                <p className="text-muted">No games yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {gamesList.map((g) => (
                    <li key={g.code} className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3 flex-wrap">
                      <span className="font-display text-2xl font-bold tracking-widest">{g.code}</span>
                      <span className="flex-1 min-w-[10ch]">
                        <span className="block font-semibold">{g.title}</span>
                        <span className="text-sm text-muted">
                          {PHASE_LABEL[g.phase] ?? g.phase} · {g.playerCount} players · {new Date(g.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <Link className="btn btn-ghost !text-base" href={`/host/${g.code}`}>
                        Open
                      </Link>
                      <button
                        className="btn btn-danger !text-base"
                        onClick={async () => {
                          if (!window.confirm(`Delete game ${g.code} and all of its answers? This can't be undone.`)) return;
                          await api(`/api/games/${g.code}`, { method: "DELETE" });
                          void load();
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </Stage>
  );
}
