import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  WORD,
  phraseAt,
  sensesOf,
  type Pos,
  type VocabData,
} from "../extension/src/lookup/local/vocab";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(here, path), "utf8")) as T;

interface Line {
  text: string;
  /** The phrase `lookup.py` finds at each word of the line, or null. */
  phrases: (string | null)[];
  part: "validation" | "test" | "train";
  /** The right sense where all five panel models agreed. */
  label: string | null;
  word: string;
  /** Unset on phrase lines. */
  pos?: Pos;
  lemma: string;
  senses: string[];
}

// Written by `make vocab-json` from `lookup.py`: the lines of the validation and test
// words, and every line that is a phrase.
const lines = read<Line[]>("fixtures/lookups.json");
const data = read<VocabData>("../extension/public/vocab.json");

test("finds the senses lookup.py finds for every single word", () => {
  const wrong = lines
    .filter((line) => line.pos)
    .filter((line) => {
      const found = sensesOf(data, line.word, line.pos!);
      return (
        found.lemma !== line.lemma ||
        found.synsets.map(({ key }) => key).join(" ") !== line.senses.join(" ")
      );
    });
  expect(wrong.map((line) => `${line.word} in ${line.text}`)).toEqual([]);
});

test("finds the phrase lookup.py finds at every word", () => {
  const wrong = lines.filter((line) => {
    const words = (line.text.match(WORD) ?? []).map((w) => w.toLowerCase());
    const found = words.map((_, i) => phraseAt(data, words, i)?.lemma ?? null);
    return found.join("|") !== line.phrases.join("|");
  });
  expect(wrong.map((line) => line.text)).toEqual([]);
});
