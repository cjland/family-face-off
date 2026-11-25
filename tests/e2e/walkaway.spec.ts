import { type Page, expect, test } from "@playwright/test";

/** Each question starts with a full-screen 5-4-3-2-1; wait until answers are open. */
async function countdownDone(page: Page) {
  await expect(page.getByRole("status", { name: /starts in/ })).toHaveCount(0, { timeout: 15_000 });
}
test("someone walks away: host can reveal without them once time is up", async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const host = await ctx.newPage();
  await host.goto("/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host.getByRole("button", { name: "Sign in" }).click();
  await host.getByRole("button", { name: "Create game" }).click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneCtx.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByLabel("What should we call you?").fill("Wanderer Walt");
  await phone.getByRole("button", { name: "Let's play!" }).click();
  await phone.waitForURL(`**/play/${code}`);
  for (let i = 0; i < 8; i++) {
    await expect(phone.getByText(`Question ${i + 1} of 8`)).toBeVisible();
    await phone.locator('[role="group"] button').nth(i % 6).click();
  }
  await phone.getByRole("button", { name: "I'm ready!" }).click();
  await host.getByRole("button", { name: /Add \d+ demo players/ }).click();
  await expect(host.getByText(`5 ready`)).toBeVisible();
  const href = await host.getByRole("link", { name: /Open TV display/ }).getAttribute("href");
  const tv = await ctx.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(href!);
  for (const l of ["Start game…", "Lock roster & start", "Start first question"]) await host.getByRole("button", { name: l }).click();
  await expect(tv.getByText(/Question 1 of/).first()).toBeVisible({ timeout: 20000 });
  await countdownDone(tv);
  // Walt never answers. Before time is up there's no way to reveal.
  await expect(tv.getByRole("button", { name: /Reveal without waiting/ })).toHaveCount(0);
  if (await tv.getByText(/Wanderer Walt sits this one out/).count()) test.skip(true, "Walt is the subject this round");
  const skip = tv.getByRole("button", { name: /Reveal without waiting/ });
  await expect(skip).toBeVisible({ timeout: 30000 });
  await tv.keyboard.press("ArrowRight"); // keyboard still doesn't bypass
  await tv.waitForTimeout(1500);
  await expect(tv.getByText("Correct answer")).toHaveCount(0);
  await skip.click();
  await expect(tv.getByRole("button", { name: /Reveal without Wanderer Walt/ })).toBeVisible();
  await tv.screenshot({ path: "/tmp/shots4/walk-2.png" });
  // Locked-in players are listed first, in lock-in order; Walt (not in) comes last.
  const strip = tv.getByLabel("Who has locked in");
  await expect(strip.locator("[title]").last()).toHaveAttribute("title", "Wanderer Walt");
  await tv.getByRole("button", { name: /Reveal without Wanderer Walt/ }).click();
  await expect(tv.getByText("Correct answer")).toBeVisible({ timeout: 10000 });
});
