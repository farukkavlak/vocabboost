import { test, lookup, watchPage } from "./fixture";

/**
 * Plays the flow once, slowly enough to read, so `npm run recording` can turn it into
 * the animation in the README. Asserts nothing.
 */
const ANSWER = {
  definition: "without anyone helping him, for the whole of that year",
  partOfSpeech: "adverb",
  cefr: "A2",
  phrase: "",
};

test("@shots the flow, end to end", async ({ context, worker }) => {
  const page = await watchPage(context);

  await context.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(ANSWER) }],
      }),
    }),
  );
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ "key anthropic": "sk-test" });
    await chrome.storage.sync.set({ provider: "anthropic" });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addStyleTag({
    content: `
      video { width: 1280px; height: 720px; object-fit: cover;
        background: linear-gradient(160deg,#3a4a63 0%,#6b7f96 40%,#c9b79c 75%,#8a6f4e 100%); }
      body { background: #000 }
      .caption-window { bottom: 90px; font: 400 28px/1.35 "Roboto", system-ui, sans-serif; }
      .ytp-caption-segment { background: rgba(8,8,8,0.75); padding: 2px 6px; }
    `,
  });

  // A playing <video> paints its own frames over any CSS background, and the fixture's
  // canvas is black. Give it something to show instead.
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const paint = canvas.getContext("2d")!;
    const sky = paint.createLinearGradient(0, 0, 1280, 720);
    sky.addColorStop(0, "#3a4a63");
    sky.addColorStop(0.4, "#6b7f96");
    sky.addColorStop(0.75, "#c9b79c");
    sky.addColorStop(1, "#8a6f4e");
    paint.fillStyle = sky;
    paint.fillRect(0, 0, 1280, 720);

    window.player.srcObject = canvas.captureStream(12);
    void window.player.play();
  });
  await page.evaluate(() => window.showCaption(["he had to run the whole"]));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.showCaption(["department alone this year"]));
  await page.waitForTimeout(1600);

  await lookup(worker);
  await page.waitForTimeout(1600);

  const word = page.getByRole("button", { name: "alone", exact: true });
  await word.hover();
  await page.waitForTimeout(900);
  await word.click();
  await page.waitForTimeout(2200);

  await page.locator("#vocab-meaning .ask").click();
  await page.waitForTimeout(2600);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  await page.close();
});
