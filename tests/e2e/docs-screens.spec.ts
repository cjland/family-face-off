import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Captures the screenshots used in the README (docs/images). Not part of the normal test run:
 *
 *   DOCS_SCREENS=/tmp/docs-raw E2E_BASE_URL=http://localhost:3000 npx playwright test docs-screens
 *   python3 scripts/docs-images.py /tmp/docs-raw docs/images
 *
 * Everyone in these shots is fictional: two "real" players on phones plus labelled demo bots.
 */
const OUT = process.env.DOCS_SCREENS;
test.skip(!OUT, "Set DOCS_SCREENS=<folder> to capture README screenshots");

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

async function joinPhone(browser: Browser, code: string, name: string, piece: string, pick: number, shots: boolean) {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("What should we call you?").fill(name);
  await page.getByRole("radio", { name: piece, exact: true }).click();
  if (shots) await shot(page, "phone-join");
  await page.getByRole("button", { name: "Let's play!" }).click();
  await page.waitForURL(`**/play/${code}`);
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`Question ${i + 1} of 8`)).toBeVisible();
    if (shots && i === 1) await shot(page, "phone-questionnaire");
    await page.locator('[role="group"] button').nth((pick + i) % 6).click();
  }
  await expect(page.getByRole("heading", { name: "Looking good!" })).toBeVisible();
  if (shots) await shot(page, "phone-review");
  await page.getByRole("button", { name: "I'm ready!" }).click();
  await expect(page.getByRole("heading", { name: "You're ready!" })).toBeVisible();
  if (shots) await shot(page, "phone-ready");
  return page;
}

