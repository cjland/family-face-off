"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { Banner, Spinner } from "./ui";

type Item = {
  slot: number;
  promptId: string;
  prompt: string;
  answer: string;
  optionId: string | null;
  options: { id: string; text: string }[];
};

const MAX = 120;

/**
 * Eight private questions, one at a time (progress 1/8), with back/edit, swap-a-question,
 * autosave on each step, and a final review before marking ready.
 */
export function Questionnaire({ code, onReady }: { code: string; onReady: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Item[] }>(`/api/games/${code}/questionnaire`);
      setItems(res.items);
      const firstBlank = res.items.findIndex((i) => !i.answer.trim());
      setStep(firstBlank === -1 ? res.items.length : firstBlank);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your questions.");
    }
  }, [code]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [step, typing]);

  if (!items) return error ? <Banner kind="error">{error}</Banner> : <Spinner label="Loading your questions" />;

  const total = items.length;
  const reviewing = step >= total;
  const item = items[Math.min(step, total - 1)];

  const save = async (slot: number, body: { answer?: string; optionId?: string }) => {
    const res = await api<{ items: Item[] }>(`/api/games/${code}/questionnaire`, { method: "PATCH", body: { answers: [{ slot, ...body }] } });
    setItems(res.items);
  };

  const goTo = (i: number) => {
    setError(null);
    setStep(i);
    const it = items[Math.min(i, total - 1)];
    setTyping(Boolean(it && it.answer && !it.optionId));
  };

  const pick = async (optionId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await save(item.slot, { optionId });
      goTo(step + 1);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (busy) return;
    const value = item.answer.trim();
    if (!value) {
      setError("Please pick or write an answer, or swap this question for another one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save(item.slot, { answer: value });
      goTo(step + 1);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const swap = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ items: Item[] }>(`/api/games/${code}/questionnaire/replace`, { method: "POST", body: { slot: item.slot } });
      setItems(res.items);
      setTyping(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't swap that question.");
    } finally {
      setBusy(false);
    }
  };

  const ready = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/games/${code}/ready`, { method: "POST", body: { ready: true } });
      onReady();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't mark you ready.");
      setBusy(false);
    }
  };

  if (reviewing) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="review-title">
        <h2 id="review-title" className="font-display text-3xl font-bold">
          Looking good!
        </h2>
        {(() => {
          const missing = items.filter((i) => !i.answer.trim()).length;
          return (
            <div className="panel p-4 flex flex-col gap-3">
              <p className="text-muted">
                {missing === 0
                  ? `All ${items.length} answered. Your answers stay secret until they come up in the game.`
                  : `${missing} still need${missing === 1 ? "s" : ""} an answer. Tap ${missing === 1 ? "it" : "them"} below.`}
              </p>
              {error && <Banner kind="error">{error}</Banner>}
              <button className="btn btn-primary" onClick={ready} disabled={busy || missing > 0}>
                {busy ? "Saving…" : "I'm ready!"}
              </button>
            </div>
          );
        })()}
        <h3 className="font-display text-xl mt-2">Check your answers</h3>
        <p className="text-muted -mt-3 text-sm">Tap any answer to change it.</p>
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={it.slot}>
              <button type="button" className="w-full text-left panel px-4 py-3 min-h-[44px]" onClick={() => goTo(i)}>
                <span className="block text-sm text-muted">
                  {i + 1}. {it.prompt}
                </span>
                <span className="block font-semibold text-lg break-words">{it.answer || <em className="text-bad">No answer yet</em>}</span>
              </button>
            </li>
          ))}
        </ol>
        <button className="btn btn-ghost" onClick={ready} disabled={busy || items.some((i) => !i.answer.trim())}>
          {busy ? "Saving…" : "All good, ready to play"}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="q-title">
      <div>
        <div className="flex justify-between text-sm text-muted mb-2">
          <span>
            Question {step + 1} of {total}
          </span>
          <span>About you</span>
        </div>
        <div
          className="h-3 rounded-full bg-black/30 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-label={`Question ${step + 1} of ${total}`}
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <h2 id="q-title" className="font-display text-3xl font-bold leading-tight">
          {item.prompt}
        </h2>
        {!typing && item.options.length > 0 ? (
          <div className="grid gap-2" role="group" aria-labelledby="q-title">
            {item.options.map((o) => {
              const chosen = item.optionId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`panel text-left px-4 py-3 min-h-[52px] text-lg font-semibold transition ${
                    chosen ? "ring-4 ring-accent bg-accent/20" : "hover:bg-white/10"
                  }`}
                  aria-pressed={chosen}
                  disabled={busy}
                  onClick={() => pick(o.id)}
                >
                  {chosen && <span aria-hidden="true">✓ </span>}
                  {o.text}
                </button>
              );
            })}
            <button
              type="button"
              className={`panel text-left px-4 py-3 min-h-[52px] text-lg text-muted ${item.answer && !item.optionId ? "ring-4 ring-accent" : ""}`}
              disabled={busy}
              onClick={() => setTyping(true)}
            >
              ✏️ Something else…{item.answer && !item.optionId ? `: “${item.answer}”` : ""}
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <textarea
              id="answer"
              ref={inputRef}
              className="input min-h-[96px] resize-none"
              maxLength={MAX}
              rows={3}
              value={item.optionId ? "" : item.answer}
              placeholder="Type your own answer"
              aria-describedby="count-help"
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX);
                setItems((prev) => prev && prev.map((p) => (p.slot === item.slot ? { ...p, answer: v, optionId: null } : p)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void next();
                }
              }}
            />
            <div id="count-help" className="flex justify-between text-sm text-muted">
              <span>Keep it short. Others will guess it!</span>
              <span aria-live="polite">
                {item.optionId ? 0 : item.answer.length}/{MAX}
              </span>
            </div>
            <div className="flex gap-3">
              {item.options.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setTyping(false)} disabled={busy}>
                  Show choices
                </button>
              )}
              <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        )}
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-3 items-center justify-between">
          <button type="button" className="btn btn-ghost" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0 || busy}>
            Back
          </button>
          {item.answer && (
            <button type="button" className="btn btn-ghost" onClick={() => goTo(step + 1)} disabled={busy}>
              {step === total - 1 ? "Review" : "Skip ahead"} ›
            </button>
          )}
        </div>
        <button type="button" className="text-accent underline underline-offset-4 self-center min-h-[44px]" onClick={swap} disabled={busy}>
          Rather not answer? Swap for a different question
        </button>
      </div>
    </section>
  );
}
