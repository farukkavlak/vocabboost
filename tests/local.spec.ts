import type { BrowserContext, Page, Worker } from "@playwright/test";
import { RUN, test, expect, lookup, watchPage } from "./fixture";

// The shipped model answers these; nothing is stubbed.
async function clickWord(
  context: BrowserContext,
  worker: Worker,
  line: string,
  word: string,
): Promise<Page> {
  const page = await watchPage(context);
  await page.evaluate((text) => window.showCaption([text]), line);
  await lookup(worker);
  await page.getByRole("button", { name: word, exact: true }).click();
  return page;
}

test("shows the likeliest senses when the line does not settle it", async ({
  context,
  worker,
}) => {
  const page = await clickWord(
    context,
    worker,
    "he had to run the department",
    "run",
  );

  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".lead")).toHaveText("Could be any of these");
  await expect(card.locator(".senses .definition")).toHaveCount(3);
  await expect(card.locator(".senses .definition").first()).toHaveText(RUN);
  await expect(card.locator(".pos")).toHaveText("verb");
  await expect(card.locator(".sure")).toHaveCount(0);

  // "run" has 41 verb senses: three shown, the other 38 folded.
  const more = card.getByRole("button", { name: "38 other meanings" });
  await expect(card.locator(".others")).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".others .definition")).toHaveCount(38);
});

test("leads with one sense when the model is sure", async ({
  context,
  worker,
}) => {
  const page = await clickWord(
    context,
    worker,
    "I lived alone for a year",
    "alone",
  );

  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".senses .definition")).toHaveText([
    "without anybody else or anything else",
  ]);
  await expect(card.locator(".lead")).toHaveCount(0);
  await expect(card.locator(".sure")).toHaveText(/^\d{2}% sure$/);
  await expect(
    card.getByRole("button", { name: "1 other meaning" }),
  ).toBeVisible();
});

test("reads a phrase as the phrase", async ({ context, worker }) => {
  const page = await clickWord(
    context,
    worker,
    "I ran into him at the store",
    "ran",
  );
  await expect(page.locator("#vocab-meaning h1")).toHaveText("run into");
});

test("answers with the network off", async ({ context, worker }) => {
  const page = await watchPage(context);
  await context.setOffline(true);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await expect(page.locator("#vocab-meaning .definition").first()).toHaveText(
    RUN,
  );
});

test("reads a word it has answered from the cache, without loading the model", async ({
  context,
  worker,
}) => {
  const page = await clickWord(
    context,
    worker,
    "he had to run the department",
    "run",
  );
  await expect(page.locator("#vocab-meaning .definition").first()).toHaveText(
    RUN,
  );

  // Give the model's memory back, as the idle timer would.
  await worker.evaluate(() => chrome.offscreen.closeDocument());
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "run", exact: true }).click();

  await expect(page.locator("#vocab-meaning .definition").first()).toHaveText(
    RUN,
  );
  expect(await worker.evaluate(() => chrome.offscreen.hasDocument())).toBe(
    false,
  );
});
