import { expect, test } from "@playwright/test";
test("How to play walkthrough on the TV lobby", async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const host = await ctx.newPage();
  await host.goto("/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host.getByRole("button", { name: "Sign in" }).click();
  await host.getByRole("button", { name: "Create game" }).first().click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  const href = await host.getByRole("link", { name: /Open TV display/ }).getAttribute("href");
  const tv = await ctx.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(href!);
  await tv.getByRole("button", { name: /How to play/ }).click();
  await expect(tv.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await host.getByRole("button", { name: /Add \d+ demo players/ }).click();
  await expect(tv.getByText("Step 1 of 15")).toBeVisible();
  // The QR code stays on screen while the walkthrough plays, and joiners show up live.
  await expect(tv.getByRole("img", { name: /QR code to join/ })).toBeVisible();
  await expect(tv.getByText(/4 joined/)).toBeVisible({ timeout: 15_000 });
  for (let s = 2; s <= 15; s++) {
    await tv.keyboard.press("ArrowRight");
    await expect(tv.getByText(`Step ${s} of 15`)).toBeVisible();
  }
  await tv.keyboard.press("ArrowRight");
  await expect(tv.getByText("Step 1 of 15")).toBeVisible(); // loops
  // Arrow keys moved slides, not the game: still in the lobby. Refresh keeps it open.
  await tv.reload();
  await expect(tv.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await tv.getByRole("button", { name: "✕ Close" }).click();
  await expect(tv.getByText("Who's playing")).toBeVisible();
});
