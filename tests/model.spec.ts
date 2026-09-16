import type { BrowserContext, Page, Worker } from "@playwright/test";
import { test, expect, lookup, watchPage, RUN } from "./fixture";

const LINE = ["he had to run the department"];
const ASK = "#vocab-meaning .ask";

const ANSWER = {
  definition: "to be in charge of the department",
  partOfSpeech: "verb",
  cefr: "B2",
  phrase: "",
};

/**
 * The key lives in local storage and the choice of provider in sync, as the settings
 * page writes them. The provider's host permission is not granted here: a routed
 * request is fulfilled before Chrome checks for it — which is why the settings page's
 * own request has a test of its own.
 */
async function setKey(worker: Worker, id: string, key: string): Promise<void> {
  await worker.evaluate(
    async ([name, value]) => {
      await chrome.storage.local.set({ [`key ${name}`]: value });
      await chrome.storage.sync.set({ provider: name });
    },
    [id, key],
  );
}

async function openCard(
  context: BrowserContext,
  worker: Worker,
): Promise<Page> {
  const page = await watchPage(context);
  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await expect(
    page.locator("#vocab-meaning .definition").first(),
  ).toBeVisible();
  return page;
}

test("offers the model as a second step, once the local answer is in", async ({
  context,
  worker,
}) => {
  await setKey(worker, "anthropic", "sk-ant-test");
  const page = await openCard(context, worker);
  await expect(page.locator(ASK)).toHaveText("Ask your model");
});

test("leaves the step out when no key has been added", async ({
  context,
  worker,
}) => {
  // Until the settings page exists there is nowhere to add a key, so a button leading
  // to "add a key in the settings" would be a dead end.
  const page = await openCard(context, worker);
  await expect(page.locator(ASK)).toHaveCount(0);
});

test("asks the chosen provider with the whole line and shows what it answers", async ({
  context,
  worker,
}) => {
  const bodies: string[] = [];
  const page = await watchPage(context);
  await context.route("https://api.anthropic.com/**", (route) => {
    bodies.push(route.request().postData() ?? "");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(ANSWER) }],
      }),
    });
  });
  await setKey(worker, "anthropic", "sk-ant-test");

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

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

test("uses whichever provider the key belongs to", async ({
  context,
  worker,
}) => {
  let called = "";
  const page = await watchPage(context);
  await context.route("https://api.openai.com/**", (route) => {
    called = "openai";
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(ANSWER) } }],
      }),
    });
  });
  await setKey(worker, "openai", "sk-openai-test");

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

  await expect(page.locator("#vocab-meaning .definition")).toHaveText([
    ANSWER.definition,
  ]);
  expect(called).toBe("openai");
});

test("keeps the local answer when the model call fails, and offers a retry", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Overloaded, try again" } }),
    }),
  );
  await setKey(worker, "anthropic", "sk-ant-test");

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

  const card = page.locator("#vocab-meaning");
  // What the local model gave is still there; the failure is a note under it.
  await expect(card.locator(".definition").first()).toHaveText(RUN);
  // The provider said why, and saying "500" instead would have thrown that away.
  await expect(
    card.locator(".note", { hasText: "Overloaded, try again" }),
  ).toBeVisible();
  await expect(page.locator(ASK)).toBeEnabled();
});

test("says so when the model answers with something unusable", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
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
  await setKey(worker, "anthropic", "sk-ant-test");

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

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
  const page = await watchPage(context);
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
  await setKey(worker, "anthropic", "sk-ant-test");
  await worker.evaluate(() => chrome.storage.sync.set({ language: "Turkish" }));

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

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

test("says so when the provider rejects the key", async ({
  context,
  worker,
}) => {
  const page = await watchPage(context);
  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await setKey(worker, "anthropic", "sk-ant-wrong");

  await page.evaluate((line) => window.showCaption(line), LINE);
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.locator(ASK).click();

  await expect(page.locator("#vocab-meaning")).toContainText(
    "Claude rejected the key.",
  );
});
