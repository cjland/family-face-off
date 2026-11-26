"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Text that shrinks until it fits in `lines` lines (from `max` px down to `min` px), so a long
 * question never pushes into the answer tiles. Re-measures when the text, width or font changes.
 */
export function FitText({
  text,
  max,
  min,
  lines = 2,
  lineHeight = 1.05,
  className = "",
}: {
  text: string;
  max: number;
  min: number;
  lines?: number;
  lineHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let s = max;
      el.style.fontSize = `${s}px`;
      while (s > min && el.scrollHeight > s * lineHeight * lines + 4) {
        s -= 2;
        el.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text, max, min, lines, lineHeight]);
  return (
    <span ref={ref} className={`block ${className}`} style={{ fontSize: size, lineHeight, textWrap: "balance" }}>
      {text}
    </span>
  );
}
