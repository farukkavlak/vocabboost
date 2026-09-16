/** A clicked word: the word, its line, and which of its occurrences in the line. */
export interface Target {
  word: string;
  sentence: string;
  occurrence: number;
}

export interface Sense {
  definition: string;
  example?: string;
}

/** What the card shows for a word, from the local model or a provider's model. */
export interface Meaning {
  /** Best first. */
  senses: Sense[];
  partOfSpeech?: string;
  /** The idiom or phrasal verb the word belongs to. */
  phrase?: string;
  /** Local model only: false when the line does not settle which sense it is. */
  confident?: boolean;
  /** Local model only: the remaining senses, folded away on the card. */
  others?: Sense[];
  /** Provider models only. */
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** Provider models only, when the reader chose a language. */
  translation?: string;
}

export interface Cacheable {
  readonly id: string;
  /** Whether answers depend on the line, and so are cached per line. */
  readonly usesSentence: boolean;
}

export interface MeaningProvider extends Cacheable {
  lookup(target: Target): Promise<Meaning>;
}

/** An error whose message is meant for the reader. */
export class LookupError extends Error {}
