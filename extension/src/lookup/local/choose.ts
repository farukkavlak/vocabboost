/**
 * Ranks the senses of a clicked word by how well they fit its line:
 *
 * 1. a phrase covering the word wins
 * 2. otherwise the word's part of speech in the line picks its senses
 * 3. the model encodes the line and each sense, and the senses are ranked by similarity
 * 4. the answer is confident when the first is far enough ahead of the second
 */

import { tag, type TaggerData } from "./tagger";
import { tokenize } from "./tokenize";
import {
  WORD,
  phraseAt,
  sensesOf,
  type Entry,
  type Pos,
  type Synset,
  type VocabData,
} from "./vocab";

/** Chosen on the validation words; see research/README.md. */
export const CONFIDENT_GAP = 0.081;

const PENN_TO_WORDNET: Record<string, Pos> = {
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

/** Texts in, one unit-length vector per text out. */
export type Embed = (texts: string[]) => Promise<number[][]>;

export interface Ranked extends Synset {
  score: number;
}

export interface Choice {
  lemma: string;
  /** Unset for a phrase. */
  pos?: Pos;
  /** Every sense, best first. */
  ranked: Ranked[];
  confident: boolean;
}

export interface Resources {
  vocab: VocabData;
  tagger: TaggerData;
  embed: Embed;
}

/** The word's part of speech in the line, if it is one WordNet covers. */
export function partOfSpeech(
  tagger: TaggerData,
  line: string,
  word: string,
): Pos | undefined {
  const tokens = tokenize(line);
  const index = tokens.findIndex(
    (token) => token.toLowerCase() === word.toLowerCase(),
  );
  return index < 0 ? undefined : PENN_TO_WORDNET[tag(tagger, tokens)[index]!];
}

/** The phrase or the word's senses to rank, or null when WordNet has neither. */
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
  return entry.synsets.length ? { ...entry, pos } : null;
}

// The two texts are written as the model saw them in training (research/kaggle/run.py).
const lineText = (lemma: string, line: string): string => `${lemma}: ${line}`;
const senseText = (synset: Synset): string =>
  `${synset.synonyms.join(", ")}: ${[synset.gloss, ...synset.examples].join(" ")}`;

/** Vectors are unit length, so the dot product is the cosine similarity. */
function dot(a: number[], b: number[]): number {
  return a.reduce((sum, x, i) => sum + x * b[i]!, 0);
}

export async function choose(
  { vocab, tagger, embed }: Resources,
  line: string,
  word: string,
): Promise<Choice | null> {
  const entry = entryFor(vocab, tagger, line, word);
  if (!entry) {
    return null;
  }

  const [lineVector, ...senseVectors] = await embed([
    lineText(entry.lemma, line),
    ...entry.synsets.map(senseText),
  ]);
  const ranked = entry.synsets
    .map((synset, i) => ({
      ...synset,
      score: dot(senseVectors[i]!, lineVector!),
    }))
    .sort((a, b) => b.score - a.score);

  const [first, second] = ranked;
  const confident = !second || first!.score - second.score >= CONFIDENT_GAP;
  return {
    lemma: entry.lemma,
    ...(entry.pos ? { pos: entry.pos } : {}),
    ranked,
    confident,
  };
}
