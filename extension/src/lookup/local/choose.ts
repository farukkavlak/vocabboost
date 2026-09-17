/**
 * Ranks the senses of a clicked word by how well they fit its line:
 *
 * 1. a phrase covering the word wins
 * 2. otherwise the word's part of speech in the line picks its senses
 * 3. the model encodes the line and each sense, and the senses are ranked by similarity
 * 4. the scores become probabilities, and the gap between the first two a confidence
 * 5. the answer is confident when that confidence clears the bar
 */

import type { Target } from "../../meaning";
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

// Chosen on the validation words; see research/README.md.
export const CONFIDENT_GAP = 0.081;
const TEMPERATURE = 0.0614;
const GAP_SLOPE = 19.046;
const GAP_INTERCEPT = -0.768;

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
  /** How likely this is the sense the line uses. */
  probability: number;
}

export interface Choice {
  lemma: string;
  /** Unset for a phrase. */
  pos?: Pos;
  /** Every sense, best first. */
  ranked: Ranked[];
  /** How likely the first sense is to be right. */
  confidence: number;
  confident: boolean;
}

export interface Resources {
  vocab: VocabData;
  tagger: TaggerData;
  embed: Embed;
}

/** The position of the `occurrence`-th item equal to `word`, ignoring case, or -1. */
function nthIndex(items: string[], word: string, occurrence: number): number {
  const lower = word.toLowerCase();
  let seen = 0;
  for (const [index, item] of items.entries()) {
    if (item.toLowerCase() === lower && seen++ === occurrence) {
      return index;
    }
  }
  return -1;
}

/** The word's part of speech in the line, if it is one WordNet covers. */
export function partOfSpeech(
  tagger: TaggerData,
  { word, sentence, occurrence }: Target,
): Pos | undefined {
  const tokens = tokenize(sentence);
  const index = nthIndex(tokens, word, occurrence);
  return index < 0 ? undefined : PENN_TO_WORDNET[tag(tagger, tokens)[index]!];
}

/** The phrase or the word's senses to rank, or null when WordNet has neither. */
export function entryFor(
  vocab: VocabData,
  tagger: TaggerData,
  target: Target,
): (Entry & { pos?: Pos }) | null {
  const words = (target.sentence.match(WORD) ?? []).map((w) => w.toLowerCase());
  const index = nthIndex(words, target.word, target.occurrence);
  const phrase = index < 0 ? null : phraseAt(vocab, words, index);
  if (phrase) {
    return phrase;
  }

  const pos = partOfSpeech(tagger, target);
  if (!pos) {
    return null;
  }
  const entry = sensesOf(vocab, target.word, pos);
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

/** The scores as probabilities that sum to one. */
export function probabilities(scores: number[]): number[] {
  const scaled = scores.map((score) => score / TEMPERATURE);
  const top = Math.max(...scaled);
  const weights = scaled.map((x) => Math.exp(x - top));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

/** How likely the first sense is to be right, from how far ahead of the second it is. */
export function confidenceOf(gap: number): number {
  return 1 / (1 + Math.exp(-(GAP_SLOPE * gap + GAP_INTERCEPT)));
}

const CONFIDENT = confidenceOf(CONFIDENT_GAP);

export async function choose(
  { vocab, tagger, embed }: Resources,
  target: Target,
): Promise<Choice | null> {
  const entry = entryFor(vocab, tagger, target);
  if (!entry) {
    return null;
  }

  const [lineVector, ...senseVectors] = await embed([
    lineText(entry.lemma, target.sentence),
    ...entry.synsets.map(senseText),
  ]);
  const scored = entry.synsets
    .map((synset, i) => ({
      ...synset,
      score: dot(senseVectors[i]!, lineVector!),
    }))
    .sort((a, b) => b.score - a.score);
  const odds = probabilities(scored.map(({ score }) => score));
  const ranked = scored.map((sense, i) => ({
    ...sense,
    probability: odds[i]!,
  }));

  const [first, second] = ranked;
  // A single sense needs no choosing.
  const confidence = second ? confidenceOf(first!.score - second.score) : 1;
  return {
    lemma: entry.lemma,
    ...(entry.pos ? { pos: entry.pos } : {}),
    ranked,
    confidence,
    confident: confidence >= CONFIDENT,
  };
}
