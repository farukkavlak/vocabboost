import { RUN, test, expect, lookup, play, watchPage } from "./fixture";

test("shows the meaning the model chose", async ({ context, worker }) => {
  const page = await watchPage(context);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);

  await page.getByRole("button", { name: "run", exact: true }).click();

  await expect(page.locator("#vocab-meaning")).toContainText(RUN);
});

test("says so when the lookup fails instead of failing silently", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await page.evaluate(() => window.showCaption(["I'm gonna go"]));
  await lookup(worker);

  await page.getByRole("button", { name: "gonna", exact: true }).click();

  await expect(page.locator("#vocab-meaning")).toContainText(
    '"gonna" is not in the dictionary.',
  );
});

test("Escape closes the meaning first, then the panel", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await play(page);

  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await expect(page.locator("#vocab-meaning")).toBeVisible();

  // One step at a time: closing the card must not also take away the sentence it
  // explains, which is what the user is still reading.
  await page.keyboard.press("Escape");
  await expect(page.locator("#vocab-meaning")).toHaveCount(0);
  await expect(page.locator("#vocab-panel")).toBeVisible();
  expect(await page.evaluate(() => window.player.paused)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator("#vocab-panel")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.player.paused))
    .toBe(false);
});
