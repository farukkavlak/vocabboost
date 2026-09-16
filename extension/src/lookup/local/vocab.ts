/**
 * Turns a clicked word into the WordNet senses to put in front of the model. A port of
 * `research/scripts/lookup.py`, tested against its answers.
 *
 * Two things stand between a click and an answer. A word can be part of a phrase —
 * `club` in "club soda" carries none of its own meanings — so the words around it are
 * read first and the longest entry covering it wins. And a word can be inflected: `ran`
 * is not in the dictionary, `run` is.
 */

type Sense = [
  key: string,
  gloss: string,
  examples: string[],
  synonyms: string[],
];

export interface VocabData {
  senses: Sense[];
  /** Lemma, then part of speech, then indexes into `senses`, commonest first. */
  entries: Record<string, Record<string, number[]>>;
  /** WordNet's irregular forms: surface, then part of speech, then lemmas. */
  forms: Record<string, Record<string, string[]>>;
}

export type Pos = "n" | "v" | "a" | "r";

export interface Entry {
  lemma: string;
  senses: Sense[];
}

// NLTK's `_morphy` rules: the ones every labelled word was resolved with.
const MORPHY: Record<Pos, [string, string][]> = {
  n: [
    ["s", ""],
    ["ses", "s"],
    ["ves", "f"],
    ["xes", "x"],
    ["zes", "z"],
    ["ches", "ch"],
    ["shes", "sh"],
    ["men", "man"],
    ["ies", "y"],
  ],
  v: [
    ["s", ""],
    ["ies", "y"],
    ["es", "e"],
    ["es", ""],
    ["ed", "e"],
    ["ed", ""],
    ["ing", "e"],
    ["ing", ""],
  ],
  a: [
    ["er", ""],
    ["est", ""],
    ["er", "e"],
    ["est", "e"],
  ],
  r: [],
};

// The rules phrases were matched with, which are not NLTK's. Longest first.
const PHRASE_HEAD: [string, string][] = [
  ["ies", "y"],
  ["ying", "ie"],
  ["ing", ""],
  ["ing", "e"],
  ["ied", "y"],
  ["ed", ""],
  ["ed", "e"],
  ["es", ""],
  ["s", ""],
];

const LONGEST_PHRASE = 4;

/**
 * Words that sit inside a separable phrasal verb: "check IT out". Only object pronouns;
 * "keep that pace" is not the idiom `keep pace`.
 */
const INFIX = new Set([
  "it",
  "them",
  "him",
  "her",
  "me",
  "us",
  "you",
  "myself",
  "yourself",
  "himself",
  "herself",
  "ourselves",
  "themselves",
  "itself",
]);

/** WordNet's `the boot` and `the street` collide with the plain noun on nearly every line. */
const NOT_A_PHRASE_START = new Set(["the"]);

export const WORD = /[A-Za-z']+/g;

function strip(
  word: string,
  [ending, replacement]: [string, string],
): string[] {
  return word.endsWith(ending)
    ? [word.slice(0, word.length - ending.length) + replacement]
    : [];
}

function exists(data: VocabData, lemma: string, pos: Pos): boolean {
  const entry = data.entries[lemma];
  // WordNet files some adjectives as satellites, `s`; NLTK counts them as `a`.
  return Boolean(entry?.[pos] ?? (pos === "a" ? entry?.s : undefined));
}

/** NLTK's `_morphy`: the irregular list or the rules, once, kept if WordNet has it. */
function morphy(data: VocabData, form: string, pos: Pos): string[] {
  const irregular = data.forms[form]?.[pos];
  const forms = irregular ?? MORPHY[pos].flatMap((rule) => strip(form, rule));
  return [...new Set([form, ...forms])].filter((f) => exists(data, f, pos));
}

/** A single word of a known part of speech, resolved the way NLTK resolved the labels. */
export function sensesOf(data: VocabData, word: string, pos: Pos): Entry {
  const forms = morphy(data, word.toLowerCase(), pos);
  const lemma = forms.reduce(
    (short, form) => (form.length < short.length ? form : short),
    forms[0] ?? word.toLowerCase(),
  );

  const found = new Set<number>();
  for (const form of morphy(data, lemma, pos)) {
    for (const part of pos === "a" ? ["a", "s"] : [pos]) {
      data.entries[form]?.[part]?.forEach((index) => found.add(index));
    }
  }
  return { lemma, senses: [...found].map((index) => data.senses[index]!) };
}

function candidatePhrases(words: string[], index: number): string[][] {
  const found: string[][] = [];
  for (
    let start = Math.max(0, index - LONGEST_PHRASE + 1);
    start <= index;
    start++
  ) {
    const last = Math.min(words.length, start + LONGEST_PHRASE);
    for (let end = index + 1; end <= last; end++) {
      const span = words.slice(start, end);
      if (span.length < 2) {
        continue;
      }
      if (!NOT_A_PHRASE_START.has(span[0]!)) {
        found.push(span);
      }
      // "check it out" is the entry `check out`.
      if (span.length === 3 && INFIX.has(span[1]!)) {
        found.push([span[0]!, span[2]!]);
      }
    }
  }
  // A stable sort, as Python's is.
  return found.sort((a, b) => b.length - a.length);
}

/** The longest phrase entry covering the word at `index`, if there is one. */
export function phraseAt(
  data: VocabData,
  words: string[],
  index: number,
): Entry | null {
  for (const [head, ...rest] of candidatePhrases(words, index)) {
    // The first word carries the inflection: "ran into" is `run into`.
    const irregular = data.forms[head!]?.v ?? [];
    const heads = [
      head!,
      ...irregular,
      ...PHRASE_HEAD.flatMap((rule) => strip(head!, rule)),
      head!,
    ];
    for (const lemma of heads.map((h) => [h, ...rest].join(" "))) {
      const entry = data.entries[lemma];
      const first = entry && Object.values(entry)[0];
      if (first) {
        return { lemma, senses: first.map((i) => data.senses[i]!) };
      }
    }
  }
  return null;
}
