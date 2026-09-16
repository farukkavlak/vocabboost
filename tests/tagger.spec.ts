import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { tag, type TaggerData } from "../extension/src/lookup/local/tagger";
import { tokenize } from "../extension/src/lookup/local/tokenize";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(here, path), "utf8")) as T;

interface Line {
  text: string;
  tokens: string[];
  tags: string[];
}

// Written by `make tagger` from NLTK itself: the lines of the validation and test words,
// with the tokens and tags Python gives them. The model's scores were measured on those.
const lines = read<Line[]>("fixtures/tags.json");
const data = read<TaggerData>("../extension/public/tagger.json");

test("splits every line into the tokens NLTK does", () => {
  const wrong = lines.filter(
    (line) => tokenize(line.text).join("") !== line.tokens.join(""),
  );
  expect(wrong.map((line) => line.text)).toEqual([]);
});

test("tags every token as NLTK does", () => {
  const wrong = lines.filter(
    (line) => tag(data, line.tokens).join(" ") !== line.tags.join(" "),
  );
  expect(wrong.map((line) => line.text)).toEqual([]);
});
