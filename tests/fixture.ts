import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(here, "../extension/dist");

export const test = base.extend<{ context: BrowserContext; worker: Worker }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
      ],
      // Only for `npm run recording`, which turns the result into the README's animation.
      ...(process.env.RECORD
        ? {
            recordVideo: {
              dir: process.env.RECORD,
              size: { width: 1280, height: 720 },
            },
          }
        : {}),
    });
    await use(context);
    await context.close();
  },

  // The extension's service worker. Tests drive it directly because a keyboard
  // shortcut registered through chrome.commands cannot be triggered from Playwright.
  worker: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
});

export const expect = test.expect;

const PLATFORMS = {
  youtube: {
    url: "https://www.youtube.com/watch?v=test",
    pattern: "https://www.youtube.com/**",
    fixture: "fixtures/youtube.html",
  },
  netflix: {
    url: "https://www.netflix.com/watch/12345",
    pattern: "https://www.netflix.com/**",
    fixture: "fixtures/netflix.html",
  },
  prime: {
    url: "https://www.primevideo.com/detail/0PYX2Q4NVYSYMVUZJHDR5QEO70",
    pattern: "https://www.primevideo.com/**",
    fixture: "fixtures/prime.html",
  },
};

/**
 * What the shipped model answers first for "run" in "he had to run the department". Not
 * a stub: lookups run the real model, so a change to it shows up here.
 */
export const RUN = "direct or control; projects, businesses, etc.";

interface WatchOptions {
  platform?: keyof typeof PLATFORMS;
}

/**
 * A watch page with the extension on it, served under the platform's own URL so the
 * manifest's match pattern applies and the content script is injected as in production.
 */
export async function watchPage(
  context: BrowserContext,
  { platform = "youtube" }: WatchOptions = {},
): Promise<Page> {
  const { url, pattern, fixture } = PLATFORMS[platform];
  const html = readFileSync(resolve(here, fixture), "utf8");

  await context.route(pattern, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

/**
 * Required before measuring anything: a rect read mid-animation is where the animation
 * has it, not where it was placed.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = document.getElementById("vocab-root")?.shadowRoot;
    const running = [...(root?.querySelectorAll("*") ?? [])].flatMap(
      (element) => element.getAnimations(),
    );
    await Promise.all(running.map((animation) => animation.finished));
  });
}

/** Starts the video and waits for it to actually be playing. */
export async function play(page: Page): Promise<void> {
  await page.evaluate(() => window.player.play());
  await expect
    .poll(() => page.evaluate(() => window.player.paused))
    .toBe(false);
}

export async function lookup(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.tabs.sendMessage(tab.id, { type: "LOOKUP_SUBTITLE" });
  });
}
