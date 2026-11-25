"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampCrop, cropPhoto, loadPhoto, type Crop, type PhotoSource } from "@/lib/client/photo";

/** Opens the camera / photo library, lets the player drag and zoom their face into the circle, then returns a small square JPEG data URL. */
export function PhotoPicker({
  onPicked,
  children,
  className,
  disabled,
}: {
  onPicked: (dataUrl: string) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PhotoSource | null>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a photo"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          try {
            setSource(await loadPhoto(file));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't use that photo.");
          }
        }}
      />
      {source && (
        <PhotoCropper
          source={source}
          onCancel={() => setSource(null)}
          onDone={async (dataUrl) => {
            setSource(null);
            try {
              await onPicked(dataUrl);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't use that photo.");
            }
          }}
        />
      )}
      {error && (
        <span role="alert" className="block text-sm text-bad mt-1">
          {error}
        </span>
      )}
    </>
  );
}

const VIEW = 280;
const MAX_ZOOM = 5;

/** Full-screen sheet: drag to move, pinch / slider to zoom, the circle shows what goes in the costume. */
function PhotoCropper({ source, onCancel, onDone }: { source: PhotoSource; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const minSide = Math.min(source.width, source.height);
  const [crop, setCrop] = useState<Crop>(() => ({ x: (source.width - minSide) / 2, y: (source.height - minSide) / 2, side: minSide }));
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; side: number } | null>(null);
  const zoom = minSide / crop.side;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.current!.width = VIEW * ratio;
    canvas.current!.height = VIEW * ratio;
    ctx.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, VIEW * ratio, VIEW * ratio);
  }, [source, crop]);

  /** Zoom around the middle of the view so the face stays put. */
  const setZoom = useCallback(
    (z: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(1, z));
      setCrop((c) => {
        const side = minSide / clamped;
        const cx = c.x + c.side / 2;
        const cy = c.y + c.side / 2;
        return clampCrop(source, { side, x: cx - side / 2, y: cy - side / 2 });
      });
    },
    [minSide, source],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), side: crop.side };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) setZoom(minSide / (pinch.current.side * (pinch.current.dist / dist)));
      return;
    }
    const scale = crop.side / VIEW;
    const dx = (e.clientX - prev.x) * scale;
    const dy = (e.clientY - prev.y) * scale;
    setCrop((c) => clampCrop(source, { ...c, x: c.x - dx, y: c.y - dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const nudge = (dx: number, dy: number) => setCrop((c) => clampCrop(source, { ...c, x: c.x + dx * c.side * 0.05, y: c.y + dy * c.side * 0.05 }));

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Position your photo">
      <div className="panel w-full max-w-sm p-5 flex flex-col items-center gap-4 !bg-[#1c1440]">
        <h2 className="font-display text-2xl text-center">Center your face</h2>
        <p className="text-muted text-center text-sm -mt-2">Drag to move. Pinch or use the slider to zoom. The circle is what shows in your costume.</p>
        <div
          className="relative rounded-2xl overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing bg-black"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          tabIndex={0}
          aria-label="Photo position. Use arrow keys to move, plus and minus to zoom."
          onKeyDown={(e) => {
            const k = e.key;
            if (k === "ArrowLeft") nudge(-1, 0);
            else if (k === "ArrowRight") nudge(1, 0);
            else if (k === "ArrowUp") nudge(0, -1);
            else if (k === "ArrowDown") nudge(0, 1);
            else if (k === "+" || k === "=") setZoom(zoom * 1.1);
            else if (k === "-") setZoom(zoom / 1.1);
            else return;
            e.preventDefault();
          }}
        >
          <canvas ref={canvas} style={{ width: VIEW, height: VIEW }} />
          {/* Darken everything outside the circle. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(circle closest-side, transparent 98%, rgba(0,0,0,0.6) 100%)" }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full border-4 border-white/90" />
        </div>
        <label className="w-full flex items-center gap-3 text-muted">
          <span aria-hidden="true">➖</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--color-accent,#f5c542)] h-11"
            aria-label="Zoom"
          />
          <span aria-hidden="true">➕</span>
        </label>
        <div className="grid grid-cols-2 gap-3 w-full">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(cropPhoto(source, crop))}>
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
