/**
 * Questions picked in the host's question library, kept in this browser until a game is made
 * from them. promptIds: "about you" questions; questionIds: built-in trivia and uploaded questions.
 */
export type Picks = { promptIds: string[]; questionIds: string[] };

const KEY = "ffo-library-picks-v1";
export const EMPTY_PICKS: Picks = { promptIds: [], questionIds: [] };

export function loadPicks(): Picks {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Picks> | null;
    return {
      promptIds: Array.isArray(raw?.promptIds) ? raw.promptIds.filter((x) => typeof x === "string") : [],
      questionIds: Array.isArray(raw?.questionIds) ? raw.questionIds.filter((x) => typeof x === "string") : [],
    };
  } catch {
    return EMPTY_PICKS;
  }
}

export function savePicks(p: Picks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode etc.: picks just won't survive a reload.
  }
}
