import type { BoardId } from "./boards";
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
  /** When answers open (end of the pre-question countdown). */
  opensAt: string | null;
  paused: boolean;
  remainingMs: number;
  answeredCount: number;
  eligibleCount: number;
  /** Display/host only: who has locked in (not what they chose). */
  lockedPlayerIds?: string[];
  /** Display/host only: the bank question id (e.g. "q001") for the announcer's clip. */
  promptId?: string | null;
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
    winner: { name: string; piece: string | null; elapsedMs: number; slogan: string } | null;
    loser: { name: string; piece: string | null; reason: "wrong" | "missed" | "slowest"; elapsedMs: number; slogan: string } | null;
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
  /** The (first) leader's game so far, round by round, for the TV's leader spotlight. */
  leaderRun: LeaderRunDTO | null;
  /** Extra TV leaderboard pages, all from revealed rounds only. */
  boards: BoardsDTO | null;
};

type Who = { playerId: string; name: string; piece: string | null };

export type BoardsDTO = {
  /** Every revealed question, hardest first. */
  stumpers: (Who & {
    number: number;
    prompt: string;
    answer: string;
    pctCorrect: number;
    right: number;
    eligible: number;
    /** Nobody / everybody got it, or the right answer was the least popular pick. */
    badge: "impossible" | "everybody" | "surprise" | null;
  })[];
  /** Each player's last five eligible questions, oldest first. */
  form: (Who & { last: ("right" | "wrong" | "missed")[] })[];
  /** How often the family guessed right about each person. */
  mystery: (Who & { rate: number; right: number; total: number })[];
  /** Average answer time vs accuracy, per player who has answered. */
  galaxy: (Who & { avgMs: number; accuracy: number; answered: number })[];
  /** Every revealed question, oldest first, for browsing back on the TV's "This round" page. */
  history: {
    number: number;
    roundId: string;
    questionText: string;
    subject: Who;
    answer: string;
    durationMs: number;
    right: number;
    eligible: number;
    rows: (Who & { letter: string | null; label: string | null; correct: boolean; elapsedMs: number | null; points: number })[];
  }[];
  /** The wrong answers that fooled the most people. */
  graveyard: { label: string; fooled: number; subjectName: string; prompt: string; actual: string }[];
};

export type LeaderRunDTO = {
  playerId: string;
  name: string;
  piece: string | null;
  points: number;
  tied: boolean;
  correct: number;
  eligible: number;
  avgCorrectMs: number | null;
  bestStreak: number;
  /** Everyone's rank after each question, for the chart (leader included). */
  field: { playerId: string; name: string; piece: string | null; ranks: number[] }[];
  history: {
    number: number;
    result: "right" | "wrong" | "missed" | "subject";
    points: number;
    elapsedMs: number | null;
    rank: number;
    total: number;
  }[];
};

export type MeDTO = {
  id: string;
  name: string;
  /** Catchphrases as they'll appear, and whether the player chose them (false = picked for them). */
  slogans: { win: string; lose: string; customWin: boolean; customLose: boolean };
  active: boolean;
  ready: boolean;
  eligible: boolean;
  isSubject: boolean;
  lockedOptionId: string | null;
  points: number;
  rank: number | null;
  lastResult: { correct: boolean; points: number; answered: boolean } | null;
};

export type LobbyPlayerDTO = {
  id: string;
  name: string;
  ready: boolean;
  piece: string | null;
  /** TV/host only: catchphrases (picked-for-you ones filled in). */
  winSlogan?: string;
  loseSlogan?: string;
};

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
  sound: boolean;
  animations: boolean;
  voice: boolean;
  boards: BoardId[];
  /** Length of the 5-4-3-2-1 before each question. */
  countdownSeconds: number;
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
    plannedPlayers: number | null;
    fastestBonus: boolean;
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
