import type { BrowserContext, Page, Worker } from "@playwright/test";
import { test, expect, lookup, watchPage, RUN } from "./fixture";

const LINE = ["he had to run the department"];

const ANSWER = {
  definition: "to be in charge of the department",
  partOfSpeech: "verb",
  cefr: "B2",
  phrase: "",
};

/**
 * The key lives in local storage and the choice of model in sync, as the settings page
 * writes them. The provider's host permission is not granted here: a routed request is
 * fulfilled before Chrome checks for it — which is why the settings page's own request
 * has a test of its own.
 */
async function choose(worker: Worker, id: string, key?: string): Promise<void> {
  await worker.evaluate(
    async ([name, value]) => {
      if (value) {
        await chrome.storage.local.set({ [`key ${name!}`]: value });
      }
      await chrome.storage.sync.set({ provider: name });
    },
    [id, key],
  );
}

/** Clicks "run" in the line and waits for the card to be filled in. */
async function openCard(
  context: BrowserContext,
  worker: Worker,
): Promise<Page> {
  const page = await watchPage(context);
  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  // The pending card says "Looking up…" in a .definition of its own; the answer is in.
  await expect(
    page.locator("#vocab-meaning .senses .definition").first(),
  ).toBeVisible();
  return page;
}

test("answers with the chosen model, and sends it the whole line", async ({
  context,
  worker,
}) => {
  const bodies: string[] = [];
  await context.route("https://api.anthropic.com/**", (route) => {
    bodies.push(route.request().postData() ?? "");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(ANSWER) }],
      }),
    });
  });
  await choose(worker, "anthropic", "sk-ant-test");

  const page = await openCard(context, worker);
  const card = page.locator("#vocab-meaning");
  await expect(card.locator(".definition")).toHaveText([ANSWER.definition]);
  await expect(card.locator(".pos")).toHaveText("verb");
  await expect(card.locator(".level")).toHaveText("B2");

  // The line is the whole point: the word alone does not say which meaning.
  const sent = JSON.parse(bodies[0] ?? "{}") as {
    model: string;
    messages: { content: string }[];
    output_config: { format: { type: string } };
  };
  expect(sent.messages[0]?.content).toContain("he had to run the department");
  expect(sent.model).toBe("claude-haiku-4-5");
  expect(sent.output_config.format.type).toBe("json_schema");
});

test("uses whichever model was chosen", async ({ context, worker }) => {
  let called = "";
  await context.route("https://api.openai.com/**", (route) => {
    called = "openai";
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(ANSWER) } }],
      }),
    });
  });
  await choose(worker, "openai", "sk-openai-test");

  const page = await openCard(context, worker);
  await expect(page.locator("#vocab-meaning .definition")).toHaveText([
    ANSWER.definition,
  ]);
  expect(called).toBe("openai");
});

test("stays with the built-in model until a key is added", async ({
  context,
  worker,
}) => {
  let called = false;
  await context.route("https://api.anthropic.com/**", (route) => {
    called = true;
    return route.abort();
  });
  await choose(worker, "anthropic");

  const page = await openCard(context, worker);
  await expect(page.locator("#vocab-meaning .definition").first()).toHaveText(
    RUN,
  );
  expect(called).toBe(false);
});

test("answers with the built-in model when the chosen one fails, and says why", async ({
  context,
  worker,
}) => {
  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Overloaded, try again" } }),
    }),
  );
  await choose(worker, "anthropic", "sk-ant-test");

  const page = await openCard(context, worker);
  const card = page.locator("#vocab-meaning");
  // An answer the reader can use, with the reason it is not the one they chose.
  await expect(card.locator(".definition").first()).toHaveText(RUN);
  // The provider said why, and saying "500" instead would have thrown that away.
  await expect(
    card.locator(".note", { hasText: "Overloaded, try again" }),
  ).toBeVisible();
});

test("says so when the model answers with something unusable", async ({
  context,
  worker,
}) => {
  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      // Valid JSON, no definition: a truncated answer looks exactly like this, and it
      // used to reach the card as the word "undefined".
      body: JSON.stringify({
        content: [{ type: "text", text: '{"partOfSpeech":"verb"}' }],
      }),
    }),
  );
  await choose(worker, "anthropic", "sk-ant-test");

  const page = await openCard(context, worker);
  await expect(
    page.locator("#vocab-meaning .note", {
      hasText: "Claude answered without a definition.",
    }),
  ).toBeVisible();
  await expect(page.locator("#vocab-meaning")).not.toContainText("undefined");
});

test("asks for a translation only when one was chosen", async ({
  context,
  worker,
}) => {
  const bodies: string[] = [];
  await context.route("https://api.anthropic.com/**", (route) => {
    bodies.push(route.request().postData() ?? "");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...ANSWER, translation: "yönetmek" }),
          },
        ],
      }),
    });
  });
  await choose(worker, "anthropic", "sk-ant-test");
  await worker.evaluate(() => chrome.storage.sync.set({ language: "Turkish" }));

  const page = await openCard(context, worker);
  await expect(page.locator("#vocab-meaning .translation")).toHaveText(
    "yönetmek",
  );

  const sent = JSON.parse(bodies[0] ?? "{}") as {
    messages: { content: string }[];
    output_config: { format: { schema: { properties: object } } };
  };
  expect(sent.messages[0]?.content).toContain("into Turkish");
  expect(sent.output_config.format.schema.properties).toHaveProperty(
    "translation",
  );
});

test("says so when the model rejects the key", async ({ context, worker }) => {
  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await choose(worker, "anthropic", "sk-ant-wrong");

  const page = await openCard(context, worker);
  await expect(page.locator("#vocab-meaning")).toContainText(
    "Claude rejected the key.",
  );
});
