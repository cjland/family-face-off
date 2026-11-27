import { expect, test, type Browser, type Page } from "@playwright/test";

/** Each question starts with a full-screen 5-4-3-2-1; wait until answers are open. */
async function countdownDone(page: Page) {
  await expect(page.getByRole("status", { name: /starts in|get ready/ })).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Full game: host + three isolated phone browsers (separate cookie jars) + TV display.
 * All names and answers are fictional sample data.
 */
const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function hostLogin(page: Page) {
  await page.goto("/host");
  await page.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
}

const ANSWERS = [
  ["Lasagna", "Tiramisu", "Iceland", "Flying", "Otters", "Autumn", "Pancakes", "Chess"],
  ["Tacos", "Key lime pie", "Peru", "Invisibility", "Owls", "Spring", "Waffles", "Scrabble"],
  ["Ramen", "Churros", "Kenya", "Teleporting", "Red pandas", "Winter", "Bagels", "Uno"],
];

async function joinAndAnswer(browser: Browser, code: string, name: string, answers: string[], seed: number, piece: string) {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("What should we call you?").fill(name);
  if (piece === "photo") {
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/sample-photo.jpg");
    // Center-your-face step: drag a little, zoom in, then use it.
    const view = page.getByLabel(/Photo position/);
    await expect(view).toBeVisible();
    await shot(page, "phone-photo-crop");
    const box = (await view.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("slider", { name: "Zoom" }).fill("1.6");
    await page.getByRole("button", { name: "Use photo" }).click();
    await expect(page.getByRole("radiogroup", { name: "Choose an outfit" })).toBeVisible();
    await page.getByRole("radio", { name: "Royalty" }).click();
    await shot(page, "phone-outfit");
  } else {
    await page.getByRole("radio", { name: piece, exact: true }).click();
  }
  if (seed === 0) await shot(page, "phone-join-pieces");
  await page.getByRole("button", { name: "Let's play!" }).click();
  await page.waitForURL(`**/play/${code}`);
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`Question ${i + 1} of 8`)).toBeVisible();
    if (i === 5) {
      // One typed answer via "Something else…".
      await page.getByRole("button", { name: /Something else/ }).click();
      await page.locator("#answer").fill(answers[i]);
      await page.getByRole("button", { name: "Save" }).click();
    } else {
      if (seed === 0 && i === 0) await shot(page, "phone-question-options");
      await page.locator('[role="group"] button').nth((seed + i) % 6).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Looking good!" })).toBeVisible();
  return page;
}

async function hostAction(host: Page, label: string | RegExp) {
  await host.getByRole("button", { name: label }).click();
}

test("host, TV and three phones play a full game", async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await hostCtx.newPage();
  await hostLogin(host);
  // This test drives each reveal by hand, so turn the default auto reveal off.
  await host.getByText("Auto reveal").click();
  // It counts exactly three numbered questions, so no bonus trivia here (covered by integration tests).
  await host.getByText("🎁 Bonus trivia questions").click();
  await host.getByRole("button", { name: "Create game" }).first().click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;

  // TV display via the host's display link.
  const tvHref = await host.getByRole("link", { name: /Open TV display/ }).getAttribute("href");
  const tvCtx = await browser.newContext({ viewport: TV });
  const tv = await tvCtx.newPage();
  await tv.goto(tvHref!);
  await expect(tv.getByRole("heading", { name: "Scan to join" })).toBeVisible();

  // Three players join and answer, with one refreshing mid-questionnaire.
  const p1 = await joinAndAnswer(browser, code, "Aunt Rosie", ANSWERS[0], 0, "Unicorn");
  const p2 = await joinAndAnswer(browser, code, "Cousin Theo", ANSWERS[1], 1, "Dino");
  const p3 = await joinAndAnswer(browser, code, "Grandpa Lou", ANSWERS[2], 2, "photo");
  await shot(p1, "phone-review");

  // Duplicate name (case-insensitive) is rejected with a friendly error.
  const dupCtx = await browser.newContext({ viewport: PHONE });
  const dup = await dupCtx.newPage();
  await dup.goto(`/join/${code}`);
  await dup.getByLabel("What should we call you?").fill("aunt rosie");
  await dup.getByRole("button", { name: "Let's play!" }).click();
  await expect(dup.getByText(/already joined with that name/)).toBeVisible();
  await dupCtx.close();

  for (const p of [p1, p2, p3]) {
    await p.getByRole("button", { name: "I'm ready!" }).click();
    await expect(p.getByRole("heading", { name: "You're ready!" })).toBeVisible();
  }
  // Catchphrases: pick a winning one, write a losing one.
  await p1.getByRole("button", { name: "Never doubt me!" }).click();
  await expect(p1.getByText("“Never doubt me!”")).toBeVisible();
  await p1.getByRole("button", { name: "✏️ Write my own" }).nth(1).click();
  await p1.getByLabel("Write your own").fill("Rosie demands a recount");
  await p1.getByRole("button", { name: "Save" }).click();
  await expect(p1.getByText("“Rosie demands a recount”")).toBeVisible();
  await p1.getByText("Your catchphrases").scrollIntoViewIfNeeded();
  await shot(p1, "phone-catchphrases");

  // Refresh recovery: session survives reload.
  await p2.reload();
  await expect(p2.getByRole("heading", { name: "You're ready!" })).toBeVisible();

  await expect(tv.getByText("3 of 3 ready")).toBeVisible();
  // Grandpa Lou's uploaded photo shows on the TV instead of a game piece.
  await expect(tv.locator('img[src^="/api/photos/"]').first()).toBeVisible();
  const photoSrc = await tv.locator('img[src^="/api/photos/"]').first().getAttribute("src");
  const photoRes = await tv.request.get(photoSrc!);
  expect(photoRes.headers()["content-type"]).toBe("image/jpeg");
  await shot(tv, "tv-lobby");
  await shot(p1, "phone-ready");

  await hostAction(host, "Start game…");
  await expect(host.getByText("3 players are ready. How many questions about each person?")).toBeVisible();
  await host.getByRole("radio", { name: "1", exact: true }).click();
  await expect(host.getByText(/1 × 3 people = 3 questions/)).toBeVisible();
  await shot(host, "host-start-dialog");
  await hostAction(host, "Lock roster & start");
  await expect(host.getByRole("heading", { name: "Questions are ready" })).toBeVisible();
  await expect(tv.getByText("Get ready!")).toBeVisible();
  await hostAction(host, "Start first question");
  await expect(tv.getByText(/Question 1 of 3/).first()).toBeVisible();
  await expect(tv.getByRole("status", { name: /starts in|get ready/ })).toBeVisible();
  await shot(tv, "tv-countdown");
  await shot(p1, "phone-countdown");
  await countdownDone(tv);

  const players = [p1, p2, p3];
  for (let q = 1; q <= 3; q++) {
    await expect(tv.getByText(new RegExp(`Question ${q} of 3`)).first()).toBeVisible();
  await countdownDone(tv);
    let guessed = 0;
    for (const p of players) {
      await expect(p.getByText(new RegExp(`Q${q} of 3|This one's about you`))).toBeVisible();
      if (await p.getByText("This one's about you").isVisible()) {
        if (q === 1) await shot(p, "phone-sitting-out");
        continue;
      }
      await p.getByRole("button", { name: /^A: / }).click();
      await p.getByRole("button", { name: /Lock in A/ }).click();
      await expect(p.getByText(/Locked in: A/)).toBeVisible();
      // Double submission is impossible once locked.
      await expect(p.getByRole("button", { name: /^B: / })).toBeDisabled();
      guessed++;
      if (q === 1 && guessed === 1) await shot(p, "phone-locked");
    }
    expect(guessed).toBe(2);
    await expect(tv.getByText("2 of 2 locked in")).toBeVisible();
    if (q === 1) await shot(tv, "tv-question");
    if (q === 1) {
      // The TV names who still has to lock in on question 2 (taunts), tested via the strip.
      await expect(tv.getByLabel("Who has locked in")).toBeVisible();
    }

    if (q === 2) {
      // Pause / resume.
      await hostAction(host, /Pause/);
      await expect(tv.getByText("Paused", { exact: true })).toBeVisible();
      await hostAction(host, /Resume/);
      await expect(tv.getByText("Paused", { exact: true })).toBeHidden();
    }

    // Wait until the host's own poll has seen every lock-in, otherwise it asks "Reveal anyway?".
    await expect(host.getByText("2 of 2 locked in")).toBeVisible();
    await hostAction(host, "Reveal answer");
    await expect(tv.getByText("Correct answer")).toBeVisible();
    await expect(tv.getByRole("heading", { name: "Who guessed what" })).toBeVisible();
    // The round loser's catchphrase pops up on the TV (there's always a loser).
    await expect(tv.locator(".slogan-pop").first()).toBeVisible();
    for (const p of players) await expect(p.getByText(/Correct answer|That was about you/).first()).toBeVisible();
    if (q === 1) {
      await shot(tv, "tv-reveal");
      await shot(p1, "phone-reveal");
    }
    await hostAction(host, "Show leaderboard ➜");
    await expect(tv.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    if (q === 1) await shot(tv, "tv-leaderboard");
    await hostAction(host, q === 3 ? "Show final results ➜" : "Next question ➜");
  }

  await expect(tv.getByText("The Awards")).toBeVisible();
  await tv.waitForTimeout(2500);
  await shot(tv, "tv-awards");
  await expect(tv.getByText("Final results")).toBeVisible({ timeout: 20_000 });
  await expect(host.getByRole("heading", { name: /Game over/ })).toBeVisible();
  for (const p of players) await expect(p.getByText("Game over!")).toBeVisible();
  await tv.waitForTimeout(1200);
  await shot(tv, "tv-final");
  await shot(p1, "phone-final");

  // Scores add up: 1000 per correct guess, plus 25–50 for the fastest right answer in a round.
  const res = await tv.request.get(`/api/games/${code}/results?key=${new URL(tvHref!, "http://x").searchParams.get("key")}`);
  const body = await res.json();
  expect(body.standings).toHaveLength(3);
  for (const s of body.standings) {
    expect(s.points % 1000 === 0 || (s.points % 1000 >= 25 && s.points % 1000 <= 150)).toBe(true);
    expect(s.eligible).toBe(2); // each player is the subject of exactly one of three rounds
  }
});

test("demo bots let one person test, with auto reveal and auto next", async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await hostCtx.newPage();
  await hostLogin(host);
  // Auto reveal is on by default; turn on auto next too.
  await host.getByText("Auto next question").click();
  await host.getByLabel("Seconds per question", { exact: true }).fill("8");
  await host.getByRole("radio", { name: "Thanksgiving" }).check({ force: true });
  await host.getByRole("button", { name: "Create game" }).first().click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  await hostAction(host, /Add 4 demo players/);
  await expect(host.getByText("4 ready")).toBeVisible();
  const tvHref = await host.getByRole("link", { name: /Open TV display/ }).getAttribute("href");
  const tvCtx = await browser.newContext({ viewport: TV });
  const tv = await tvCtx.newPage();
  await tv.goto(tvHref!);
  await expect(tv.getByText("Thanksgiving Edition").first()).toBeVisible();
  await shot(tv, "tv-lobby-thanksgiving");
  await hostAction(host, "Start game…");
  await host.getByRole("radio", { name: "1", exact: true }).click();
  await hostAction(host, "Lock roster & start");
  await hostAction(host, "Start first question");
  await expect(tv.getByText(/Question 1 of 4/).first()).toBeVisible();
  await countdownDone(tv);
  await shot(tv, "tv-question-thanksgiving");
  // Bots answer on their own; auto reveal fires; auto next moves to Q2; then the game finishes.
  await expect(tv.getByText("Correct answer")).toBeVisible({ timeout: 30_000 });
  await shot(tv, "tv-reveal-thanksgiving");
  await expect(tv.getByText(/Question 2 of 4/).first()).toBeVisible({ timeout: 30_000 });
  await countdownDone(tv);
  await expect(tv.getByText("Correct answer")).toBeVisible({ timeout: 30_000 });
  await hostAction(host, "End game early…");
  await expect(host.getByText("Are you sure you want to end the game?")).toBeVisible();
  await expect(host.getByRole("button", { name: "Yes, end the game" })).toBeDisabled();
  await host.getByLabel("Type END to confirm").fill("end");
  await hostAction(host, "Yes, end the game");
  await expect(tv.getByText(/The Awards|Final results/).first()).toBeVisible();
  await expect(tv.getByText("Final results")).toBeVisible({ timeout: 20_000 });
  await tv.waitForTimeout(1500);
  await shot(tv, "tv-final-thanksgiving");
});
