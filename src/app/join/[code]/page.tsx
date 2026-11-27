"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BodyPicker } from "@/components/BodyPicker";
import { PhotoPicker } from "@/components/PhotoButton";
import { DEFAULT_BODY, type BodyId } from "@/lib/bodies";
import { Avatar, Banner, Spinner, Stage, TitleMark } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client/api";
import type { GameStateDTO } from "@/lib/dto";
import { PIECES } from "@/lib/pieces";
import type { Theme } from "@/lib/settings";

type Info = { title: string; familyName: string | null; theme: Theme; open: boolean; taken: string[]; pieces?: string[] };

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [checking, setChecking] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);
  const [name, setName] = useState("");
  const [piece, setPiece] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [body, setBody] = useState<BodyId>(DEFAULT_BODY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  // Already joined on this device? Go straight back into the game.
  useEffect(() => {
    let alive = true;
    api<GameStateDTO>(`/api/games/${code}/state?view=player`)
      .then(() => alive && router.replace(`/play/${code}`))
      .catch(async (err) => {
        if (!alive) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setFatal(err.message);
        } else {
          try {
            const i = await api<Info>(`/api/games/${code}/info`);
            if (!alive) return;
            setInfo(i);
            if (!i.open) setFatal("This game has already started, so new players can't join. Already playing? Open this on the same phone and browser you joined with and you'll jump straight back in.");
          } catch (e) {
            if (alive) setFatal(e instanceof Error ? e.message : "Couldn't find that game.");
          }
        }
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [code, router]);

  // Keep "taken" pieces fresh while choosing.
  useEffect(() => {
    if (!info?.open) return;
    const id = setInterval(() => {
      api<Info>(`/api/games/${code}/info`)
        .then((i) => setInfo(i))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [code, info?.open]);

  const theme = info?.theme ?? "classic";
  if (checking) {
    return (
      <Stage theme={theme}>
        <Spinner label="Finding your game" />
      </Stage>
    );
  }

  const taken = new Set(info?.taken ?? []);
  // Only this game's character groups (the host picks them when creating the game).
  const allowedIds = new Set(info?.pieces ?? PIECES.map((p) => p.id));
  const choices = PIECES.filter((p) => allowedIds.has(p.id));
  const allTaken = choices.every((p) => taken.has(p.id));

  return (
    <Stage theme={theme}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
        <TitleMark title={info?.title ?? "Family Face-Off"} family={info?.familyName} theme={theme} size="md" />
        {fatal ? (
          <div className="flex flex-col gap-4">
            <Banner kind="error">{fatal}</Banner>
            <Link href="/" className="btn btn-primary">
              Try another code
            </Link>
          </div>
        ) : (
          <form
            className="panel p-5 flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                await api(`/api/games/${code}/join`, { method: "POST", body: { name, piece: piece ?? undefined } });
                if (photo) {
                  try {
                    await api(`/api/games/${code}/photo`, { method: "POST", body: { image: photo, body } });
                  } catch (err) {
                    // They're in the game either way; tell them the photo didn't make it.
                    setError(
                      `You're in! But your photo didn't upload (${err instanceof ApiClientError ? err.message : "network problem"}). You can try again from the next screen.`,
                    );
                    setTimeout(() => router.replace(`/play/${code}`), 3500);
                    return;
                  }
                }
                router.replace(`/play/${code}`);
              } catch (err) {
                setError(err instanceof ApiClientError ? err.message : "Couldn't join. Please try again.");
                if (err instanceof ApiClientError && err.code === "PIECE_TAKEN") {
                  setPiece(null);
                  api<Info>(`/api/games/${code}/info`).then(setInfo).catch(() => {});
                }
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
            />
            <fieldset>
              <legend className="font-display text-2xl font-semibold mb-2">Pick your game piece</legend>
              <div className="flex items-center gap-3 mb-3">
                {photo ? (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold">Pick an outfit for your face:</span>
                      <button type="button" className="btn btn-ghost !text-sm !min-h-[40px]" onClick={() => setPhoto(null)}>
                        Use a piece instead
                      </button>
                    </div>
                    <BodyPicker face={photo} value={body} onChange={setBody} />
                  </div>
                ) : (
                  <PhotoPicker
                    className="btn btn-ghost !text-base w-full"
                    onPicked={(d) => {
                      setPhoto(d);
                      setPiece(null);
                    }}
                  >
                    📷 Use my own photo
                  </PhotoPicker>
                )}
              </div>
              <div className={`grid grid-cols-5 gap-1.5 max-h-[46vh] overflow-y-auto pr-1 ${photo ? "hidden" : ""}`} role="radiogroup" aria-label="Game pieces">
                {choices.map((p) => {
                  const isTaken = taken.has(p.id) && !allTaken;
                  const selected = piece === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${p.label}${isTaken ? " (taken)" : ""}`}
                      disabled={isTaken}
                      onClick={() => {
                        setPiece(p.id);
                        setPhoto(null);
                      }}
                      className={`relative rounded-2xl p-1 flex flex-col items-center min-h-[72px] transition ${
                        selected ? "bg-accent/30 ring-4 ring-accent scale-105" : "bg-black/20 hover:bg-white/10"
                      } ${isTaken ? "opacity-30 grayscale" : ""}`}
                    >
                      <Avatar name={p.label} piece={p.id} size={50} />
                      <span className="text-[11px] leading-tight mt-0.5">{isTaken ? "Taken" : p.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted mt-2">
                {photo
                  ? "Your face shows up on the TV all game long. Photos are deleted when the game is deleted."
                  : piece
                    ? "Great choice!"
                    : "Skip it and we'll pick one for you."}
              </p>
            </fieldset>
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
