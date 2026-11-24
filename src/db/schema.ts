import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const gamePhase = pgEnum("game_phase", [
  "LOBBY",
  "PREPARING",
  "QUESTION",
  "REVEAL",
  "FINISHED",
  "CANCELLED",
]);

export const roundStatus = pgEnum("round_status", [
  "PENDING", // generated, waiting to be played
  "RESERVE", // spare round used to replace skipped rounds
  "OPEN", // currently accepting guesses
  "REVEALED", // scored
  "VOID", // skipped / cancelled, never scored
]);

export const roundType = pgEnum("round_type", ["WHAT_ANSWER", "WHO_ANSWERED"]);

export type OptionDTO = { id: string; label: string };

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    phase: gamePhase("phase").notNull().default("LOBBY"),
    settings: jsonb("settings").notNull(),
    currentRoundId: uuid("current_round_id"),
    version: integer("version").notNull().default(0),
    rosterLockedAt: ts("roster_locked_at"),
    prepareError: text("prepare_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("games_code_uq").on(t.code),
    index("games_expires_idx").on(t.expiresAt),
    check("games_code_format", sql`${t.code} ~ '^[A-Z0-9]{6}$'`),
    check("games_version_nonneg", sql`${t.version} >= 0`),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    tokenHash: text("token_hash").notNull(),
    readyAt: ts("ready_at"),
    active: boolean("active").notNull().default(true),
    isBot: boolean("is_bot").notNull().default(false),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("players_game_name_uq").on(t.gameId, t.normalizedName),
    uniqueIndex("players_token_uq").on(t.tokenHash),
    index("players_game_idx").on(t.gameId),
    check("players_name_len", sql`char_length(${t.displayName}) between 1 and 24`),
  ],
);

export const prompts = pgTable(
  "prompts",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    questionTemplate: text("question_template").notNull(),
    category: text("category").notNull(),
    common: boolean("common").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    fallbackOptions: jsonb("fallback_options").$type<string[]>().notNull(),
    options: jsonb("options").$type<{ id: string; text: string; humorous: boolean }[]>().notNull().default(sql`'[]'::jsonb`),
    active: boolean("active").notNull().default(true),
    seasonal: text("seasonal"),
  },
  (t) => [check("prompts_template_has_name", sql`${t.questionTemplate} like '%{name}%'`)],
);

export const playerPrompts = pgTable(
  "player_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id),
    slot: integer("slot").notNull(),
    answerText: text("answer_text"),
    /** Set when the player picked one of the curated options (null for typed answers). */
    answerOptionId: text("answer_option_id"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("player_prompts_slot_uq").on(t.playerId, t.slot),
    uniqueIndex("player_prompts_prompt_uq").on(t.playerId, t.promptId),
    index("player_prompts_game_idx").on(t.gameId),
    check("player_prompts_slot_range", sql`${t.slot} between 1 and 8`),
    check(
      "player_prompts_answer_len",
      sql`${t.answerText} is null or char_length(${t.answerText}) <= 120`,
    ),
  ],
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    subjectPlayerId: uuid("subject_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sourcePlayerPromptId: uuid("source_player_prompt_id")
      .notNull()
      .references(() => playerPrompts.id, { onDelete: "cascade" }),
    type: roundType("type").notNull(),
    questionText: text("question_text").notNull(),
    promptText: text("prompt_text").notNull(),
    answerText: text("answer_text").notNull(),
    options: jsonb("options").$type<OptionDTO[]>().notNull(),
    correctOptionId: text("correct_option_id").notNull(),
    excludedPlayerIds: uuid("excluded_player_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: roundStatus("status").notNull().default("PENDING"),
    durationMs: integer("duration_ms").notNull(),
    openedAt: ts("opened_at"),
    deadlineAt: ts("deadline_at"),
    pausedAt: ts("paused_at"),
    remainingMs: integer("remaining_ms"),
    revealedAt: ts("revealed_at"),
  },
  (t) => [
    uniqueIndex("rounds_game_ordinal_uq").on(t.gameId, t.ordinal),
    index("rounds_game_idx").on(t.gameId),
    check("rounds_options_count", sql`jsonb_array_length(${t.options}) = 4`),
    check("rounds_duration_pos", sql`${t.durationMs} > 0`),
  ],
);

export const guesses = pgTable(
  "guesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    elapsedMs: integer("elapsed_ms").notNull(),
  },
  (t) => [
    uniqueIndex("guesses_round_player_uq").on(t.roundId, t.playerId),
    index("guesses_round_idx").on(t.roundId),
    check("guesses_elapsed_nonneg", sql`${t.elapsedMs} >= 0`),
  ],
);

export const scoreEvents = pgTable(
  "score_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("score_events_round_player_uq").on(t.roundId, t.playerId),
    index("score_events_round_idx").on(t.roundId),
    index("score_events_player_idx").on(t.playerId),
    check("score_events_points_range", sql`${t.points} between 0 and 1500`),
  ],
);

export const hostSessions = pgTable(
  "host_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("host_sessions_token_uq").on(t.tokenHash)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: ts("window_start").notNull().defaultNow(),
    count: integer("count").notNull().default(0),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
);

export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type PlayerPrompt = typeof playerPrompts.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
