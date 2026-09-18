import type { BrowserContext, Page, Worker } from "@playwright/test";
import { test, expect } from "./fixture";

/**
 * Chrome asks the reader to confirm an optional host permission in its own bubble, which
 * Playwright cannot click. `chrome.permissions.request` is stubbed here so what is under
 * test is the page's own behaviour: that it asks for the right origin, and what it does
 * with each answer.
 */
async function openSettings(
  context: BrowserContext,
  worker: Worker,
  { granted = true } = {},
): Promise<Page> {
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/settings.html`);
  await page.evaluate((allow) => {
    window.asked = [];
    chrome.permissions.request = (permissions) => {
      window.asked.push(permissions.origins?.[0] ?? "");
      return Promise.resolve(allow);
    };
  }, granted);
  return page;
}

test("lists the models and starts on the built-in one", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);

  await expect(page.locator("#providers label")).toHaveText([
    "Built-in model",
    "Jev",
    "Claude",
    "OpenAI",
  ]);
  await expect(page.locator("#providers input:checked")).toHaveValue("local");
  // The built-in model takes no key, so the field for one would be a dead end.
  await expect(page.locator("#credentials")).toBeHidden();

  await page.locator('#providers input[value="anthropic"]').check();
  await expect(page.locator("#credentials")).toBeVisible();
  await expect(page.locator("#get-key")).toHaveAttribute(
    "href",
    /console\.anthropic\.com/,
  );
});

test("choosing the built-in model needs no saving", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);
  await page.locator('#providers input[value="jev"]').check();
  await page.locator('#providers input[value="local"]').check();

  await expect
    .poll(async () =>
      worker.evaluate(async () => (await chrome.storage.sync.get()).provider),
    )
    .toBe("local");
});

test("saves the key and asks for that provider's host", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);
  await page.locator('#providers input[value="anthropic"]').check();

  await page.locator("#key").fill("sk-ant-example");
  await page.locator("#save").click();

  await expect(page.locator("#said")).toContainText("Saved");
  expect(await page.evaluate(() => window.asked)).toEqual([
    "https://api.anthropic.com/*",
  ]);

  const stored = await worker.evaluate(async () => ({
    key: (await chrome.storage.local.get("key anthropic"))["key anthropic"],
    provider: (await chrome.storage.sync.get("provider")).provider,
  }));
  expect(stored).toEqual({ key: "sk-ant-example", provider: "anthropic" });
});

test("does not save the key when access is refused", async ({
  context,
  worker,
}) => {
  // A key we cannot use is worse than no key: it would look configured and fail later.
  const page = await openSettings(context, worker, { granted: false });
  await page.locator('#providers input[value="anthropic"]').check();

  await page.locator("#key").fill("sk-ant-example");
  await page.locator("#save").click();

  await expect(page.locator("#said")).toContainText("cannot be used");
  const stored = await worker.evaluate(() =>
    chrome.storage.local.get("key anthropic"),
  );
  expect(stored).toEqual({});
});

test("keeps a key per provider, so switching back does not ask again", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);
  await page.locator('#providers input[value="anthropic"]').check();

  await page.locator("#key").fill("sk-ant-example");
  await page.locator("#save").click();
  await expect(page.locator("#said")).toContainText("Saved");

  await page.locator('#providers input[value="openai"]').check();
  await expect(page.locator("#key")).toHaveValue("");
  await expect(page.locator("#get-key")).toHaveAttribute(
    "href",
    /platform\.openai\.com/,
  );

  await page.locator("#key").fill("sk-openai-example");
  await page.locator("#save").click();
  await expect(page.locator("#said")).toContainText("Saved");

  await page.locator('#providers input[value="anthropic"]').check();
  await expect(page.locator("#key")).toHaveValue("sk-ant-example");
});

test("remembers the language, and defaults to staying in English", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);
  // Only the models that write an explanation can translate one.
  await expect(page.locator("#translate")).toBeHidden();
  await page.locator('#providers input[value="anthropic"]').check();
  await expect(page.locator("#language")).toHaveValue("");

  await page.locator("#language").selectOption("Turkish");

  await expect
    .poll(async () =>
      worker.evaluate(async () => (await chrome.storage.sync.get()).language),
    )
    .toBe("Turkish");
});

test("shows the shortcut, which the browser may never have assigned", async ({
  context,
  worker,
}) => {
  const page = await openSettings(context, worker);
  await expect(page.locator("#shortcut")).not.toBeEmpty();
});

test("opens the word log", async ({ context, worker }) => {
  const popup = await context.newPage();
  await popup.goto(new URL("settings.html", worker.url()).href);
  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: "open the log" }).click();
  expect((await opened).url()).toContain("logbook.html");
});
