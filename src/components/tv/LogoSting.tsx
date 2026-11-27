"use client";

/**
 * The game's "logo sting" when a game starts: a neon pill with a travelling blue → teal → gold
 * outline opens up from the middle to reveal the title, a light sweeps through the letters, and a
 * sparkle spins at the corner.
 */
export function LogoSting({ title, family, width = 1500 }: { title: string; family?: string | null; width?: number }) {
  return (
    <div className="flex justify-center">
      <div
        className="sting-pill neon-ring relative rounded-full bg-[#0b0620] h-[260px]"
        style={{ ["--sting-w" as string]: `${width}px` }}
      >
        <div className="absolute inset-0 rounded-full overflow-hidden grid place-items-center">
          <div className="text-center whitespace-nowrap">
            {family && <div className="text-4xl text-accent-2 mb-1">{family}</div>}
            <div className="font-display text-[7.5rem] leading-none font-bold gold-sweep">{title}</div>
          </div>
        </div>
        <span className="sparkle-spin absolute -top-8 right-[12%] text-8xl" aria-hidden="true">
          ✦
        </span>
      </div>
    </div>
  );
}
