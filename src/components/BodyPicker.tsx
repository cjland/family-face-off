"use client";

import { BODIES, type BodyId } from "@/lib/bodies";
import { FaceOnBody } from "./ui";

/** Choose a cartoon body for a face photo; each option previews the actual face. */
export function BodyPicker({ face, value, onChange, disabled }: { face: string; value: BodyId; onChange: (b: BodyId) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1 max-h-[42vh] overflow-y-auto pr-1" role="radiogroup" aria-label="Choose an outfit">
      {BODIES.map((b) => {
        const selected = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={b.label}
            disabled={disabled}
            onClick={() => onChange(b.id)}
            className={`rounded-2xl p-1 flex flex-col items-center transition ${selected ? "bg-accent/30 ring-4 ring-accent" : "bg-black/20 hover:bg-white/10"}`}
          >
            <FaceOnBody src={face} body={b.id} size={58} />
            <span className="text-[11px] leading-tight mt-0.5">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
