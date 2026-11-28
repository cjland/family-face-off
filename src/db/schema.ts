import { sql } from "drizzle-orm";
import {
  customType,
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
  "LEADERBOARD",
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

export const families = pgTable(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("families_name_uq").on(t.normalizedName),
    check("families_name_len", sql`char_length(${t.name}) between 1 and 40`),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    phase: gamePhase("phase").notNull().default("LOBBY"),
    settings: jsonb("settings").notNull(),
    currentRoundId: uuid("current_round_id"),
    version: integer("version").notNull().default(0),
    rosterLockedAt: ts("roster_locked_at"),
    prepareError: text("prepare_error"),
    /** When the current phase began (autoplay timing), and when the host paused it (reveal/leaderboard). */
    phaseStartedAt: ts("phase_started_at"),
    pausedAt: ts("paused_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("games_code_uq").on(t.code),
    index("games_expires_idx").on(t.expiresAt),
    index("games_family_idx").on(t.familyId),
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
    /** Stepped away (paused themselves, or stopped answering): skipped until they're back. */
    awayAt: ts("away_at"),
    awayReason: text("away_reason"),
    isBot: boolean("is_bot").notNull().default(false),
    /** Game piece id (see src/lib/pieces.ts). */
    piece: text("piece"),
    /** Catchphrases for winning / losing a round (null = one is picked for them). */
    winSlogan: text("win_slogan"),
    loseSlogan: text("lose_slogan"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("players_game_name_uq").on(t.gameId, t.normalizedName),
    uniqueIndex("players_token_uq").on(t.tokenHash),
    index("players_game_idx").on(t.gameId),
    check("players_name_len", sql`char_length(${t.displayName}) between 1 and 24`),
    check("players_slogan_len", sql`char_length(coalesce(${t.winSlogan}, '')) <= 60 and char_length(coalesce(${t.loseSlogan}, '')) <= 60`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * A player's own photo (optional, instead of a game piece). Small, re-encoded on the phone,
 * and deleted with the player, which is deleted with the game.
 */
export const playerPhotos = pgTable(
  "player_photos",
  {
    playerId: uuid("player_id")
      .primaryKey()
      .references(() => players.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    previousPiece: text("previous_piece"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("player_photos_size", sql`octet_length(${t.data}) <= 200000`)],
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

/**
 * Questions the host uploaded with the template (Custom mode). Grouped by group name, with a
 * genre and difficulty; audio_id names the announcer clip (questions/<audio_id>.mp3) if recorded.
 */
export const customQuestions = pgTable(
  "custom_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupName: text("group_name").notNull(),
    genre: text("genre").notNull().default(""),
    difficulty: text("difficulty").notNull().default("medium"),
    question: text("question").notNull(),
    options: jsonb("options").$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    seconds: integer("seconds"),
    audioId: text("audio_id").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("custom_questions_group_idx").on(t.groupName),
    check("custom_difficulty", sql`${t.difficulty} in ('easy', 'medium', 'hard')`),
    check("custom_options_count", sql`jsonb_array_length(${t.options}) = 4`),
    check("custom_correct_index", sql`${t.correctIndex} between 0 and 3`),
    check("custom_seconds", sql`${t.seconds} is null or ${t.seconds} between 5 and 120`),
    check("custom_lengths", sql`char_length(${t.question}) <= 300 and char_length(${t.groupName}) <= 60 and char_length(${t.genre}) <= 60`),
  ],
);

/** Bonus trivia (one right answer, extra points), mixed into the middle of a game. */
export const bonusQuestions = pgTable(
  "bonus_questions",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    options: jsonb("options").$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    difficulty: text("difficulty").notNull(),
    points: integer("points").notNull(),
    timeSeconds: integer("time_seconds").notNull(),
    category: text("category").notNull(),
    active: boolean("active").notNull().default(true),
    seasonal: text("seasonal"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("bonus_difficulty", sql`${t.difficulty} in ('easy', 'medium', 'hard')`),
    check("bonus_options_count", sql`jsonb_array_length(${t.options}) between 4 and 12`),
    check("bonus_correct_index", sql`${t.correctIndex} >= 0 and ${t.correctIndex} < jsonb_array_length(${t.options})`),
    check("bonus_points_pos", sql`${t.points} > 0 and ${t.timeSeconds} > 0`),
  ],
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
    // Null for bonus rounds (trivia, not about anyone).
    subjectPlayerId: uuid("subject_player_id").references(() => players.id, { onDelete: "cascade" }),
    sourcePlayerPromptId: uuid("source_player_prompt_id").references(() => playerPrompts.id, { onDelete: "cascade" }),
    /** Set for bonus rounds: which bonus question, and what a right answer is worth. */
    bonusQuestionId: text("bonus_question_id").references(() => bonusQuestions.id),
    /** personal (about a player), bonus (trivia mid-game, paid by place), trivia (Quiz/Custom mode), speed (short timer, paid by place). */
    kind: text("kind").notNull().default("personal"),
    customQuestionId: uuid("custom_question_id").references(() => customQuestions.id, { onDelete: "set null" }),
    bonusPoints: integer("bonus_points"),
    bonusDifficulty: text("bonus_difficulty"),
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
    check("rounds_kind", sql`${t.kind} in ('personal', 'bonus', 'trivia', 'speed')`),
    // Personal questions are about someone; bonus questions pay by place.
    check("rounds_personal_source", sql`${t.kind} <> 'personal' or (${t.subjectPlayerId} is not null and ${t.sourcePlayerPromptId} is not null)`),
    check("rounds_bonus_points", sql`${t.kind} <> 'bonus' or ${t.bonusPoints} > 0`),
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
    check("score_events_points_range", sql`${t.points} between 0 and 3000`),
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

export type Family = typeof families.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type PlayerPrompt = typeof playerPrompts.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;

/**
 * Character packs made on the host's Characters page: named sets of mashup characters (a game
 * piece's head on a costume body). Each entry's piece is a self-contained "mash:..." string.
 */
export const characterPacks = pgTable(
  "character_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    characters: jsonb("characters").$type<{ name: string; piece: string }[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("character_packs_name_len", sql`char_length(${t.name}) between 1 and 40`),
    check("character_packs_size", sql`jsonb_array_length(${t.characters}) <= 40`),
  ],
);
