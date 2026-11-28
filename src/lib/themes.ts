import type { Theme } from "@/lib/settings";

/** What each theme looks like beyond its colors (colors live in globals.css under [data-theme]). */
export const THEME_INFO: Record<
  Theme,
  {
    label: string;
    /** Small line over the title, e.g. "Christmas Edition". */
    edition: string | null;
    /** Decorations drifting across the screen. */
    decor: "leaf" | "snow" | "football" | "balloon" | null;
    /** Final-podium confetti. */
    confetti: string[];
  }
> = {
  classic: { label: "Classic game show", edition: null, decor: null, confetti: ["#f5c542", "#ffffff", "#7c5cff", "#ff5d8f"] },
  thanksgiving: { label: "Thanksgiving", edition: "Thanksgiving Edition", decor: "leaf", confetti: ["#f28c28", "#a3203a", "#ffc46b", "#fff6e6"] },
  christmas: { label: "Christmas", edition: "Christmas Edition", decor: "snow", confetti: ["#d62839", "#1f8a4c", "#f4d35e", "#ffffff"] },
  football: { label: "Football", edition: "Game Day Edition", decor: "football", confetti: ["#ffffff", "#2fbf71", "#c8662d", "#ffd23f"] },
  birthday: { label: "Birthday", edition: "Birthday Edition", decor: "balloon", confetti: ["#ff5d8f", "#4cc9f0", "#ffd23f", "#9b5de5", "#00f5d4"] },
};