async function allLockedIn(host: Page) {
  await expect
    .poll(
      async () => {
        const t = (await host.getByText(/\d+ of \d+ locked in/).first().textContent()) ?? "";
        const m = /(\d+) of (\d+)/.exec(t);
        return Boolean(m && m[1] === m[2]);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

test("README screenshots", async ({ browser }) => {
  test.setTimeout(900_000);
  const hostCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  const host = await hostCtx.newPage();
  await host.goto("/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host.getByRole("button", { name: "Sign in" }).click();
  await expect(host.getByRole("button", { name: "Create game" }).first()).toBeVisible();
  await shot(host, "host-dashboard");
  // Turn on every leaderboard page so all of them get photographed.
  for (const cb of await host.getByRole("checkbox").all()) {
    const label = (await cb.evaluate((el) => el.closest("label")?.textContent ?? "")) || "";
    if (/Speed vs|Quick or slow|last five|Hardest questions|hardest to guess|fooled/.test(label) && !(await cb.isChecked())) await cb.check();
  }
  // The script reveals each answer itself.
  await host.getByText("Auto reveal").click();
  await host.getByRole("button", { name: "Create game" }).first().click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;

  const tvHref = await host.getByRole("link", { name: /Open TV display/ }).getAttribute("href");
  const tv = await hostCtx.newPage();
  await tv.setViewportSize(TV);
  await tv.goto(tvHref!);

  const june = await joinPhone(browser, code, "Grandma June", "Owl", 0, true);
  const ray = await joinPhone(browser, code, "Uncle Ray", "Dragon", 3, false);
  for (const n of [6, 10]) {
    await host.getByRole("button", { name: /Add \d+ demo players/ }).click();
    await expect(host.getByText(`${n} ready`)).toBeVisible();
  }
  await expect(tv.getByText("10 of 10 ready")).toBeVisible({ timeout: 15_000 });
  await tv.waitForTimeout(1200);
  await shot(tv, "tv-lobby");
  await shot(host, "host-lobby");
  await tv.getByRole("button", { name: /How to play/ }).click();
  for (let s = 2; s <= 10; s++) await tv.keyboard.press("ArrowRight");
  await expect(tv.getByText("Step 10 of 15")).toBeVisible();
  await tv.waitForTimeout(900);
  await shot(tv, "tv-howto");
  await tv.getByRole("button", { name: "✕ Close" }).click();

  await host.getByRole("button", { name: "Start game…" }).click();
  await host.getByRole("radio", { name: "1", exact: true }).click();
  await host.waitForTimeout(400);
  await shot(host, "host-start");
  await host.getByRole("button", { name: "Lock roster & start" }).click();
  await expect(host.getByRole("heading", { name: "Questions are ready" })).toBeVisible();
  await host.getByRole("button", { name: "Start first question" }).click();

  const rounds = 6;
  for (let q = 1; q <= rounds; q++) {
    await expect(tv.getByRole("status", { name: /starts in|get ready/ })).toBeVisible();
    if (q === 1) {
      await tv.waitForTimeout(700);
      await shot(tv, "tv-getready");
      await expect(tv.getByRole("status", { name: /starts in 4/ })).toBeVisible({ timeout: 15_000 });
      await tv.waitForTimeout(150);
      await shot(tv, "tv-countdown");
      await expect(june.getByRole("status", { name: /starts in|get ready/ })).toBeVisible();
      await june.waitForTimeout(500);
      await shot(june, "phone-countdown");
    }
    await expect(tv.getByRole("status", { name: /starts in|get ready/ })).toHaveCount(0, { timeout: 15_000 });
    for (const [p, letter] of [
      [june, q % 2 ? "B" : "A"],
      [ray, "C"],
    ] as const) {
      if (await p.getByText("This one's about you").isVisible()) continue;
      await p.getByRole("button", { name: new RegExp(`^${letter}: `) }).click();
      if (q === 1 && p === june) await shot(june, "phone-question");
      await p.getByRole("button", { name: new RegExp(`Lock in ${letter}`) }).click();
      if (q === 1 && p === june) await shot(june, "phone-locked");
    }
    if (await tv.getByText("🎁 Bonus question").first().isVisible()) {
      await tv.waitForTimeout(2500);
      await shot(tv, "tv-bonus");
    }
    if (q === 1) {
      await tv.waitForTimeout(2500);
      await shot(tv, "tv-question");
      await shot(host, "host-question");
    }
    await allLockedIn(host);
    await host.getByRole("button", { name: "Reveal answer" }).click();
    await expect(tv.getByText("Correct answer")).toBeVisible();
    if (q === 1) {
      await tv.waitForTimeout(1800);
      await shot(tv, "tv-reveal");
      await shot(june, "phone-reveal");
      await shot(host, "host-reveal");
    }
    await host.getByRole("button", { name: "Show leaderboard ➜" }).click();
    await expect(tv.getByRole("tab", { name: "Overall" })).toBeVisible();
    if (q < rounds) await host.getByRole("button", { name: "Next question ➜" }).click();
  }

  // Every leaderboard page (the TV rotates through these; clicking a tab holds it).
  for (const [tab, name, wait] of [
    ["Overall", "board-overall", 1500],
    ["This round", "board-round", 1500],
    ["Reaction", "board-reaction", 1500],
    ["Bets", "board-bets", 3200],
    ["Heating up", "board-heating", 2500],
    ["Stumpers", "board-stumpers", 2500],
    ["Mystery", "board-mystery", 2500],
    ["Galaxy", "board-galaxy", 2600],
    ["Graveyard", "board-graveyard", 2800],
    ["Leader", "board-leader", 3000],
  ] as const) {
    const t = tv.getByRole("tab", { name: tab, exact: true });
    if (!(await t.count())) continue;
    await t.click();
    await tv.waitForTimeout(wait);
    await shot(tv, name);
  }

  await host.getByRole("button", { name: "End game early…" }).click();
  await host.getByLabel("Type END to confirm").fill("END");
  await host.getByRole("button", { name: "Yes, end the game" }).click();
  await expect(tv.getByText("The Awards")).toBeVisible();
  await tv.waitForTimeout(3000);
  await shot(tv, "tv-awards");
  await expect(tv.getByText("Final results")).toBeVisible({ timeout: 30_000 });
  await tv.waitForTimeout(2500);
  await shot(tv, "tv-final");
  await expect(june.getByText("Game over!")).toBeVisible();
  await june.waitForTimeout(800);
  await shot(june, "phone-final");
});
