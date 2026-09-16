// Runs the shipped extension on the comparison lines and writes its answers for
// `make comparison`. Only with `npm run test:comparison`; SET=sealed also needs
// OPEN_SEALED=1, since the sealed lines are opened once.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./fixture";
import type { ChooseResult } from "../extension/src/messages";
import type { Target } from "../extension/src/meaning";

const here = dirname(fileURLToPath(import.meta.url));
const set = process.env.SET ?? "working";
const folder = join(here, "../research/data/comparison");

test("@comparison the extension answers the comparison lines", async ({
  worker,
}) => {
  test.skip(
    set === "sealed" && process.env.OPEN_SEALED !== "1",
    "the sealed set is opened once, with OPEN_SEALED=1",
  );
  test.setTimeout(600_000);

  const lines = readFileSync(join(folder, `${set}-lines.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Target & { id: number });

  const answers = await worker.evaluate(async (targets) => {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "comparison",
    });
    const out = [];
    for (const { id, word, sentence, occurrence } of targets) {
      const start = performance.now();
      const result: ChooseResult = await chrome.runtime.sendMessage({
        type: "CHOOSE_SENSE",
        to: "offscreen",
        word,
        sentence,
        occurrence,
      });
      const ms = performance.now() - start;
      const choice = result.ok ? result.choice : null;
      out.push({
        id,
        ms,
        confident: choice?.confident ?? false,
        ranked: (choice?.ranked ?? []).slice(0, 5).map((sense) => sense.key),
      });
    }
    return out;
  }, lines);

  writeFileSync(
    join(folder, `${set}-extension.jsonl`),
    answers.map((answer) => JSON.stringify(answer)).join("\n") + "\n",
  );
});
