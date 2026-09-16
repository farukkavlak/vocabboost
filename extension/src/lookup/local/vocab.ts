/**
 * Finds the WordNet senses for a clicked word: the phrase it belongs to, or its own
 * senses once inflections are undone. A port of `research/scripts/lookup.py`; the tests
 * check both give the same answers.
 */

export type Pos = "n" | "v" | "a" | "r";

export interface Synset {
  key: string;
  gloss: string;
  examples: string[];
  synonyms: string[];
}

export interface Entry {
  lemma: string;
  synsets: Synset[];
}

/** The shape of `vocab.json`. Synsets are rows rather than objects to keep the file small. */
export interface VocabData {
  synsets: [
    key: string,
    gloss: string,
    examples: string[],
    synonyms: string[],
  ][];
  /** Lemma → part of speech → indexes into `synsets`, commonest first. */
  entries: Record<string, Record<string, number[]>>;
  /** WordNet's irregular forms: surface → part of speech → lemmas. */
  forms: Record<string, Record<string, string[]>>;
}

type Rule = [suffix: string, replacement: string];

/** NLTK's `morphy` rules, which resolved every labelled word. */
const MORPHY: Record<Pos, Rule[]> = {
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

/** The rules phrase heads were matched with in the research, which are not NLTK's. */
const PHRASE_HEAD: Rule[] = [
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

/** Object pronouns allowed inside a phrasal verb: "check it out" is `check out`. */
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

/** `the boot`, `the street`: WordNet idioms that clash with the plain noun. */
const NOT_A_PHRASE_START = new Set(["the"]);

export const WORD = /[A-Za-z']+/g;

function synset(data: VocabData, index: number): Synset {
  const [key, gloss, examples, synonyms] = data.synsets[index]!;
  return { key, gloss, examples, synonyms };
}

function applyRules(word: string, rules: Rule[]): string[] {
  return rules
    .filter(([suffix]) => word.endsWith(suffix))
    .map(
      ([suffix, replacement]) => word.slice(0, -suffix.length) + replacement,
    );
}

/** WordNet files some adjectives as satellites (`s`); NLTK counts them as `a`. */
function parts(pos: Pos): string[] {
  return pos === "a" ? ["a", "s"] : [pos];
}

function exists(data: VocabData, lemma: string, pos: Pos): boolean {
  return parts(pos).some((part) => data.entries[lemma]?.[part]);
}

/** NLTK's `morphy`: the word and its base forms that WordNet has. */
function baseForms(data: VocabData, word: string, pos: Pos): string[] {
  const forms = data.forms[word]?.[pos] ?? applyRules(word, MORPHY[pos]);
  return [...new Set([word, ...forms])].filter((form) =>
    exists(data, form, pos),
  );
}

/** A single word, resolved as NLTK's lemmatizer and `wn.synsets` resolve it. */
export function sensesOf(data: VocabData, word: string, pos: Pos): Entry {
  const lower = word.toLowerCase();
  const forms = baseForms(data, lower, pos);
  const lemma = forms.reduce(
    (shortest, form) => (form.length < shortest.length ? form : shortest),
    forms[0] ?? lower,
  );

  const indexes = new Set<number>();
  for (const form of baseForms(data, lemma, pos)) {
    for (const part of parts(pos)) {
      data.entries[form]?.[part]?.forEach((index) => indexes.add(index));
    }
  }
  return {
    lemma,
    synsets: [...indexes].map((index) => synset(data, index)),
  };
}

/** Every span of up to four words around `index`, longest first. */
function candidatePhrases(words: string[], index: number): string[][] {
  const found: string[][] = [];
  const firstStart = Math.max(0, index - LONGEST_PHRASE + 1);
  for (let start = firstStart; start <= index; start++) {
    const lastEnd = Math.min(words.length, start + LONGEST_PHRASE);
    for (let end = index + 1; end <= lastEnd; end++) {
      const span = words.slice(start, end);
      if (span.length < 2) {
        continue;
      }
      if (!NOT_A_PHRASE_START.has(span[0]!)) {
        found.push(span);
      }
      if (span.length === 3 && INFIX.has(span[1]!)) {
        found.push([span[0]!, span[2]!]);
      }
    }
  }
  return found.sort((a, b) => b.length - a.length);
}

/** The longest phrase covering the word at `index`, if WordNet has one. */
export function phraseAt(
  data: VocabData,
  words: string[],
  index: number,
): Entry | null {
  for (const [head, ...rest] of candidatePhrases(words, index)) {
    // Only the first word is inflected: "ran into" is `run into`.
    const heads = [
      head!,
      ...(data.forms[head!]?.v ?? []),
      ...applyRules(head!, PHRASE_HEAD),
    ];
    for (const lemma of heads.map((h) => [h, ...rest].join(" "))) {
      const entry = data.entries[lemma];
      const indexes = entry && Object.values(entry)[0];
      if (indexes) {
        return {
          lemma,
          synsets: indexes.map((index) => synset(data, index)),
        };
      }
    }
  }
  return null;
}
