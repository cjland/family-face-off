"use client";

import { formatMinutes, plannedMinutes } from "@/lib/plan";

/** Quiz / Custom start dialog: how many questions (never more than there are). */
export function QuestionCountPicker({
  available,
  value,
  onChange,
  seconds,
  big = false,
}: {
  available: number;
  value: number;
  onChange: (n: number) => void;
  seconds: number;
  big?: boolean;
}) {
  const choices = [...new Set([5, 10, 15, 20, 30, 40].filter((n) => n < available).concat(Math.min(available, 80)))];
  return (
    <>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="How many questions">
        {choices.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`btn ${value === n ? "btn-primary" : "btn-ghost"} ${big ? "!text-3xl !min-w-[96px]" : "!min-w-[56px]"}`}
            onClick={() => onChange(n)}
          >
            {n === available ? `All ${n}` : n}
          </button>
        ))}
      </div>
      <p className={big ? "text-3xl" : "text-lg"}>
        <strong>{Math.min(value, available)} questions</strong>, about {formatMinutes(plannedMinutes(Math.min(value, available), seconds))}. Everyone
        answers every question.
      </p>
    </>
  );
}

