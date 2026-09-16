export interface Sense {
  definition: string;
  example?: string;
}

export interface Meaning {
  /** Several from the dictionary, which cannot know which one the line used; one from the model. */
  senses: Sense[];
  partOfSpeech?: string;
  /** IPA. */
  phonetic?: string;
  audio?: string;
  /** Set when the word belongs to an idiom or phrasal verb. */
  phrase?: string;
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  translation?: string;
  /**
   * From the local model: whether the first sense is far enough ahead to lead with.
   * When it is not, the senses are the likeliest few, and the line does not settle it.
   */
  confident?: boolean;
  /** Senses left out of `senses`, a click away. */
  more?: number;
}

/** Enough of a provider to key its answers by. */
export interface Cacheable {
  readonly id: string;
  /** Whether the answer depends on the line, and so whether the cache is keyed by it. */
  readonly usesSentence: boolean;
}

export interface MeaningProvider extends Cacheable {
  lookup(word: string, sentence: string): Promise<Meaning>;
}

/** An error whose message is written for the reader rather than for a console. */
export class LookupError extends Error {}
