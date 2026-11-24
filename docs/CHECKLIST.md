# Implementation checklist

Status of the MVP against `CLAUDE.md`. ✅ done · ⚙️ optional/partial · ⬜ not done

## 1. Foundation
- ✅ Next.js App Router + TypeScript + Tailwind + ESLint, npm lockfile
- ✅ Zod-validated server env (`src/lib/env.ts`), `.env.example`, no hardcoded secrets
- ✅ Drizzle schema with UUID PKs, timestamptz, FKs + cascade, enums, checks, unique indexes (`src/db/schema.ts`), migration `drizzle/0000_init.sql`
- ✅ Prompt bank seed: 4 common + 46 random prompts, stable IDs, question templates, 6–8 curated distractors each
- ✅ Host auth: env password, constant-time compare, rate-limited login, hashed session tokens
- ✅ Game creation with unique 6-char codes, 7-day expiry enforced on reads/writes
- ✅ Join with case-insensitive unique names, per-game player cookie, idempotent reconnect, friendly invalid/full/closed errors

## 2. Questionnaire & lobby
- ✅ 4 common + 4 random prompts per player; swap from unused bank; max 120 chars; progress 1/8, back/edit, review
- ✅ Ready requires 8 valid answers; edits clear ready if an answer is blanked
- ✅ Lobby roster with ready/pending counts, remove before roster lock, settings, preview question count
- ✅ Start requires ≥3 ready players; unready players excluded only after host confirmation; roster + answers locked

## 3. Engine
- ✅ Deterministic generator (seeded PRNG), round-robin balance within one, no consecutive subjects, no repeats, achievable count reported
- ✅ Type A ("What is X's …?") with distractors from other answers → curated fallbacks → optional AI; near-duplicate filter
- ✅ Type B ("Who submitted this answer?") only for unique answers with ≥4 players
- ✅ State machine LOBBY → PREPARING → QUESTION ⇄ REVEAL → FINISHED; pause via paused_at/remaining_ms; skip with reserve replacement; end
- ✅ Transactions with row locks + expectedVersion; idempotent no-ops; explicit 409 conflicts
- ✅ Guesses: current round, eligible, before DB-clock deadline, not paused, first wins
- ✅ Reveal scores exactly once (unique score events, zero events for misses); subject excluded
- ✅ Auto reveal / auto next evaluated on polls, one transition per request, never multiple unseen rounds

## 4. Screens
- ✅ Host dashboard (login, create, recent games, delete, cleanup) and host console (all controls, destructive confirms)
- ✅ Phone: join, questionnaire, ready wait, 4 large tiles, confirm/lock, locked indicator, sitting-out, reveal + personal score, final rank
- ✅ TV: QR lobby, big question, 2×2 tiles with letters + shapes (not colour alone), countdown ring, answered count, reveal with named guesses, paged standings, podium + confetti, fullscreen, opt-in sound, reduced motion
- ✅ Classic game-show theme and Thanksgiving theme
- ✅ Polling hook: no overlap, slower in background, refresh on focus, server clock offset

## 5. Optional
- ⚙️ OpenRouter distractors: implemented server-side, opt-in, bounded batches with timeout + fallback. **Not tested against the live OpenRouter API** (no key in this environment).
- ✅ Demo bot players for solo testing
- ✅ Retention: host delete, host cleanup button, optional authenticated cron endpoint (no schedule deployed)

## 6. Verification
- ✅ Unit tests: generator, scoring, ranks, pause math, text normalization, prompt bank, settings
- ✅ Integration tests (real Postgres): auth scoping, invalid code, duplicate names, reconnect, expiration, roster lock, late guess, double submit, simultaneous reveal, score idempotency, skip, pause, auto mode, game isolation, no answer leakage, 25 concurrent guesses
- ✅ Playwright: host + TV + 3 isolated phones full game (refresh recovery, duplicate name, pause/resume, lock, reveal, finish, score check); demo-bot game with auto mode + Thanksgiving theme
- ✅ Load smoke script (25 players)
- ⬜ Real-device test on physical phones/TV (see README checklist)
- ⬜ Deployment to Vercel/Neon (requires owner's accounts)
