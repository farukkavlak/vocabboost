/**
 * The word log: every successful lookup, with the line and the moment it came from. Kept
 * in `storage.local` on the reader's machine and never sent anywhere.
 */

import type { Sense } from "../meaning";

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

const KEY = "logbook";

export async function readLog(): Promise<LogEntry[]> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(KEY);
  return (stored[KEY] as LogEntry[] | undefined) ?? [];
}

async function writeLog(entries: LogEntry[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: entries });
}

const sameLookup = (a: NewEntry, b: NewEntry): boolean =>
  a.headword.toLowerCase() === b.headword.toLowerCase() &&
  a.line === b.line &&
  a.moment.url === b.moment.url;

/** Adds a lookup, or moves an identical earlier one to the top. Newest first. */
export async function logLookup(entry: NewEntry): Promise<void> {
  const entries = await readLog();
  const earlier = entries.find((old) => sameLookup(old, entry));
  const kept = entries.filter((old) => old !== earlier);
  const saved: LogEntry = {
    ...entry,
    id: earlier?.id ?? crypto.randomUUID(),
    savedAt: Date.now(),
    ...(earlier?.chosen !== undefined ? { chosen: earlier.chosen } : {}),
  };
  await writeLog([saved, ...kept]);
}

export async function removeEntry(id: string): Promise<void> {
  await writeLog((await readLog()).filter((entry) => entry.id !== id));
}

export async function chooseSense(id: string, index: number): Promise<void> {
  const entries = await readLog();
  await writeLog(
    entries.map((entry) =>
      entry.id === id ? { ...entry, chosen: index } : entry,
    ),
  );
}
