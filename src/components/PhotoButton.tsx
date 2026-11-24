"use client";

import { useRef, useState } from "react";
import { prepareSquarePhoto } from "@/lib/client/photo";

/** Opens the camera / photo library and returns a small square JPEG data URL. */
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
            await onPicked(await prepareSquarePhoto(file));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't use that photo.");
          }
        }}
      />
      {error && (
        <span role="alert" className="block text-sm text-bad mt-1">
          {error}
        </span>
      )}
    </>
  );
}
