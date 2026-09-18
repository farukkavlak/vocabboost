import type { BrowserContext, Page, Worker } from "@playwright/test";
import { test, expect, lookup, watchPage, RUN } from "./fixture";

const LINE = ["he had to run the department"];
const API = "https://api.typesafe.ai/**";

interface Asked {
  model: string;
  state: { subtitle_line: string; clicked_word: string };
  questions: {
    sense: {
      type: string;
      instructions: string;
      criteria: Record<string, string>;
    };
  };
}

/** What Jev sends back: the option it picked, with a probability for each. */
function answering(
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
): string {
  return JSON.stringify({
    model: "jev-1.13.0",
    answers: { sense: { type: "choice", choice, confidence, probabilities } },
    usage: { input_tokens: 600, output_tokens: 80 },
  });
}

/** Routes the API, chooses Jev with a key, and clicks "run" in the line. */
async function ask(
  context: BrowserContext,
  worker: Worker,
  reply: (asked: Asked) => { status?: number; body: string },
): Promise<{ page: Page; asked: Asked[] }> {
  const asked: Asked[] = [];
  await context.route(API, (route) => {
    const sent = JSON.parse(route.request().postData() ?? "{}") as Asked;
    asked.push(sent);
    const { status = 200, body } = reply(sent);
    return route.fulfill({ status, contentType: "application/json", body });
  });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ "key jev": "ts-test" });
    await chrome.storage.sync.set({ provider: "jev" });
  });

  const page = await watchPage(context);
  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  // The pending card says "Looking up…" in a .definition of its own; the answer is in.
  await expect(
    page.locator("#vocab-meaning .senses .definition").first(),
  ).toBeVisible();
  return { page, asked };
}

test("hands Jev the word's senses and leads with the one it picks", async ({
  context,
  worker,
}) => {
  const { page, asked } = await ask(context, worker, () => ({
    body: answering("sense-2", 0.94, { "sense-1": 0.05, "sense-2": 0.93 }),
  }));

  const sent = asked[0]!;
  expect(sent.model).toBe("jev-latest");
  // The line is the whole point: the word alone does not say which meaning.
  expect(sent.state.subtitle_line).toBe(LINE[0]);
  expect(sent.state.clicked_word).toBe("run");
  expect(sent.questions.sense.type).toBe("choice");

  // "run" has 41 verb senses, and one more option for a line none of them fits.
  const options = Object.keys(sent.questions.sense.criteria);
  expect(options).toHaveLength(42);
  expect(options.at(-1)).toBe("none");

  // The card leads with the sense Jev picked, which is the second option it was given.
  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".senses .definition")).toHaveCount(1);
  expect(sent.questions.sense.criteria["sense-2"]).toContain(
    await card.locator(".senses .definition").innerText(),
  );
  await expect(card.locator(".sure")).toHaveText("94% sure");
  await expect(card.locator(".lead")).toHaveCount(0);
});

test("shows the likeliest few when Jev is not sure", async ({
  context,
  worker,
}) => {
  const { page } = await ask(context, worker, () => ({
    body: answering("sense-1", 0.55, {
      "sense-1": 0.4,
      "sense-3": 0.35,
      "sense-2": 0.2,
    }),
  }));

  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".lead")).toHaveText("Could be any of these");
  await expect(card.locator(".senses .definition")).toHaveCount(3);
  await expect(card.locator(".sure")).toHaveCount(0);
});

test("says so when Jev finds no sense that fits", async ({
  context,
  worker,
}) => {
  const { page } = await ask(context, worker, () => ({
    body: answering("none", 0.88, { none: 0.8, "sense-1": 0.2 }),
  }));

  await expect(
    page.locator("#vocab-meaning .note", {
      hasText: "Jev found no sense that fits this line.",
    }),
  ).toBeVisible();
});

test("answers with the built-in model when Jev cannot be reached", async ({
  context,
  worker,
}) => {
  const { page } = await ask(context, worker, () => ({
    status: 503,
    body: JSON.stringify({ detail: "Overloaded" }),
  }));

  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".definition").first()).toHaveText(RUN);
  await expect(card.locator(".note", { hasText: "Overloaded" })).toBeVisible();
});

test("says so when Jev rejects the key", async ({ context, worker }) => {
  const { page } = await ask(context, worker, () => ({
    status: 401,
    body: "{}",
  }));

  await expect(page.locator("#vocab-meaning")).toContainText(
    "Jev rejected the key.",
  );
});
