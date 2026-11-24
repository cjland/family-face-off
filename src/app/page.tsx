"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stage, TitleMark } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  return (
    <Stage theme="classic">
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-10 px-5 py-12">
        <div className="text-center">
          <TitleMark title="Family Face-Off" theme="classic" size="lg" />
          <p className="mt-4 text-lg text-muted">How well do you really know each other?</p>
        </div>

        <form
          className="panel w-full p-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 6) router.push(`/join/${clean}`);
          }}
        >
          <label htmlFor="code" className="font-display text-2xl font-semibold">
            Join a game
          </label>
          <input
            id="code"
            className="input text-center font-display text-3xl tracking-[0.35em] uppercase"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            placeholder="ABC123"
            value={clean}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby="code-help"
          />
          <p id="code-help" className="text-sm text-muted">
            Enter the six-character code on the TV, or just scan the QR code.
          </p>
          <button className="btn btn-primary" type="submit" disabled={clean.length !== 6}>
            Join
          </button>
        </form>

        <div className="text-center text-muted">
          Running the party?{" "}
          <Link href="/host" className="font-semibold text-accent underline underline-offset-4">
            Host a game
          </Link>
        </div>
      </main>
    </Stage>
  );
}
