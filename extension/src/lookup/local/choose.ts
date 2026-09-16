/**
 * From a clicked word and its line to the senses, ranked, and whether the model is sure.
 * Each step is the one the research measured, in the order it ran there:
 *
 * 1. a phrase covering the word wins — `ran into` is `run into`, not `run`
 * 2. otherwise the line is tagged, and the word's part of speech picks its senses
 * 3. the line and every sense are encoded, and the senses ranked by similarity
 * 4. the card leads with the first only if it is far enough ahead of the second
 */

import { tag, type TaggerData } from "./tagger";
import { tokenize } from "./tokenize";
import {
  WORD,
  phraseAt,
  sensesOf,
  type Entry,
  type Pos,
  type VocabData,
} from "./vocab";

/**
 * The gap between first and second at which a sense the card leads with is right 85% of
 * the time, chosen on the validation words. On the test words it leads on 43.5% of lines
 * and is right on 88.2% of them.
 */
export const THRESHOLD = 0.081;

/** Penn tags to WordNet's parts of speech. Proper nouns are left out, as they were. */
const PARTS: Record<string, Pos> = {
  NN: "n",
  NNS: "n",
  VB: "v",
  VBD: "v",
  VBG: "v",
  VBN: "v",
  VBP: "v",
  VBZ: "v",
  JJ: "a",
  JJR: "a",
  JJS: "a",
  RB: "r",
  RBR: "r",
  RBS: "r",
};

/** Sentences in, one unit-length vector each out. */
export type Embed = (texts: string[]) => Promise<number[][]>;

export interface Choice {
  lemma: string;
  /** Unset for a phrase, whose part of speech was never asked. */
  pos?: Pos;
  /** Every sense, nearest first. */
  ranked: { key: string; gloss: string; examples: string[]; score: number }[];
  /** Whether the first is far enough ahead of the second to lead with. */
  confident: boolean;
}

/** The word's part of speech in this line, or undefined if it is not one WordNet has. */
export function partOfSpeech(
  tagger: TaggerData,
  line: string,
  word: string,
): Pos | undefined {
  const tokens = tokenize(line);
  const at = tokens.findIndex((t) => t.toLowerCase() === word.toLowerCase());
  return at < 0 ? undefined : PARTS[tag(tagger, tokens)[at]!];
}

/** What to rank for the word: a phrase, or the senses of its part of speech. */
export function entryFor(
  vocab: VocabData,
  tagger: TaggerData,
  line: string,
  word: string,
): (Entry & { pos?: Pos }) | null {
  const words = (line.match(WORD) ?? []).map((w) => w.toLowerCase());
  const index = words.indexOf(word.toLowerCase());
  const phrase = index < 0 ? null : phraseAt(vocab, words, index);
  if (phrase) {
    return phrase;
  }

  const pos = partOfSpeech(tagger, line, word);
  if (!pos) {
    return null;
  }
  const entry = sensesOf(vocab, word, pos);
  return entry.senses.length ? { ...entry, pos } : null;
}

export async function choose(
  vocab: VocabData,
  tagger: TaggerData,
  embed: Embed,
  line: string,
  word: string,
): Promise<Choice | null> {
  const entry = entryFor(vocab, tagger, line, word);
  if (!entry) {
    return null;
  }

  // Written exactly as the model was trained on them.
  const [lineVector, ...senseVectors] = await embed([
    `${entry.lemma}: ${line}`,
    ...entry.senses.map(
      ([, gloss, examples, synonyms]) =>
        `${synonyms.join(", ")}: ${[gloss, ...examples].join(" ")}`,
    ),
  ]);
  const ranked = entry.senses
    .map(([key, gloss, examples], i) => ({
      key,
      gloss,
      examples,
      // Both are unit length, so the dot product is the cosine.
      score: senseVectors[i]!.reduce(
        (sum, x, j) => sum + x * lineVector![j]!,
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const gap =
    ranked.length > 1 ? ranked[0]!.score - ranked[1]!.score : Infinity;
  return {
    lemma: entry.lemma,
    ...(entry.pos ? { pos: entry.pos } : {}),
    ranked,
    confident: gap >= THRESHOLD,
  };
}
