import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { test, expect } from "@playwright/test";
import { choose, entryFor } from "../extension/src/lookup/local/choose";
import type { TaggerData } from "../extension/src/lookup/local/tagger";
import type { Pos, VocabData } from "../extension/src/lookup/local/vocab";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(here, path), "utf8")) as T;

interface Line {
  text: string;
  part: string;
  label: string | null;
  word: string;
  occurrence: number;
  pos?: Pos;
  lemma: string;
  senses: string[];
}

const lines = read<Line[]>("fixtures/lookups.json");
const vocab = read<VocabData>("../extension/public/vocab.json");
const tagger = read<TaggerData>("../extension/public/tagger.json");

// The research tagged these after splitting sentences with NLTK's Punkt; the port's
// simpler split gives the word a different tag.
const SPLIT_DIFFERS = [
  "reading in See if F.U.D.D.'s reading it too.",
  "got in He got on his horse and he rode over there... and he got off, and he walked as far as he could one way.",
];

const target = ({ word, text, occurrence }: Line) => ({
  word,
  sentence: text,
  occurrence,
});

test("puts the senses the research measured in front of the model", () => {
  const wrong = lines.filter((line) => {
    const entry = entryFor(vocab, tagger, target(line));
    const keys = (entry?.synsets ?? []).map(({ key }) => key).sort();
    return (
      entry?.lemma !== line.lemma ||
      entry.pos !== line.pos ||
      keys.join(" ") !== [...line.senses].sort().join(" ")
    );
  });
  expect(wrong.map((line) => `${line.word} in ${line.text}`)).toEqual(
    SPLIT_DIFFERS,
  );
});

// The exported model is not in the repository; `make onnx` in research/ writes it.
const model = join(here, "../research/data/onnx");

test("scores the test lines as the research did", async () => {
  test.skip(!existsSync(model), "no exported model in research/data/onnx");
  test.setTimeout(300_000);

  const extract = await pipeline("feature-extraction", model, {
    // Full precision, so the chain is what is tested. The 8-bit copy scores differently
    // in each runtime — 68.0% in Python, 68.9% in Chrome, 66.5% here — because each
    // rounds its integer arithmetic its own way; Chrome is the one that ships.
    dtype: "fp32",
    local_files_only: true,
  });
  const embed = async (texts: string[]) =>
    (
      await extract(texts, { pooling: "mean", normalize: true })
    ).tolist() as number[][];

  const scored = lines.filter((line) => line.part === "test" && line.label);
  let right = 0;
  let led = 0;
  let ledRight = 0;
  for (const line of scored) {
    const choice = await choose({ vocab, tagger, embed }, target(line));
    const hit = choice?.ranked[0]?.key === line.label;
    right += Number(hit);
    if (choice?.confident) {
      led += 1;
      ledRight += Number(hit);
    }
  }

  // Measured in Python: 69.2% first, 283 of 409.
  console.log(
    `${scored.length} lines, first ${((100 * right) / scored.length).toFixed(1)}%,` +
      ` leads on ${((100 * led) / scored.length).toFixed(1)}%,` +
      ` right there ${((100 * ledRight) / led).toFixed(1)}%`,
  );
  expect(right).toBe(283);
  expect(ledRight / led).toBeGreaterThan(0.85);
});
