// Writes the three Chrome Web Store screenshots to docs/store, at the 1280 × 800 the
// store asks for. Not part of `npm test`: it asserts nothing and overwrites the images.
// Run it with `npm run store` after a change to the card or the log, so the listing
// never shows an older extension than the one being uploaded.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { test, expect, lookup, settled, watchPage } from "./fixture";
import type { LogEntry } from "../extension/src/logbook/entry";

const OUT = "docs/store";

/**
 * A still frame in place of a film: the store's own rules forbid shipping someone
 * else's footage, and a flat gradient keeps the panel the only thing to read.
 */
const scene = `
  video { width: 1280px; height: 800px; object-fit: cover;
    background: linear-gradient(160deg,#3a4a63 0%,#6b7f96 40%,#c9b79c 75%,#8a6f4e 100%); }
  body { background:#000 }
  /* Roughly YouTube's own caption look, at the height a player really puts it. */
  .caption-window { bottom: 72px; font: 400 28px/1.35 "Roboto", system-ui, sans-serif; }
  .ytp-caption-segment { background: rgba(8,8,8,0.75); padding: 2px 6px; }
`;

/** A paused film with `previous` behind `line`, as the panel shows the pair. */
async function watching(
  context: BrowserContext,
  previous: string,
  line: string,
): Promise<Page> {
  const page = await watchPage(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addStyleTag({ content: scene });
  await page.evaluate((text) => window.showCaption([text]), previous);
  await page.waitForTimeout(80);
  await page.evaluate((text) => window.showCaption([text]), line);
  await page.waitForTimeout(80);
  return page;
}

/** Opens the card on one word of the line and waits for the real model to answer. */
async function clickWord(page: Page, worker: Worker, word: string) {
  await lookup(worker);
  await page.getByRole("button", { name: word, exact: true }).click();
  const card = page.locator("#vocab-meaning:not(.pending)");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await settled(page);
  return card;
}

test("@store the card when the model is sure, with how sure it is", async ({
  context,
  worker,
}) => {
  const page = await watching(
    context,
    "Nobody came to see me.",
    "I lived alone for a year.",
  );
  const card = await clickWord(page, worker, "alone");
  // The point of this shot since phase 18: the card says how sure it is.
  await expect(card.locator(".sure")).toBeVisible();
  await page.screenshot({ path: `${OUT}/screenshot-1-sure.png` });
  await page.close();
});

test("@store the card when it is not sure, showing the likeliest meanings", async ({
  context,
  worker,
}) => {
  const page = await watching(
    context,
    "It was a big job.",
    "He had to run the department.",
  );
  const card = await clickWord(page, worker, "run");
  await expect(card.locator(".lead")).toHaveText("Could be any of these");
  await page.screenshot({ path: `${OUT}/screenshot-2-unsure.png` });
  await page.close();
});

test("@store the word log", async ({ context, worker }) => {
  await seed(worker, [
    entry({
      word: "run",
      headword: "run",
      partOfSpeech: "verb",
      confident: false,
      senses: [
        { definition: "direct or control; projects, businesses, etc." },
        { definition: "run, stand, or compete for an office or a position" },
        { definition: "carry out" },
      ],
      line: "He had to run the department.",
      moment: moment("Office Life: Episode 4", "abc123", 83),
    }),
    entry({
      word: "alone",
      headword: "alone",
      partOfSpeech: "adverb",
      senses: [{ definition: "without anybody else or anything else" }],
      line: "I lived alone for a year.",
      moment: moment("Office Life: Episode 4", "abc123", 41),
    }),
    entry({
      word: "ran",
      headword: "run into",
      senses: [{ definition: "come together" }],
      line: "I ran into him at the store.",
      moment: moment("A Night in Vienna", "def456", 312),
    }),
    entry({
      word: "score",
      headword: "score",
      partOfSpeech: "noun",
      senses: [{ definition: "the act of scoring in a game or sport" }],
      line: "One last big score and we are out.",
      moment: moment("The Heist", "ghi789", 127),
    }),
  ]);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(new URL("logbook.html", worker.url()).href);
  await expect(page.getByRole("heading", { name: "Word log" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/screenshot-3-word-log.png` });
  await page.close();
});

function moment(title: string, id: string, seconds: number) {
  return {
    platform: "youtube",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    seconds,
  };
}

let clock = 0;

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    // Seeded entries come out newest first, in the order they are listed.
    savedAt: 1_000_000 - clock++,
    headword: "run",
    word: "run",
    occurrence: 0,
    senses: [],
    confident: true,
    line: "",
    moment: moment("A film", "abc123", 83),
    ...overrides,
  };
}

/** Writes entries straight into the extension's IndexedDB, as a reader's log would be. */
async function seed(worker: Worker, entries: LogEntry[]): Promise<void> {
  await worker.evaluate(
    (rows) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("vocabboost", 1);
        open.onupgradeneeded = () =>
          open.result
            .createObjectStore("log", { keyPath: "id" })
            .createIndex("savedAt", "savedAt");
        open.onsuccess = () => {
          const transaction = open.result.transaction("log", "readwrite");
          rows.forEach((row) => transaction.objectStore("log").put(row));
          transaction.oncomplete = () => resolve();
        };
      }),
    entries,
  );
}
