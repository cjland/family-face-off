/** DTOs shared between API routes and client components. Never raw DB rows. */
import type { MusicStyle, Theme } from "./settings";

export type Phase = "LOBBY" | "PREPARING" | "QUESTION" | "REVEAL" | "LEADERBOARD" | "FINISHED" | "CANCELLED";
export type View = "player" | "display" | "host";

export type OptionDTO = { id: string; label: string };

export type StandingDTO = {
  playerId: string;
  name: string;
  piece?: string | null;
  points: number;
  rank: number;
  correct: number;
  eligible: number;
  accuracy: number;
  /** Points from the round just revealed (null when the player sat it out). */
  lastRound?: number | null;
};

export type RoundDTO = {
  id: string;
  number: number;
  total: number;
  type: "WHAT_ANSWER" | "WHO_ANSWERED";
  questionText: string;
  promptText: string;
  /** Only for "Who submitted this answer?" rounds, where the answer is the clue. */
  clue: string | null;
  options: OptionDTO[];
  durationMs: number;
  deadlineAt: string | null;
  paused: boolean;
  remainingMs: number;
  answeredCount: number;
  eligibleCount: number;
  /** Display/host only: who has locked in (not what they chose). */
  lockedPlayerIds?: string[];
  /** Display/host only: who sits this one out. */
  subjectPlayerId?: string;
};

export type RevealDTO = {
  correctOptionId: string;
  answerText: string;
  subjectName: string;
  distribution: Record<string, number>;
  guesses: { playerId: string; name: string; piece: string | null; optionId: string; correct: boolean; elapsedMs: number }[];
  subjectPiece: string | null;
  roundStats: {
    correct: number;
    answered: number;
    eligible: number;
    winner: { name: string; piece: string | null; elapsedMs: number } | null;
    loser: { name: string; piece: string | null; reason: "wrong" | "missed" | "slowest"; elapsedMs: number } | null;
  };
};

export type AwardDTO = {
  key: string;
  emoji: string;
  title: string;
  name: string;
  piece: string | null;
  detail: string;
};

export type StatsDTO = {
  leader: { name: string; piece: string | null; points: number }[];
  last: { name: string; piece: string | null; points: number }[];
  awards: AwardDTO[];
  hardest: { questionText: string; answerText: string; pctCorrect: number } | null;
  roundsPlayed: number;
};

export type MeDTO = {
  id: string;
  name: string;
  active: boolean;
  ready: boolean;
  eligible: boolean;
  isSubject: boolean;
  lockedOptionId: string | null;
  points: number;
  rank: number | null;
  lastResult: { correct: boolean; points: number; answered: boolean } | null;
};

export type LobbyPlayerDTO = { id: string; name: string; ready: boolean; piece: string | null };

export type HostRosterDTO = {
  id: string;
  name: string;
  ready: boolean;
  active: boolean;
  isBot: boolean;
  piece: string | null;
  answered: number;
};

export type GameStateDTO = {
  code: string;
  title: string;
  familyName: string;
  theme: Theme;
  music: MusicStyle;
  taunts: boolean;
  phase: Phase;
  version: number;
  serverNow: string;
  rosterLocked: boolean;
  settings: {
    questionSeconds: number;
    speedBonus: number;
    autoReveal: boolean;
    overtimeSeconds: number;
    autoNext: boolean;
    revealSeconds: number;
    roundCount: number;
    perPlayer: number | null;
  };
  counts: { players: number; ready: number };
  lobby: LobbyPlayerDTO[] | null;
  /** Display/host: active players with pieces (for lock-in strips and reveals). */
  players: LobbyPlayerDTO[] | null;
  stats: StatsDTO | null;
  round: RoundDTO | null;
  reveal: RevealDTO | null;
  standings: StandingDTO[] | null;
  me: (MeDTO & { piece: string | null }) | null;
  /** True when this browser is signed in as host (TV can show the "next" arrow). */
  canControl: boolean;
  host: {
    roster: HostRosterDTO[];
    displayKey: string;
    prepareNote: string | null;
    plannedRounds: number;
    demoTools: boolean;
    aiAvailable: boolean;
    aiDistractors: boolean;
  } | null;
};
