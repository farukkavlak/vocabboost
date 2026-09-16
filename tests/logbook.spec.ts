import type { BrowserContext, Page, Worker } from "@playwright/test";
import { RUN, test, expect, lookup, play, watchPage } from "./fixture";
import type { LogEntry } from "../extension/src/logbook/store";

async function readLog(worker: Worker): Promise<LogEntry[]> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get("logbook");
    return (stored.logbook as LogEntry[] | undefined) ?? [];
  });
}

async function openLog(context: BrowserContext, worker: Worker): Promise<Page> {
  const page = await context.newPage();
  await page.goto(new URL("logbook.html", worker.url()).href);
  return page;
}

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    headword: "run",
    word: "run",
    occurrence: 0,
    partOfSpeech: "verb",
    senses: [{ definition: RUN }],
    confident: true,
    line: "He had to run the department.",
    moment: {
      platform: "youtube",
      title: "A film",
      url: "https://www.youtube.com/watch?v=abc123&t=10s",
      seconds: 83,
    },
    ...overrides,
  };
}

async function seed(worker: Worker, entries: LogEntry[]): Promise<void> {
  await worker.evaluate(
    (logbook) => chrome.storage.local.set({ logbook }),
    entries,
  );
}

test("logs a lookup with its line and where it happened", async ({
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
  await expect(page.locator("#vocab-meaning .sense").first()).toBeVisible();

  await expect.poll(async () => (await readLog(worker)).length).toBe(1);
  const [logged] = await readLog(worker);
  expect(logged).toMatchObject({
    headword: "run",
    word: "run",
    occurrence: 0,
    partOfSpeech: "verb",
    confident: false,
    line: "he had to run the department",
    moment: {
      platform: "youtube",
      title: "Fake watch page",
      url: "https://www.youtube.com/watch?v=test",
    },
  });
  expect(logged!.senses[0]!.definition).toBe(RUN);
  // The fixture's video is a live stream, whose clock does not advance like a file's.
  expect(typeof logged!.moment.seconds).toBe("number");
});

test("logs the same lookup once", async ({ context, worker }) => {
  const page = await watchPage(context);
  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  const word = page.getByRole("button", { name: "run", exact: true });
  for (let i = 0; i < 2; i++) {
    await word.click();
    await expect(page.locator("#vocab-meaning .sense").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect.poll(async () => (await readLog(worker)).length).toBe(1);
});

test("groups words by video and links back to the moment on YouTube", async ({
  context,
  worker,
}) => {
  await seed(worker, [
    entry({ headword: "run" }),
    entry({
      headword: "alone",
      word: "alone",
      partOfSpeech: "adverb",
      senses: [{ definition: "without anybody else or anything else" }],
      line: "I lived alone for a year.",
      moment: {
        platform: "netflix",
        title: "A series",
        url: "https://www.netflix.com/watch/1",
        seconds: 5,
      },
    }),
  ]);
  const page = await openLog(context, worker);

  await expect(page.locator("#count")).toHaveText("2 words");
  await expect(page.locator(".video h2")).toHaveText(["A film", "A series"]);
  await expect(page.locator(".line mark")).toHaveText(["run", "alone"]);
  await expect(
    page.getByRole("link", { name: "Watch at 1:23" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123&t=83s");
  // Only YouTube takes a start time in its URL.
  await expect(page.getByRole("link")).toHaveCount(1);
});

test("asks which meaning an unsure entry used, and keeps the answer", async ({
  context,
  worker,
}) => {
  await seed(worker, [
    entry({
      confident: false,
      senses: [
        { definition: RUN },
        { definition: "carry out" },
        { definition: "move fast by using one's feet" },
      ],
    }),
  ]);
  const page = await openLog(context, worker);

  await expect(page.locator(".question")).toBeVisible();
  await page.getByRole("button", { name: "This one" }).nth(1).click();
  await expect(page.locator(".definition")).toHaveText("carry out");

  await page.reload();
  await expect(page.locator(".definition")).toHaveText("carry out");
  expect((await readLog(worker))[0]!.chosen).toBe(1);
});

test("marks the clicked word in its line, not a phrase's first word", async ({
  context,
  worker,
}) => {
  await seed(worker, [
    entry({
      headword: "run into",
      word: "ran",
      line: "I ran into him, and ran.",
      occurrence: 1,
    }),
  ]);
  const page = await openLog(context, worker);
  await expect(page.locator(".line")).toHaveText("I ran into him, and ran.");
  await expect(page.locator(".line mark")).toHaveText("ran");
  const marked = await page.locator(".line").evaluate((line) => line.innerHTML);
  expect(marked).toBe("I ran into him, and <mark>ran</mark>.");
});

test("finds and removes entries", async ({ context, worker }) => {
  await seed(worker, [
    entry({ headword: "run" }),
    entry({
      headword: "safe",
      word: "safes",
      line: "Wall safes went out with vaudeville.",
    }),
  ]);
  const page = await openLog(context, worker);

  await page.getByRole("searchbox").fill("vaudeville");
  await expect(page.locator(".entry h3")).toHaveText(["safe"]);

  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.locator(".entry h3")).toHaveText(["safe"]);
  expect(await readLog(worker)).toHaveLength(1);
});

test("says what the log is for when it is empty", async ({
  context,
  worker,
}) => {
  const page = await openLog(context, worker);
  await expect(page.locator(".empty")).toContainText(
    "Words you look up while watching",
  );
});
