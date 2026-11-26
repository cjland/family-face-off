# Family Face-Off

**The party quiz about the people in the room.** Everyone answers eight quick questions about themselves on their phone, then the whole family plays a game-show quiz about each other on the TV: *"How did Grandma June answer: Which dessert would you choose?"*

<p align="center"><img src="docs/images/hero.webp" alt="The TV showing a question with four colored answers, and two phones answering it" width="900"></p>

- **For 3 to 50 players** (best with 5–25), ages "can read" and up.
- **Nothing to install.** Players scan a QR code on the TV. No accounts, no emails, no app.
- **You need:** a TV or big screen (a laptop plugged into the TV works), everyone's phones, and a second screen for the host (your phone or laptop).
- **150 built-in questions**, each with six tap-to-answer choices (four normal, two silly), or players type their own answer.
- **Fun extras:** 40 game pieces or your own face on a costume, your own win/lose catchphrases, a 5-4-3-2-1 countdown, lock-in order, taunts and a 🚨 SHAME ALERT for slowpokes, ten rotating leaderboard pages, awards, a podium and confetti. There's a classic game-show look and a Thanksgiving theme.

**Contents:** [How a game works](#how-a-game-works) · [Running game night](#running-game-night) · [Settings](#game-settings) · [Troubleshooting](#troubleshooting) · [Setting it up (Neon + Vercel)](#setting-it-up-on-neon--vercel) · [Local development](#local-development) · [For developers](#for-developers)

---

## How a game works

### 1. The host creates a game

Sign in at `/host` with your host password, pick your family, and press **Create game**. Then press **Open TV display** and put that tab on the TV. Keep the host screen on your own phone or laptop.

<table>
<tr>
<td width="50%"><img src="docs/images/host-dashboard.webp" alt="Host dashboard with the new game form"></td>
<td width="50%"><img src="docs/images/host-lobby.webp" alt="Host lobby with the QR code and the list of players"></td>
</tr>
<tr>
<td><b>Host dashboard:</b> family, title, theme, timer, music and automation, plus your recent games.</td>
<td><b>Host lobby:</b> the join QR code, who's ready, and buttons to remove players or add demo players.</td>
</tr>
</table>

### 2. Everyone joins on their phone

The TV shows **Scan to join** with a QR code and a six-letter game code. Each player picks a name and a game piece (or **📷 Use my own photo**), then answers eight questions about themselves. Four questions are the same for everyone and four are random. Any question can be swapped for a different one, no questions asked.

<p align="center"><img src="docs/images/tv-lobby.webp" alt="TV lobby with the QR code and ten players marked ready" width="820"></p>

<table>
<tr>
<td><img src="docs/images/phone-join.webp" alt="Phone: name and game piece picker"></td>
<td><img src="docs/images/phone-questionnaire.webp" alt="Phone: a question with six answer choices"></td>
<td><img src="docs/images/phone-review.webp" alt="Phone: review answers with I'm ready at the top"></td>
<td><img src="docs/images/phone-ready.webp" alt="Phone: You're ready"></td>
</tr>
<tr>
<td>Name and game piece</td>
<td>Tap an answer, or "Something else…"</td>
<td>Check your answers, then <b>I'm ready!</b></td>
<td>Waiting for the host</td>
</tr>
</table>

**New to the game?** Press **📖 How to play** on the TV lobby. It plays a full-screen, 15-step walkthrough on a loop (scan the code, type your name, pick a piece, answer the questions, what happens during the game) while the QR code, game code and everyone joining stay on screen. Arrow keys flip through the steps; **✕ Close** goes back to the normal lobby. Skip it once everyone knows the game.

<p align="center"><img src="docs/images/tv-howto.webp" alt="TV: How to play walkthrough, step 10 of 15, with the QR code still on screen" width="820"></p>

Answers stay secret until they come up in the game. Players who close their browser can scan the QR code again (it's also in the corner of the TV during the game) and they'll pop right back in on the same phone.

### 3. Start the game

When at least 3 people are ready, press **Start game…** (on the host screen or on the TV) and choose how many questions about each person. The app shows the most it can do without ever repeating a question.

<p align="center"><img src="docs/images/host-start.webp" alt="Host: how many questions about each person" width="620"></p>

### 4. Play: countdown, question, lock in

Every question starts with a full-screen **5 · 4 · 3 · 2 · 1** on the TV and phones (the 5 holds for a moment so slower screens catch it), then the 20-second timer starts. The person the question is about sits that one out.

<table>
<tr>
<td width="50%"><img src="docs/images/tv-countdown.webp" alt="TV: big countdown number"></td>
<td width="50%"><img src="docs/images/tv-question.webp" alt="TV: question, four answers, lock-in order and timer"></td>
</tr>
<tr>
<td>The countdown before each question</td>
<td>The question. Pieces light up and line up <b>1st, 2nd, 3rd…</b> as people lock in.</td>
</tr>
</table>

<table>
<tr>
<td><img src="docs/images/phone-question.webp" alt="Phone: pick an answer"></td>
<td><img src="docs/images/phone-locked.webp" alt="Phone: locked in"></td>
<td width="55%"><img src="docs/images/host-question.webp" alt="Host: question with who has locked in"></td>
</tr>
<tr>
<td>Pick A–D…</td>
<td>…then <b>Lock in</b> (one try only)</td>
<td>The host sees who has locked in, plus Pause, Skip and Reveal</td>
</tr>
</table>

Slowpokes get teased by name on the TV. The last 5 seconds beep louder and higher each second. If time runs out they can still answer, but the TV flashes a 🚨 **SHAME ALERT** and plays a "Hurry up!" voice right away and then every 8 seconds until they answer (late right answers still score 1,000, but can't get the fastest-answer bonus). Sounds play once someone has clicked or pressed a key on the TV page.

An **announcer voice** talks on the TV through the whole game. The music dips while he talks.

| When | He says |
|---|---|
| Lobby, every 25 seconds | "We'll give everyone a few more seconds to join." |
| "Get ready!" before the countdown | "I hope everyone's ready…" ("Let the fun begin!" for question 1, "Here it is… the final question!" for the last). The 5-4-3-2-1 waits until he's done |
| Countdown | "Five! Four! Three! Two! One! Go!", each number said the moment it appears on the TV |
| Question appears | The question itself, then "Pick the best answer!" |
| While people choose | "10 seconds!" and "Everyone's locked in!" |
| Reveal | A drumroll or reveal line |
| Bonus question | "It's time for a bonus question!" and a difficulty line ("This one's a little tougher… and it's worth even more points!") before the countdown, then "Let's see who got it right!" at the reveal |
| Leaderboard | "Let's check out the leaderboard!", then "Who knew them best?" when the This round page comes up |
| End of the game | "Are we ready to crown our winner?" over the awards, "And your Family Face-Off champion is…" as the podium appears, then a game-over line |

The clips are in `public/audio` (listed in `manifest.json`), one per bank question q001 to q150. Questions with no clip (ones typed by the host) get a line like "This one's new to me. Go ahead and read it on the screen."

### 5. Reveal

The TV shows the right answer, who picked what (and how fast), the **round winner** (fastest right answer) and the **round loser** (there's always one).

<table>
<tr>
<td width="60%"><img src="docs/images/tv-reveal.webp" alt="TV: the reveal with how everyone answered"></td>
<td width="18%"><img src="docs/images/phone-reveal.webp" alt="Phone: your result and how everyone answered"></td>
</tr>
</table>

### 6. Leaderboards

After each reveal the TV shows a full-screen leaderboard that rotates through the pages you picked in the game setup, 5 seconds each. The default is **Overall, Leader, This round and Bets**; tick any of the ten below when creating a game (or under **Game settings** in the lobby). A bar on the highlighted tab shows when it will change. Click any tab to jump to it (it stays put for 20 seconds). On **This round**, the **‹ ›** arrows step back through every earlier question: the right answer and who picked what.

<table>
<tr>
<td width="50%"><img src="docs/images/board-overall.webp" alt="Overall leaderboard"><br><b>Overall:</b> the leader gets a big spotlight row</td>
<td width="50%"><img src="docs/images/board-round.webp" alt="This round"><br><b>This round:</b> everyone's pick, time and points</td>
</tr>
<tr>
<td><img src="docs/images/board-reaction.webp" alt="Reaction times"><br><b>Reaction times:</b> quick or slow, right or wrong</td>
<td><img src="docs/images/board-bets.webp" alt="Place your bets"><br><b>Place your bets 🏇:</b> a horse race with (just for fun) odds</td>
</tr>
<tr>
<td><img src="docs/images/board-heating.webp" alt="Who's heating up"><br><b>Who's heating up? 🔥:</b> everyone's last five answers</td>
<td><img src="docs/images/board-stumpers.webp" alt="Stumpers"><br><b>Stumpers:</b> the hardest questions so far, plus special badges</td>
</tr>
<tr>
<td><img src="docs/images/board-mystery.webp" alt="Mystery meter"><br><b>Mystery meter 🕵️:</b> who's hardest (and easiest) to guess</td>
<td><img src="docs/images/board-galaxy.webp" alt="Family galaxy"><br><b>Family galaxy 🌌:</b> speed vs. accuracy for everyone</td>
</tr>
<tr>
<td><img src="docs/images/board-graveyard.webp" alt="Answer graveyard"><br><b>Answer graveyard 🪦:</b> the wrong answers that fooled the most people</td>
<td><img src="docs/images/board-leader.webp" alt="Leader watch"><br><b>Leader watch:</b> the leader's whole game, and everyone's rank over time</td>
</tr>
</table>

Pages only appear once there's something to show. For example, Who's heating up needs two questions.

### 7. Awards and the winner

At the end: award cards (Knows the family best, Biggest mystery, Open book, Fastest finger, Slowpoke), then the podium, full standings and confetti. Each phone shows that player's final place.

<table>
<tr>
<td width="41%"><img src="docs/images/tv-awards.webp" alt="TV: The Awards"></td>
<td width="41%"><img src="docs/images/tv-final.webp" alt="TV: final results podium"></td>
<td width="18%"><img src="docs/images/phone-final.webp" alt="Phone: game over and final place"></td>
</tr>
</table>

---

## Running game night

**Before everyone arrives**

1. Open your site's `/api/health` page. It should say `"ok":true`. (If it says the database is out of date, run the latest `neon-setup.sql`; see [setup](#2-create-the-tables-and-load-the-questions).)
2. On `/host`, create the game and press **Open TV display**. Open that link **in the same browser** you used to sign in, so the TV gets the host's ➜ button. For first-timers, press **📖 How to play** on the TV lobby and leave it running while people join.
3. Put the TV tab fullscreen (**⛶ Fullscreen** at the top right). If the TV says **🔈 Click anywhere for sound**, click once (browsers block sound until someone clicks or presses a key on the page).
4. Try it alone first: **+ Add 4 demo players** fills the room with bots that answer on their own.

**During the game**

| To… | Do this |
|---|---|
| Run the game from the TV | If the TV isn't signed in as host, press **🔑 Host controls** at the bottom right and type the host password. The TV then has Start, Next and Pause, even in fullscreen. |
| Move to the next step | The big ➜ button at the bottom of the TV, or **→**, **Space**, **Enter** or a presentation clicker. The host screen has the same buttons. |
| Wait for everyone | The TV won't reveal until everyone has locked in, so nobody gets skipped by accident. |
| Move on without someone who walked away | Once time is up, a small **⏭** appears next to the SHAME ALERT. Tap it twice to reveal without them. |
| Pause | **⏸ Pause** at the bottom left of the TV (or the **P** key), or **❚❚ Pause** on the host screen. It freezes the timer everywhere. |
| Skip a question | **Skip question** on the host screen (no points awarded). |
| Look at a leaderboard page | Click its tab on the TV. It holds for 20 seconds, then rotation continues. |
| Turn TV sound or animations off | **TV sound** and **TV animations** in the game settings (both on by default; animations play even if the computer is set to reduce motion). |
| End early | **End game early…** on the host screen. You have to type END to confirm. |
| Let someone back in | They scan the QR code in the corner of the TV on the same phone. |

**After the game:** delete it from the host dashboard, or leave it. Games and photos are kept for 7 days.

### Photos and costumes

Instead of a game piece, players can tap **📷 Use my own photo**, then drag and pinch to center their face in the circle. Their face appears on one of 20 cartoon costumes (superhero, astronaut, chef, wizard, king, rock star…) everywhere in the game. The phone shrinks the photo and strips its location data before uploading. Photos are deleted with the game, and the host can remove anyone's photo from the lobby.

### Catchphrases

Every player has a **winning catchphrase** and a **losing catchphrase** ("Never doubt me!", "I demand a recount!"). They're set on the phone's **You're ready!** screen: pick one of 12 ideas each or write your own (up to 40 characters, family-friendly). Anyone who doesn't choose gets one picked for them. They pop up in a speech bubble on the TV under the **round winner** and **round loser**, and the champion's catchphrase appears big on the final podium.

### Families

Every game belongs to a family ("The Land Family" on the TV). Add families on the host dashboard. All families share your one host password.

## Game settings

Set these when creating a game (**Game settings** in the lobby lets you change them until the game starts).

| Setting | Default | What it does |
|---|---|---|
| Theme | Classic game show | Or Thanksgiving: warm colors, falling leaves, Thanksgiving questions |
| Plan the game | 12 people, 3 each | Enter about how many people are coming and pick 3–8 questions about each person. Each choice shows the total questions and roughly how long the game takes (about 30 seconds per question on top of the answer time). You can change it when you press Start |
| Seconds per question | 20 | 5–120 seconds |
| Speed bonus | On | The fastest right answer each round gets a surprise 25–50 extra points |
| 🎁 Bonus trivia questions | On, Auto | Thanksgiving trivia in the middle of the game (see below). **Auto** means one each time through everyone (the same as questions per person), or pick 1–8 |
| Music while people choose | Game show | Or Tick-tock suspense, Lounge jazz, No music (made in the browser, nothing to download) |
| Leaderboard pages | Overall, Leader, This round, Bets | Which of the ten pages the TV rotates through after each reveal |
| TV sound | On | Beeps, pops, "Hurry up!", music and the announcer. The TV needs one click or key press before browsers allow sound |
| Announcer voice | On | Reads the questions aloud and calls out the big moments. Music dips while he talks. Needs TV sound on |
| TV animations | On | Countdowns, races, pop-ins and confetti on the TV |
| Tease slowpokes | On | Named, good-natured taunts on the TV |
| Auto reveal | On, +5s | Reveal as soon as everyone has answered, or a few seconds after time runs out (+2s, +5s, +10s or +15s for latecomers) |
| Auto next question | Off | Move on 8 seconds after each reveal |
| AI wrong-answer helper | Off | Only shown if OpenRouter is set up (see below) |

### 🎁 Bonus questions

Bonus questions are Thanksgiving trivia with one right answer (like "Which city hosts the Macy's Thanksgiving Day Parade?"), mixed into the game:

- They're spread through the middle of the game, never first or last, and go from easy to hard so the big points come late.
- Everyone plays (nobody sits out), and they don't count toward "Question 3 of 24".
- A right answer is worth **1,500** (easy), **2,000** (medium) or **2,500** (hard), plus the speed bonus. A normal question is worth 1,000.
- Answer time is 15, 20 or 25 seconds, by difficulty.
- The game prefers questions your family hasn't had in earlier games.
- There are 20 of them (`b001`–`b020`), in `src/data/bonusQuestions.ts` and the `bonus_questions` table. Each has an announcer clip in `public/audio/questions`.

**Scoring:** 1,000 points per right answer. The fastest right answer each round also gets a surprise bonus of 25 to 50 points (a new random amount each round), so every round has a clear winner. Wrong or missed answers score 0. Late right answers score 1,000 with no bonus. Ties share a place.

## Troubleshooting

| Problem | Fix |
|---|---|
| The QR code opens "localhost" on phones | `NEXT_PUBLIC_APP_URL` must be your real web address (or your computer's network address for home testing, see below). |
| The TV has no ➜ button | Open the TV from **Open TV display** in the same browser where you signed in as host. Other screens are view-only on purpose. |
| No sound on the TV | Click anywhere on the TV page once (browsers block sound until someone does), and check **TV sound** is on in the game settings. |
| Nothing moves on the TV | Check **TV animations** is on in the game settings. |
| A player's photo or catchphrase didn't save | Run the latest `neon-setup.sql` (`/api/health` will say if the database is out of date). |
| "This game has already started" | New players can't join after the start. Someone who was already playing can rejoin on the same phone and browser. |
| A player says their name is taken | Names are unique per game, ignoring capitals ("Rosie" and "rosie" count as the same). |

---

## Setting it up on Neon + Vercel

Nothing here is automatic. Each step is something you do in your own accounts, and you never need to share passwords with anyone.

### 1. Create the Neon database

1. Sign in at [console.neon.tech](https://console.neon.tech) and create a project (pick a region close to your Vercel region, e.g. AWS US East for Vercel `iad1`).
2. On the project dashboard, click **Connect**. Copy two connection strings:
   - **Pooled** (toggle "Connection pooling" on; the host contains `-pooler`) → this is `DATABASE_URL`.
   - **Direct** (pooling off) → this is `DIRECT_DATABASE_URL` (used only for migrations).
3. Check your Neon plan's compute and connection limits in the Neon console; don't assume free-tier capacity for a big party.

### 2. Create the tables and load the questions

**Easiest (browser only):** in the Neon console, open **SQL Editor**, paste the entire contents of [`neon-setup.sql`](./neon-setup.sql) and click **Run**. The last line shows `questions_ready` (147 today: 3 questions about presidents are switched off by default). It is safe to run again, and you should re-run it whenever the app is updated.

**Or from a terminal on your computer:**

```bash
DATABASE_URL="<pooled url>" DIRECT_DATABASE_URL="<direct url>" npm run db:migrate
DATABASE_URL="<pooled url>" DIRECT_DATABASE_URL="<direct url>" npm run db:seed
```

Migrations are an explicit release step. The app never migrates on a request.

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
   | `HOST_PASSWORD` | a strong password, at least 8 characters (`openssl rand -base64 18`) |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://family-face-off.vercel.app` (no trailing slash) |
   | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | optional |
   | `ENABLE_DEMO_TOOLS` | optional, `true` to allow demo bots in production |

   Never prefix secrets with `NEXT_PUBLIC_`.
3. Deploy. If your final domain differs from what you entered, update `NEXT_PUBLIC_APP_URL` and redeploy (it is baked into the QR codes).
4. Open `https://<your-domain>/api/health`. It should return `{"ok":true,"database":true}`. If a setting is wrong it names the variable (never its value).

### 5. Optional: scheduled cleanup

Games are kept for 7 days. Expired data is deleted when you press **Delete expired data** on the host dashboard, and any game can be deleted immediately. Nothing is deleted automatically unless you add a schedule. To add one, set `CRON_SECRET` in Vercel and add a `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 9 * * *" }] }
```

Vercel sends `CRON_SECRET` as a Bearer token; check Vercel's current Cron Jobs docs and plan limits before relying on it.

### 6. Optional: AI wrong-answer helper (OpenRouter)

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (a model that supports JSON `response_format`). A toggle then appears in game settings (off by default). When the host turns it on, only question text and answer text (never names) are sent to OpenRouter to suggest extra *wrong* choices for unusual typed answers. Correct answers always come from your family, and if the AI is slow or fails, the game quietly uses the built-in choices.

---

## Local development

Requirements: Node.js 20.9+ (22 recommended) and a Postgres database, either a free Neon project or local Postgres 14+.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run db:migrate              # creates tables
npm run db:seed                 # loads the question bank from src/data/questions.json (safe to re-run)
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
| `test:e2e` | Playwright: host + TV + 3 phone browsers play a full game, a demo-bot game with auto mode, and a "player walked away" game. Builds and starts the app, or set `E2E_BASE_URL` to test a running server. Run `npx playwright install chromium` once. |
| `test:load` | 25 simulated players join, poll and guess at once against `BASE_URL`; prints latency and errors |
| `db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `db:migrate` | Apply migrations (uses `DIRECT_DATABASE_URL` if set, else `DATABASE_URL`) |
| `db:seed` | Upsert the question bank |

### Editing the questions

All questions live in [`src/data/questions.json`](./src/data/questions.json): each has a personal question, the TV wording (`{playerName}` is replaced with the player's name), six options (`is_humorous` marks the funny ones), `active`, a `category` and an optional `seasonal` tag. The four everyone answers are set in `COMMON_PROMPT_IDS` in `src/lib/promptBank.ts`. Seasonal questions only appear when the game's theme matches (Thanksgiving questions in Thanksgiving games). Questions #101, #102 and #109 (presidents/politics) are included but `active: false`; set them to `true` to use them.

After editing: run `npx tsx scripts/build-setup-sql.ts` and paste the new `neon-setup.sql` into the Neon SQL Editor (or run `npm run db:seed`). The unit tests check that every option can be quizzed with three distinct wrong choices.

### Updating the screenshots in this README

```bash
DOCS_SCREENS=/tmp/docs-raw E2E_BASE_URL=http://localhost:3000 npx playwright test docs-screens
python3 scripts/docs-images.py /tmp/docs-raw docs/images      # needs: pip install pillow
```

The script plays a short game with two pretend players and eight labelled demo bots (everyone in the pictures is fictional) and saves every screen above. It also refreshes the pictures used by the TV's **How to play** walkthrough (`public/howto`).

---

## For developers

### Real-device checklist (before the party)

- [ ] `/api/health` returns `ok: true` on the deployed URL
- [ ] TV display opens from **Open TV display**, goes fullscreen, and is readable from the couch
- [ ] QR code on the TV opens the join page on an iPhone **and** an Android phone (camera app, no install)
- [ ] Two phones can't take the same name ("Rosie" vs "rosie")
- [ ] A player who refreshes or closes and reopens the browser returns to the same spot
- [ ] Answer all 8 questions on one phone (tap a choice, and try "Something else…"); try "swap question"
- [ ] Upload a photo, center it, and pick a costume
- [ ] Start with ≥3 ready players; confirm the warning appears if someone isn't ready
- [ ] The 5-4-3-2-1 countdown and the timer match on phones and TV within about a second
- [ ] The **Lock in** button is visible without scrolling on a small phone
- [ ] The person a question is about sees "This one's about you!"
- [ ] Pause/resume freezes and resumes the timer on all screens
- [ ] Reveal shows the right answer, who guessed what, and updated scores
- [ ] Final screen shows the podium; ties share a place
- [ ] Sound plays on the TV after one click on the page
- [ ] The announcer reads the question as it appears, and the music gets quieter while he talks
- [ ] Delete the test game from the host dashboard

### Security & privacy notes

- Host login: constant-time password check, rate limited, HttpOnly SameSite=Lax cookies (Secure over HTTPS). Session tokens are 32 random bytes; only HMAC hashes are stored.
- Player cookies are per game (`ffo_p_<CODE>`), so one phone can be in several games. The game code is a join identifier, not authorization.
- The TV link carries an unguessable per-game display key; it can only *view*. Host controls on the TV only appear when the browser is signed in as host.
- Correct answers, other players' guesses and scores are never sent to phones before the reveal. API responses are role-specific DTOs, never raw database rows. "Who submitted this answer?" rounds hide the subject on the TV too.
- Mutations check the request Origin, inputs are validated with Zod, bodies are size-limited, and join/login/guess are rate limited (stored in Postgres, so it works across serverless instances).
- Names and answers are rendered as text (React escaping), never as HTML, and are not logged. There are no analytics.
- Private pages and all API responses send `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

### Architecture notes

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Neon PostgreSQL · Drizzle ORM · Zod · Vitest · Playwright. Hosted on Vercel (Node.js runtime) + Neon. Spec: [`CLAUDE.md`](./CLAUDE.md) · checklist: [`docs/CHECKLIST.md`](./docs/CHECKLIST.md).
- **No in-memory state, sockets or timers.** Clients poll `/api/games/:code/state` (about 1.5 s during play, 3.5 s in the lobby, 10 s when the tab is hidden, immediately on focus) and never overlap requests. A typical player response is about 1 KB.
- **Database clock is authoritative.** Deadlines are computed from Postgres `now()`; clients render a smooth countdown using the measured server-clock offset. Each question "opens" after the pre-question countdown; guesses before that are refused.
- **Transactions:** every transition locks the game row (`SELECT … FOR UPDATE`) and uses optimistic `expectedVersion`. Guesses take a `FOR SHARE` lock so they run concurrently but can't race a reveal. Reveal inserts score events with unique keys, so scoring happens exactly once. On Neon the app uses the WebSocket `Pool` driver (`drizzle-orm/neon-serverless`), created per request and closed after the response, because the HTTP driver doesn't support interactive transactions.
- **Automatic transitions** (auto reveal / auto next / demo bots) are evaluated on polls and only when due, at most one per request. If nobody is polling, they happen on the next request.
- **Quiz generation** (`src/lib/generator.ts`) is deterministic and pure: round-robin across players keeps everyone's subject count within one, avoids back-to-back subjects, never repeats a question, and never invents an answer. If there aren't enough credible wrong choices, it uses "Who submitted this answer?" (4+ players) or skips the answer.
- **Leaderboard pages** are computed server-side from revealed rounds only (`src/server/stats.ts`, `src/server/boards.ts`).

### Known limitations

- Single host account (one password). Multi-host tenancy is not implemented.
- Polling, not push: the TV and phones update within about 1.5 s. Load scales with players × poll rate; the 25-player smoke test is a local measurement, not a guarantee for your Neon/Vercel plan.
- Removing a player is only possible before the game starts (by design: the roster locks at start).
- A player who loses their phone's cookie (different phone, private browsing, cleared data) can't rejoin a game that has started.
- The inappropriate-word filter is intentionally small; the host can remove players in the lobby.
