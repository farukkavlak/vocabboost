import { test, expect, lookup, play, watchPage } from "./fixture";

test("shows the words of the caption that is on screen, and pauses the video", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await play(page);

  await page.evaluate(() =>
    window.showCaption(["He had to run the whole department"]),
  );
  await lookup(worker);

  const words = page.locator("#vocab-panel .word");
  await expect(words).toHaveText([
    "He",
    "had",
    "to",
    "run",
    "the",
    "whole",
    "department",
  ]);
  expect(await page.evaluate(() => window.player.paused)).toBe(true);
});

test("falls back to the last buffered line when the caption is already gone", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);

  await page.evaluate(() => window.showCaption(["the first line"]));
  await page.evaluate(() => window.showCaption(["the second line"]));
  await page.evaluate(() => window.clearCaption());

  await lookup(worker);

  await expect(page.locator("#vocab-panel .word")).toHaveText([
    "the",
    "second",
    "line",
  ]);
});

test("joins multi-segment captions with spaces", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);

  await page.evaluate(() =>
    window.showCaption(["run the whole", "department alone"]),
  );
  await lookup(worker);

  await expect(page.locator("#vocab-panel .word")).toHaveText([
    "run",
    "the",
    "whole",
    "department",
    "alone",
  ]);
});

test("keeps punctuation on screen but looks up the bare word", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);

  await page.evaluate(() =>
    window.showCaption(['"Wait," he said — 42 times, a lot.']),
  );
  await lookup(worker);

  // The line has to read as the sentence it replaces, so the clickable words carry
  // their own punctuation. Numbers and one-letter words are not worth a lookup and
  // stay as plain text.
  await expect(page.locator("#vocab-panel .word")).toHaveText([
    '"Wait,"',
    "he",
    "said",
    "times,",
    "lot.",
  ]);
  await expect(page.locator("#vocab-panel .line")).toHaveText(
    '"Wait," he said — 42 times, a lot.',
  );

  await page.locator("#vocab-panel .word").first().click();
  await expect(page.locator("#vocab-meaning h1")).toHaveText("Wait");
});

test("Escape closes the panel and resumes the video", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await play(page);

  await page.evaluate(() => window.showCaption(["run the department"]));
  await lookup(worker);
  await expect(page.locator("#vocab-panel")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.locator("#vocab-panel")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.player.paused))
    .toBe(false);
});
