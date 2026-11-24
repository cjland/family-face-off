/** DTOs shared between API routes and client components. Never raw DB rows. */
import type { Theme } from "./settings";

export type Phase = "LOBBY" | "PREPARING" | "QUESTION" | "REVEAL" | "FINISHED" | "CANCELLED";
export type View = "player" | "display" | "host";

export type OptionDTO = { id: string; label: string };

export type StandingDTO = {
  playerId: string;
  name: string;
  points: number;
  rank: number;
  correct: number;
  eligible: number;
  accuracy: number;
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
};

export type RevealDTO = {
  correctOptionId: string;
  answerText: string;
  subjectName: string;
  distribution: Record<string, number>;
  /** Display/host only. */
  guesses?: { name: string; optionId: string; correct: boolean }[];
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

export type LobbyPlayerDTO = { id: string; name: string; ready: boolean };

export type HostRosterDTO = {
  id: string;
  name: string;
  ready: boolean;
  active: boolean;
  isBot: boolean;
  answered: number;
};

export type GameStateDTO = {
  code: string;
  title: string;
  theme: Theme;
  phase: Phase;
  version: number;
  serverNow: string;
  rosterLocked: boolean;
  settings: {
    questionSeconds: number;
    speedBonus: number;
    autoReveal: boolean;
    autoNext: boolean;
    revealSeconds: number;
    roundCount: number;
  };
  counts: { players: number; ready: number };
  lobby: LobbyPlayerDTO[] | null;
  round: RoundDTO | null;
  reveal: RevealDTO | null;
  standings: StandingDTO[] | null;
  me: MeDTO | null;
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
