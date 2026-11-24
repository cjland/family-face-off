"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client/api";
import type { GameStateDTO } from "@/lib/dto";
import type { Theme } from "@/lib/settings";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("classic");

  // Already joined on this device? Go straight back into the game.
  useEffect(() => {
    let alive = true;
    api<GameStateDTO>(`/api/games/${code}/state?view=player`)
      .then((s) => {
        if (alive) router.replace(`/play/${code}`);
        return s;
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiClientError && err.status === 404) setFatal(err.message);
        setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [code, router]);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem("ffo_theme_hint");
      if (t === "thanksgiving") {
        const id = setTimeout(() => setTheme("thanksgiving"), 0);
        return () => clearTimeout(id);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  if (checking) {
    return (
      <Stage theme={theme}>
        <Spinner label="Finding your game" />
      </Stage>
    );
  }

  return (
    <Stage theme={theme}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
        <TitleMark title="Family Face-Off" theme={theme} size="md" />
        {fatal ? (
          <div className="flex flex-col gap-4">
            <Banner kind="error">{fatal}</Banner>
            <Link href="/" className="btn btn-primary">
              Try another code
            </Link>
          </div>
        ) : (
          <form
            className="panel p-6 flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                await api(`/api/games/${code}/join`, { method: "POST", body: { name } });
                router.replace(`/play/${code}`);
              } catch (err) {
                setError(err instanceof ApiClientError ? err.message : "Couldn't join. Please try again.");
                setBusy(false);
              }
            }}
          >
            <p className="text-center text-muted">
              Joining game <span className="font-display text-2xl text-ink tracking-[0.25em]">{code}</span>
            </p>
            <label htmlFor="name" className="font-display text-2xl font-semibold">
              What should we call you?
            </label>
            <input
              id="name"
              className="input text-xl"
              autoComplete="nickname"
              maxLength={24}
              placeholder="e.g. Aunt Rosie"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              aria-describedby="name-help"
            />
            <p id="name-help" className="text-sm text-muted">
              This shows on the TV. Use a name your family will recognise. No account or email needed.
            </p>
            {error && <Banner kind="error">{error}</Banner>}
            <button className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? "Joining…" : "Let's play!"}
            </button>
          </form>
        )}
      </main>
    </Stage>
  );
}
