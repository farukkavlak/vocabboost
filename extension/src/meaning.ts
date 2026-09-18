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
  /** Local model only: how likely the first sense is to be right. */
  confidence?: number;
  /** Local model only: the remaining senses, folded away on the card. */
  others?: Sense[];
  /** Provider models only. */
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** Provider models only, when the reader chose a language. */
  translation?: string;
  /** Why the answer is not from the model the reader chose. */
  note?: string;
}

export interface Cacheable {
  readonly id: string;
  /** Bumped when the same provider starts answering differently. */
  readonly version: number;
  /** Whether answers depend on the line, and so are cached per line. */
  readonly usesSentence: boolean;
}

/** What a keyed provider needs beyond the word: the reader's key and preferences. */
export interface Ask {
  key: string;
  /** Set when the reader asked for a translation. */
  language?: string | undefined;
}

export interface MeaningProvider extends Cacheable {
  /** The name shown to the reader. */
  readonly label: string;
  /** What the card gets beyond the sense, for the settings page to say. */
  readonly explains: boolean;
  /** Unset for the built-in model, which needs neither a key nor a host. */
  readonly keyUrl?: string;
  readonly origin?: string;
  lookup(target: Target, ask: Ask): Promise<Meaning>;
}

/** An error whose message is meant for the reader. */
export class LookupError extends Error {}
