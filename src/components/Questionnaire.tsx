"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { Banner, Spinner } from "./ui";

type Item = { slot: number; promptId: string; prompt: string; answer: string };

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
    inputRef.current?.focus();
  }, [step]);

  if (!items) return error ? <Banner kind="error">{error}</Banner> : <Spinner label="Loading your questions" />;

  const total = items.length;
  const reviewing = step >= total;
  const item = items[Math.min(step, total - 1)];

  const save = async (slot: number, answer: string) => {
    const res = await api<{ items: Item[] }>(`/api/games/${code}/questionnaire`, { method: "PATCH", body: { answers: [{ slot, answer }] } });
    setItems(res.items);
  };

  const next = async () => {
    if (busy) return;
    const value = item.answer.trim();
    if (!value) {
      setError("Please write an answer, or swap this question for another one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save(item.slot, value);
      setStep((s) => s + 1);
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
        <p className="text-muted">Your answers stay secret until they come up in the game. Tap any answer to change it.</p>
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={it.slot}>
              <button type="button" className="w-full text-left panel px-4 py-3 min-h-[44px]" onClick={() => setStep(i)}>
                <span className="block text-sm text-muted">
                  {i + 1}. {it.prompt}
                </span>
                <span className="block font-semibold text-lg break-words">{it.answer || <em className="text-bad">No answer yet</em>}</span>
              </button>
            </li>
          ))}
        </ol>
        {error && <Banner kind="error">{error}</Banner>}
        <button className="btn btn-primary" onClick={ready} disabled={busy || items.some((i) => !i.answer.trim())}>
          {busy ? "Saving…" : "I'm ready!"}
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
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        <label id="q-title" htmlFor="answer" className="font-display text-3xl font-bold leading-tight">
          {item.prompt}
        </label>
        <textarea
          id="answer"
          ref={inputRef}
          className="input min-h-[96px] resize-none"
          maxLength={MAX}
          rows={3}
          value={item.answer}
          placeholder="Your answer"
          aria-describedby="count-help"
          onChange={(e) => {
            const v = e.target.value.slice(0, MAX);
            setItems((prev) => prev && prev.map((p) => (p.slot === item.slot ? { ...p, answer: v } : p)));
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
            {item.answer.length}/{MAX}
          </span>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
            Back
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
            {step === total - 1 ? "Review" : "Next"}
          </button>
        </div>
        <button type="button" className="text-accent underline underline-offset-4 self-center min-h-[44px]" onClick={swap} disabled={busy}>
          Rather not answer? Swap for a different question
        </button>
      </form>
    </section>
  );
}
