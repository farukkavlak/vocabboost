import type { Meaning, Sense, Target } from "../meaning";

/** Where a lookup happened. */
export interface Moment {
  /** The caption source's id, such as "youtube". */
  platform: string;
  title: string;
  url: string;
  /** Position in the video, in seconds. */
  seconds: number;
}

export interface LogEntry {
  /** Stable per lookup, so looking the same word up again updates one entry. */
  id: string;
  savedAt: number;
  /** The clicked word, or the phrase it belongs to. */
  headword: string;
  /** The word as clicked, and which of its occurrences in the line. */
  word: string;
  occurrence: number;
  partOfSpeech?: string;
  /** The senses the card showed, best first. */
  senses: Sense[];
  /** False when the model could not tell which of `senses` the line uses. */
  confident: boolean;
  /** For an unsure entry: the sense the reader marked as right, by index. */
  chosen?: number;
  line: string;
  previous?: string;
  moment: Moment;
}

export type NewEntry = Omit<LogEntry, "id" | "savedAt" | "chosen">;

/** A finished lookup, as the log keeps it. */
export function newEntry(
  target: Target,
  meaning: Meaning,
  moment: Moment,
  previous?: string,
): NewEntry {
  return {
    headword: meaning.phrase ?? target.word,
    word: target.word,
    occurrence: target.occurrence,
    ...(meaning.partOfSpeech ? { partOfSpeech: meaning.partOfSpeech } : {}),
    senses: meaning.senses,
    confident: meaning.confident !== false,
    line: target.sentence,
    ...(previous ? { previous } : {}),
    moment,
  };
}

function youtubeId(url: string): string | null {
  return new URL(url).searchParams.get("v");
}

/** The same for every lookup in one video, whatever the time in its URL. */
export function videoKey({ platform, url }: Moment): string {
  const id = platform === "youtube" ? youtubeId(url) : null;
  return id ? `youtube ${id}` : `${platform} ${url.split(/[?#]/)[0]}`;
}

export function entryId(entry: NewEntry): string {
  return [
    videoKey(entry.moment),
    entry.headword.toLowerCase(),
    entry.line,
  ].join("\n");
}

/** A link to the moment, where the platform takes a start time in its URL. */
export function momentUrl({ platform, url, seconds }: Moment): string | null {
  const id = platform === "youtube" ? youtubeId(url) : null;
  if (!id) {
    return null;
  }
  const link = new URL("https://www.youtube.com/watch");
  link.searchParams.set("v", id);
  link.searchParams.set("t", `${seconds}s`);
  return link.href;
}
