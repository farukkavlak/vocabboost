/**
 * A port of NLTK's averaged perceptron tagger. Each tag scores the sum of the weights of
 * the features that fire for a word (its suffix, its neighbours, the previous tags), and
 * the highest score wins. The weights come from NLTK in `tagger.json`.
 */

export interface TaggerData {
  /** Feature → tag → weight. */
  weights: Record<string, Record<string, number>>;
  /** Words that always take the same tag. */
  tagdict: Record<string, string>;
  classes: string[];
}

const START = ["-START-", "-START2-"];
const END = ["-END-", "-END2-"];

function normalize(word: string): string {
  if (word.includes("-") && !word.startsWith("-")) {
    return "!HYPHEN";
  }
  if (/^\d{4}$/.test(word)) {
    return "!YEAR";
  }
  if (/^\d/.test(word)) {
    return "!DIGITS";
  }
  return word.toLowerCase();
}

function features(
  word: string,
  context: string[],
  i: number,
  prev: string,
  prev2: string,
): string[] {
  const at = (offset: number): string => context[i + offset] ?? "";
  return [
    "bias",
    `i suffix ${word.slice(-3)}`,
    `i pref1 ${word.slice(0, 1)}`,
    `i-1 tag ${prev}`,
    `i-2 tag ${prev2}`,
    `i tag+i-2 tag ${prev} ${prev2}`,
    `i word ${at(0)}`,
    `i-1 tag+i word ${prev} ${at(0)}`,
    `i-1 word ${at(-1)}`,
    `i-1 suffix ${at(-1).slice(-3)}`,
    `i-2 word ${at(-2)}`,
    `i+1 word ${at(1)}`,
    `i+1 suffix ${at(1).slice(-3)}`,
    `i+2 word ${at(2)}`,
  ];
}

function predict(data: TaggerData, fired: string[]): string {
  const scores = new Map<string, number>();
  for (const feature of fired) {
    for (const [tag, weight] of Object.entries(data.weights[feature] ?? {})) {
      scores.set(tag, (scores.get(tag) ?? 0) + weight);
    }
  }

  // Ties go to the tag that sorts last, as in NLTK.
  let best = "";
  let bestScore = -Infinity;
  for (const tag of data.classes) {
    const score = scores.get(tag) ?? 0;
    if (score > bestScore || (score === bestScore && tag > best)) {
      best = tag;
      bestScore = score;
    }
  }
  return best;
}

export function tag(data: TaggerData, tokens: string[]): string[] {
  const context = [...START, ...tokens.map(normalize), ...END];
  let [prev, prev2] = START as [string, string];
  return tokens.map((word, index) => {
    const found =
      data.tagdict[word] ??
      predict(data, features(word, context, index + START.length, prev, prev2));
    prev2 = prev;
    prev = found;
    return found;
  });
}
