# Family Face-Off

A party quiz about the people in the room, for 3–50 players (best with 5–25). Everyone scans a QR code on their phone, answers eight quick questions about themselves, then plays a synchronized multiple-choice quiz about each other. The TV shows the questions, countdown, reveals and leaderboard. The host runs everything from a separate screen.

No player accounts, emails or app installs. AI is optional and off by default.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Neon PostgreSQL · Drizzle ORM · Zod · Vitest · Playwright
- **Hosting:** Vercel (Node.js runtime) + Neon
- **Spec:** [`CLAUDE.md`](./CLAUDE.md) · **Implementation checklist:** [`docs/CHECKLIST.md`](./docs/CHECKLIST.md)

---

## How a game works

| Screen | URL | Who uses it |
|---|---|---|
| Landing | `/` | Anyone: type a game code or go to hosting |
| Host dashboard | `/host` | You: sign in, create games, delete old games |
| Host console | `/host/ABC123` | You: lobby, start, reveal, next, pause, skip, end |
| TV display | `/display/ABC123?key=…` | The living-room TV (open it from the host console) |
| Join | `/join/ABC123` | Players (the QR code goes here) |
| Play | `/play/ABC123` | Players' phones during the game |

1. On `/host`, pick (or add) a family, create a game, then click **Open TV display** and put that tab on the TV (HDMI or screen mirroring). Keep the host console on your phone or laptop.
2. Players scan the QR code, enter a name, pick one of 40 game pieces (or tap **📷 Use my own photo**) and answer 8 private questions by tapping one of six choices (or "Something else…" to type their own). They can swap any question they'd rather not answer.
3. When at least 3 players are ready, press **Start game…** and choose how many questions about each person (the app shows the most possible without ever repeating a question). This locks the roster and answers and builds the questions.
4. Press **Start first question**. Players lock in A–D on their phones; the TV shows everyone's piece lighting up as they lock in (with a pop sound), and playfully teases whoever is slow ("Hurry up, Ben!"). Whoever the question is about sits that one out.
5. **Reveal answer** shows the correct answer, how everyone answered (who picked what, and how fast), the round winner (fastest right answer) and the round loser (there's always one: the slowest wrong answer or no answer, or the slowest right answer if everyone got it). Next comes a **full-screen leaderboard** that alternates every 5 seconds between the overall standings and a **"This round"** view (everyone's pick, ✓/✗, time and points), then the next question.

   **Running out of time:** answers are still accepted after the timer hits zero, until the reveal. The TV flashes a 🚨 **SHAME ALERT** (with a siren if sound is on) naming whoever is still holding things up, and the phone tells them everyone can see they're late. Late right answers still score 1,000 (no speed bonus). With auto reveal on, the game waits a few extra seconds for stragglers (+2s, +5s, +10s or +15s; set per game, default +5s). About 1 in 4 demo bots dawdles past the timer on purpose so you can see it.

   **Start from the TV:** the TV lobby also has a **Start game ➜** button that asks how many questions per person right on the TV.

   **No early reveals:** the TV's Reveal arrow (and the → key) only appears once everyone has locked in. The host console can still reveal early, after a warning.

   **The arrow:** if the TV tab is opened from the host console in the same browser (so it's signed in as host), a big ➜ button appears at the bottom of the TV to move to the next step. The right-arrow key, space bar or a presentation clicker work too. On any other screen, the TV stays view-only.

   **Ending early:** "End game early…" sits apart from the other buttons and asks you to type END to confirm.
6. The finale shows award cards (Knows the family best, Biggest mystery, Open book, Fastest finger, Slowpoke), then the podium and confetti.

**Photos:** a player can use their own photo instead of a game piece and pick one of 20 costumes (superhero, astronaut, chef, wizard, king, rock star…); their face appears in the costume everywhere in the game, on the join screen or later from the "You're ready!" screen. The phone shrinks it to a small square (location data is stripped) before uploading. Photos are stored with the game and deleted when the game is deleted (7 days, or sooner from the dashboard). The host can remove anyone's photo from the lobby.

**Families:** every game belongs to a family (existing games belong to "Land"). Add families on the host dashboard; the TV shows "The Land Family". All families share your one host password.

**Music & sound:** on the TV, click **Enable sound**. Background music plays while people choose (Game show, Suspense or Lounge; set per game or switch on the TV). All music is generated in the browser.

**Scoring:** 1,000 points per correct answer. Optional speed bonus (0–500, off by default). Wrong or missed answers score 0. Ties share a rank.

**Automation (optional per game):** auto-reveal when everyone has answered or time runs out, and auto-advance 8 seconds after each reveal.

### Testing without your whole family

In the host lobby, press **+ Add 4 demo players** (up to 12). This adds clearly-labelled fictional bot players with pre-filled answers. During questions the bots answer on their own, so one person with a phone (or just the TV and host screen) can play a full game. Demo tools are on automatically in development; set `ENABLE_DEMO_TOOLS=true` to show them in production.

---

## Local development

Requirements: Node.js 20.9+ (22 recommended) and a Postgres database, either a free Neon project (below) or local Postgres 14+.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run db:migrate              # creates tables
npm run db:seed                 # loads the 100-question bank from src/data/questions.json (safe to re-run)
npm run dev                     # http://localhost:3000
```

Fill in `.env.local`:

```bash
DATABASE_URL=postgres://...                 # Neon pooled URL, or local Postgres
HOST_PASSWORD=$(openssl rand -base64 18)    # paste the generated value
SESSION_SECRET=$(openssl rand -hex 32)      # paste the generated value
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Playing on real phones from your computer

Phones can't open `localhost`. Find your computer's network address (macOS: `ipconfig getifaddr en0`; Windows: `ipconfig`) and set:

```bash
NEXT_PUBLIC_APP_URL=http://192.168.1.20:3000
```

Then run `npm run dev -- -H 0.0.0.0` and make sure the phones are on the same Wi-Fi. The QR code will point at that address.

### Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js development, production build, production server |
| `lint` / `typecheck` | ESLint, TypeScript |
| `test` | Unit + integration tests (Vitest). Integration tests need a **separate** test database: `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/faceoff_test`). They refuse to run against a URL without "test" in it. |
| `test:e2e` | Playwright: host + TV + 3 isolated phone browsers play a full game, plus a demo-bot game with auto mode. Builds and starts the app automatically, or set `E2E_BASE_URL` to test a running server. Run `npx playwright install chromium` once. |
| `test:load` | 25 simulated players join, poll and guess at once against `BASE_URL`; prints latency and errors |
| `db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `db:migrate` | Apply migrations (uses `DIRECT_DATABASE_URL` if set, else `DATABASE_URL`) |
| `db:seed` | Upsert the prompt bank |

---

## Deploying to Vercel + Neon

Nothing here is automatic. Each step is something you do in your own accounts, and you never need to share passwords with anyone.

### 1. Create the Neon database

1. Sign in at [console.neon.tech](https://console.neon.tech) and create a project (pick a region close to your Vercel region, e.g. AWS US East for Vercel `iad1`).
2. On the project dashboard, click **Connect**. Copy two connection strings:
   - **Pooled** (toggle "Connection pooling" on; the host contains `-pooler`) → this is `DATABASE_URL`.
   - **Direct** (pooling off) → this is `DIRECT_DATABASE_URL` (used only for migrations).
3. Check your Neon plan's compute and connection limits in the Neon console; don't assume free-tier capacity for a big party.

### 2. Create the tables and load the questions

**Easiest (browser only):** in the Neon console, open **SQL Editor**, paste the entire contents of [`neon-setup.sql`](./neon-setup.sql) and click **Run**. The last line should show `questions_ready = 100`. It is safe to run again. (Regenerate it after schema changes with `npx tsx scripts/build-setup-sql.ts`.)

**Or from a terminal on your computer:**

```bash
DATABASE_URL="<pooled url>" DIRECT_DATABASE_URL="<direct url>" npm run db:migrate
DATABASE_URL="<pooled url>" DIRECT_DATABASE_URL="<direct url>" npm run db:seed
```

Migrations are an explicit release step. The app never migrates on a request. Re-run `db:migrate` whenever a new migration is added.

> **Preview deployments:** use a separate Neon *branch* (Neon console → Branches → Create) for Vercel Preview environments, so testing never touches your real game data. Migrate and seed that branch too.

### 3. Push to GitHub

```bash
git remote add origin https://github.com/<you>/family-face-off.git
git push -u origin main
```

### 4. Import into Vercel

1. At [vercel.com/new](https://vercel.com/new), import the GitHub repository. The framework is detected as Next.js; keep the default build settings.
2. Under **Environment Variables**, add these for **Production** (and Preview, with the preview branch URL):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL |
   | `HOST_PASSWORD` | a strong password (`openssl rand -base64 18`) |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://family-face-off.vercel.app` (no trailing slash) |
   | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | optional |
   | `ENABLE_DEMO_TOOLS` | optional, `true` to allow demo bots in production |

   Never prefix secrets with `NEXT_PUBLIC_`.
