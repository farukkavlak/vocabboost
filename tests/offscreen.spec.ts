import { test, expect } from "./fixture";
import type { ChooseResult } from "../extension/src/messages";

// The model, the tagger and the vocabulary, loaded in the extension's offscreen page
// and asked from the worker, with the network off.
test("chooses a sense offline in the offscreen page", async ({
  context,
  worker,
}) => {
  test.setTimeout(120_000);
  await context.setOffline(true);

  const result = await worker.evaluate(async () => {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "test",
    });
    const started = performance.now();
    const first: ChooseResult = await chrome.runtime.sendMessage({
      type: "CHOOSE_SENSE",
      target: "offscreen",
      word: "safes",
      sentence: "Wall safes went out with vaudeville.",
    });
    const cold = performance.now() - started;
    const again = performance.now();
    const second: ChooseResult = await chrome.runtime.sendMessage({
      type: "CHOOSE_SENSE",
      target: "offscreen",
      word: "ran",
      sentence: "I ran into him at the store.",
    });
    return { first, second, cold, warm: performance.now() - again };
  });

  console.log(
    `first answer ${Math.round(result.cold)} ms, the next ${Math.round(result.warm)} ms`,
  );
  expect(result.first.ok && result.first.choice?.ranked[0]?.key).toBe(
    "safe.n.01",
  );
  expect(result.second.ok && result.second.choice?.lemma).toBe("run into");
});
