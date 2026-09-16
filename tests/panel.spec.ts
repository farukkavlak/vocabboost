import { RUN, test, expect, lookup, play, settled, watchPage } from "./fixture";

test("stands in for the caption instead of appearing somewhere else", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  // Raised clear of the bottom margin, so nothing is nudged and the alignment can be
  // asserted to the pixel. The case where it is nudged has its own test below.
  await page.addStyleTag({ content: ".caption-window { bottom: 160px }" });
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await settled(page);

  const text = await page.locator(".ytp-caption-segment").first().boundingBox();
  const line = await page.locator("#vocab-panel .line").boundingBox();
  const panel = await page.locator("#vocab-panel").boundingBox();

  // The line of words, not the panel's box and not the caption layer, which covers the
  // whole video.
  const centre = (box: { y: number; height: number } | null): number =>
    (box?.y ?? 0) + (box?.height ?? 0) / 2;

  expect(Math.abs(centre(line) - centre(text))).toBeLessThanOrEqual(1);
  expect(line?.y ?? 0).toBeGreaterThan(200);

  // The panel grows upwards from there and stays on screen.
  expect(panel?.y ?? 0).toBeGreaterThan(0);
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );

  // The real caption is hidden so the words are not drawn twice.
  await expect(page.locator(".ytp-caption-window-container")).toHaveCSS(
    "visibility",
    "hidden",
  );
});

test("shows the previous line above, as plain text", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await page.evaluate(() => window.showCaption(["he had to run the whole"]));
  await page.evaluate(() => window.showCaption(["department alone this year"]));
  await lookup(worker);

  await expect(page.locator("#vocab-panel .previous")).toHaveText(
    "he had to run the whole",
  );
  await expect(page.locator("#vocab-panel .word")).toHaveText([
    "department",
    "alone",
    "this",
    "year",
  ]);
});

test("opens the meaning above the word when there is no room below", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);

  const word = page.getByRole("button", { name: "run", exact: true });
  await word.click();
  await expect(page.locator("#vocab-meaning")).toContainText(RUN);
  await settled(page);

  const wordBox = await word.boundingBox();
  const meaningBox = await page.locator("#vocab-meaning").boundingBox();

  expect(meaningBox?.y ?? 0).toBeLessThan(wordBox?.y ?? 0);
  expect(meaningBox?.y ?? 0).toBeGreaterThan(0);
});

test("stays on screen in a window too short for it", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  // Growing downwards from the caption used to run it off the bottom of the window.
  await page.setViewportSize({ width: 900, height: 420 });
  await page.evaluate(() => window.showCaption(["he had to run the whole"]));
  await page.evaluate(() => window.showCaption(["department alone this year"]));
  await lookup(worker);
  await settled(page);

  const panel = await page.locator("#vocab-panel").boundingBox();
  expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(420);
  await expect(page.locator("#vocab-panel .hint")).toBeVisible();
});

test("takes the caption's own font size, whatever the player set", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  // Players scale captions with the window and with fullscreen. A size of our own would
  // be wrong at every size but one.
  await page.addStyleTag({
    content: ".ytp-caption-segment { font-size: 34px }",
  });
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);

  await expect(page.locator("#vocab-panel .line")).toHaveCSS(
    "font-size",
    "34px",
  );
});

test("the meaning never covers the line it explains", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);

  // Anchored on the word alone, the card would cover the rest of the sentence.
  await page.getByRole("button", { name: "had", exact: true }).click();
  await expect(page.locator("#vocab-meaning .sense").first()).toBeVisible();
  await settled(page);

  const line = await page.locator("#vocab-panel .line").boundingBox();
  const card = await page.locator("#vocab-meaning").boundingBox();
  const clears =
    (card?.y ?? 0) >= (line?.y ?? 0) + (line?.height ?? 0) ||
    (card?.y ?? 0) + (card?.height ?? 0) <= (line?.y ?? 0);
  expect(clears).toBe(true);
});

test("restores the caption when the panel is dismissed", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await page.keyboard.press("Escape");

  await expect(page.locator("#vocab-panel")).toHaveCount(0);
  await expect(page.locator(".ytp-caption-window-container")).toHaveCSS(
    "visibility",
    "visible",
  );
});

test("the shortcut toggles: pressing it again resumes the video", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await play(page);

  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await expect(page.locator("#vocab-panel")).toBeVisible();

  await lookup(worker);

  await expect(page.locator("#vocab-panel")).toHaveCount(0);
  await expect(page.locator(".ytp-caption-window-container")).toHaveCSS(
    "visibility",
    "visible",
  );
  await expect
    .poll(() => page.evaluate(() => window.player.paused))
    .toBe(false);
});