3. Deploy. After the first deploy, if your final domain differs from what you entered, update `NEXT_PUBLIC_APP_URL` and redeploy (it is baked into the client bundle for QR codes).
4. Open `https://<your-domain>/api/health`. It should return `{"ok":true,"database":true}`.

### 5. Optional: scheduled cleanup

Games are kept for 7 days. Expired data is deleted when you press **Delete expired data** on the host dashboard, and any game can be deleted immediately. Nothing is deleted automatically unless you add a schedule. To add one, set `CRON_SECRET` in Vercel and add a `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 9 * * *" }] }
```

Vercel sends `CRON_SECRET` as a Bearer token; check Vercel's current Cron Jobs docs and plan limits before relying on it.

### 6. Optional: AI wrong-answer helper (OpenRouter)

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (a model that supports JSON `response_format`). A toggle then appears in game settings (off by default). When the host turns it on, only question text and answer text (never names) are sent to OpenRouter to suggest extra *wrong* choices for unusual answers. Correct answers always come from your family, and if the AI is slow or fails, the game silently falls back to the built-in choices.

---

## Editing the questions

All questions live in [`src/data/questions.json`](./src/data/questions.json): each has a personal question, the TV wording (`{playerName}` is replaced with the player's name), six options (`is_humorous` marks the funny ones), `active`, and an optional `seasonal` tag. The four everyone answers are set in `COMMON_PROMPT_IDS` in `src/lib/promptBank.ts`. Seasonal questions are only handed out when the game's theme matches (Thanksgiving questions in Thanksgiving games; there's no Christmas theme yet, so Christmas questions stay unused).

After editing: run `npx tsx scripts/build-setup-sql.ts` and paste the new `neon-setup.sql` into the Neon SQL Editor (or run `npm run db:seed`). The unit tests check that every option can be quizzed with three distinct wrong choices.

## Real-device checklist (before the party)

- [ ] `/api/health` returns `ok: true` on the deployed URL
- [ ] TV display opens from **Open TV display**, goes fullscreen, and is readable from the couch
- [ ] QR code on the TV opens the join page on an iPhone **and** an Android phone (camera app, no install)
- [ ] Two phones can't take the same name ("Rosie" vs "rosie")
- [ ] A player who refreshes or closes and reopens the browser returns to the same spot
- [ ] Answer all 8 questions on one phone (tap a choice, and try "Something else…"); try "swap question"
- [ ] Start with ≥3 ready players; confirm the warning appears if someone isn't ready
- [ ] Countdown on phones and TV match within about a second
- [ ] Lock in an answer; the phone shows "Locked in" and other choices are disabled
- [ ] The person a question is about sees "This one's about you!"
- [ ] Pause/resume freezes and resumes the timer on all screens
- [ ] Reveal shows the right answer, who guessed what, and updated scores
- [ ] Final screen shows the podium; ties share a place
- [ ] **Enable sound** on the TV works after clicking (browsers block sound until then)
- [ ] Delete the test game from the host dashboard

## Security & privacy notes

- Host login: constant-time password check, rate limited, HttpOnly SameSite=Lax cookies (Secure over HTTPS). Session tokens are 32 random bytes; only HMAC hashes are stored.
- Player cookies are per game (`ffo_p_<CODE>`), so one phone can be in several games. The game code is a join identifier, not authorization.
- The TV link carries an unguessable per-game display key; it can only *view*.
- Correct answers, other players' guesses and scores are never sent to phones before the reveal. API responses are role-specific DTOs, never raw database rows.
- Mutations check the request Origin, inputs are validated with Zod, bodies are size-limited, and join/login/guess are rate limited (stored in Postgres, so it works across serverless instances).
- Names and answers are rendered as text (React escaping), never as HTML, and are not logged. There are no analytics.
- Private pages and all API responses send `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

## Architecture notes

- **No in-memory state, sockets or timers.** Clients poll `/api/games/:code/state` (about 1.5 s during play, 3.5 s in the lobby, 10 s when the tab is hidden, immediately on focus) and never overlap requests. A typical player response is about 1 KB.
- **Database clock is authoritative.** Deadlines are computed from Postgres `now()`; clients render a smooth countdown using the measured server-clock offset.
- **Transactions:** every transition locks the game row (`SELECT … FOR UPDATE`) and uses optimistic `expectedVersion`. Guesses take a `FOR SHARE` lock so they run concurrently but can't race a reveal. Reveal inserts score events with unique keys, so scoring happens exactly once. On Neon the app uses the WebSocket `Pool` driver (`drizzle-orm/neon-serverless`), created per request and closed after the response, because the HTTP driver doesn't support interactive transactions.
- **Automatic transitions** (auto reveal / auto next / demo bots) are evaluated on polls and only when due, at most one per request. If nobody is polling, they happen on the next request.
- **Quiz generation** (`src/lib/generator.ts`) is deterministic and pure: round-robin across players keeps everyone's subject count within one, avoids back-to-back subjects, never repeats a question, and never invents an answer. If there aren't enough credible wrong choices, it uses "Who submitted this answer?" (4+ players) or skips the answer.

## Known limitations

- Single host account (one password). Multi-host tenancy is not implemented.
- Polling, not push: the TV and phones update within about 1.5 s. Load scales with players × poll rate; the 25-player smoke test is a local measurement, not a guarantee for your Neon/Vercel plan.
- Removing a player is only possible before the game starts (by design: the roster locks at start).
- The inappropriate-word filter is intentionally small; the host can remove players in the lobby.
