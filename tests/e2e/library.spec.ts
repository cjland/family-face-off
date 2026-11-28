import { expect, test } from "@playwright/test";

test("question library: browse, pick, and create a game from the picks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/host");
  await page.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await page.getByRole("link", { name: /Browse & pick questions/ }).click();
  await page.waitForURL(/\/host\/library$/);
  await expect(page.getByRole("heading", { name: "Question library" })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("ffo-library-picks-v1"));
  await page.reload();

  // Pick a whole category of about-you questions, peek at one question's answers.
  await page.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: /^Food & Drink/ }).click();
  await page.getByRole("button", { name: "Pick all shown", exact: true }).click();
  await page.getByRole("button", { name: /^Answers \(30\)/ }).first().click();
  await expect(page.getByRole("list", { name: "Answers" }).getByRole("listitem")).toHaveCount(30);
  if (process.env.SHOTS) await page.screenshot({ path: "test-results/library-about.png" });

  // And a few trivia questions for the bonus rounds.
  await page.getByRole("tab", { name: /Trivia/ }).click();
  for (let i = 0; i < 3; i++) await page.locator('input[type="checkbox"][id^="pick-"]').nth(i).check();
  await page.getByRole("button", { name: /^Answers \(4\)/ }).first().click();
  await expect(page.getByLabel("Correct answer").first()).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: "test-results/library-trivia.png" });

  await page.getByRole("button", { name: "Create a game with these →" }).click();
  await expect(page.getByText(/Picked in the library: 15 about-the-players questions · 3 trivia/)).toBeVisible();
  if (process.env.SHOTS) await page.getByText(/Picked in the library/).scrollIntoViewIfNeeded().then(() => page.screenshot({ path: "test-results/library-setup.png" }));
  await page.getByRole("button", { name: "Create game" }).first().click();
  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{6}$/);
});
