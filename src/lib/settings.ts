import { BOARD_IDS, DEFAULT_BOARDS } from "./boards";
import { z } from "zod";

export const THEMES = ["classic", "thanksgiving"] as const;
export type Theme = (typeof THEMES)[number];

export const MUSIC = ["gameshow", "suspense", "lounge", "off"] as const;
export type MusicStyle = (typeof MUSIC)[number];

export const settingsSchema = z
  .object({
    theme: z.enum(THEMES).default("classic"),
    roundCount: z.number().int().min(1).max(80).default(20),
    questionSeconds: z.number().int().min(5).max(120).default(20),
    /** Max speed bonus. 0 = off (default). */
    speedBonus: z.number().int().min(0).max(500).default(0),
    autoReveal: z.boolean().default(false),
    /** With auto reveal: extra seconds to wait for late answers after the timer runs out. */
    overtimeSeconds: z.number().int().min(0).max(30).default(5),
    /** Full-screen "5, 4, 3, 2, 1" before each question; answers open when it hits zero. */
    countdownSeconds: z.number().int().min(0).max(10).default(5),
    autoNext: z.boolean().default(false),
    revealSeconds: z.number().int().min(3).max(30).default(8),
    replaceSkipped: z.boolean().default(true),
    aiDistractors: z.boolean().default(false),
    maxPlayers: z.number().int().min(3).max(50).default(50),
    /** Background music on the TV while people choose (needs "Enable sound" on the TV). */
    music: z.enum(MUSIC).default("gameshow"),
    /** Playful on-screen nudges for players who are slow to lock in. */
    taunts: z.boolean().default(true),
    /** TV sound effects and music (the TV still needs one click/keypress before browsers allow sound). */
    sound: z.boolean().default(true),
    /** TV animations (on even if the TV computer asks for reduced motion). */
    animations: z.boolean().default(true),
    /** Announcer voice on the TV (needs TV sound): reads each question and calls out moments. */
    voice: z.boolean().default(true),
    /** Which leaderboard pages the TV rotates through after each reveal. */
    boards: z.array(z.enum(BOARD_IDS)).min(1).default(DEFAULT_BOARDS),
    /** Questions about each person, chosen by the host at start. Overrides roundCount. */
    perPlayer: z.number().int().min(1).max(8).optional(),
    /** How many people the host expects (only for planning the game length on the setup screen). */
    plannedPlayers: z.number().int().min(3).max(50).optional(),
    /** The fastest right answer each round gets a random 25–50 bonus (on by default). */
    fastestBonus: z.boolean().default(true),
  })
  .strict();

export type GameSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = settingsSchema.parse({});

/** Parses stored settings defensively, filling defaults for any missing keys. */
export function parseSettings(raw: unknown): GameSettings {
  const result = settingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_SETTINGS;
}

export const POINTS_CORRECT = 1000;
export const ANSWER_MAX = 120;
export const NAME_MAX = 24;
export const PROMPT_SLOTS = 8;
export const COMMON_SLOTS = 4;
export const MIN_PLAYERS = 3;
export const RETENTION_DAYS = 7;
