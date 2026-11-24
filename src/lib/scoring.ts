import { POINTS_CORRECT } from "./settings";

/**
 * Points for one guess. `remainingMs` is active (unpaused) time left when the guess was locked.
 * Wrong or missing guesses always score zero.
 */
export function pointsFor(params: {
  correct: boolean;
  speedBonus: number;
  remainingMs: number;
  durationMs: number;
}): number {
  if (!params.correct) return 0;
  if (params.speedBonus <= 0 || params.durationMs <= 0) return POINTS_CORRECT;
  const ratio = Math.min(1, Math.max(0, params.remainingMs / params.durationMs));
  return POINTS_CORRECT + Math.floor(params.speedBonus * ratio);
}

export type StandingInput = {
  playerId: string;
  name: string;
  points: number;
  correct: number;
  eligible: number;
};

export type Standing = StandingInput & { rank: number; accuracy: number };

/**
 * Sorts by points (desc), then name for stable rendering. Ties share a rank
 * (standard competition ranking: 1, 1, 3). No speed tie-break.
 */
export function rankStandings(rows: StandingInput[]): Standing[] {
  const sorted = rows
    .slice()
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  let lastPoints: number | null = null;
  let lastRank = 0;
  return sorted.map((row, i) => {
    const rank = lastPoints === row.points ? lastRank : i + 1;
    lastPoints = row.points;
    lastRank = rank;
    return { ...row, rank, accuracy: row.eligible > 0 ? row.correct / row.eligible : 0 };
  });
}

/** Active time remaining for a round, accounting for pauses. */
export function remainingActiveMs(round: {
  deadlineAt: Date | null;
  pausedAt: Date | null;
  remainingMs: number | null;
}, now: Date): number {
  if (round.pausedAt) return Math.max(0, round.remainingMs ?? 0);
  if (!round.deadlineAt) return 0;
  return Math.max(0, round.deadlineAt.getTime() - now.getTime());
}

export function ordinalLabel(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
