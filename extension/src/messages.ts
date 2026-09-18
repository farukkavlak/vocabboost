import type { NewEntry } from "./logbook/entry";
import type { Choice } from "./lookup/local/choose";
import type { Entry } from "./lookup/local/vocab";
import type { Meaning, Target } from "./meaning";

export interface LookupSubtitle {
  type: "LOOKUP_SUBTITLE";
}

export interface LookupWord extends Target {
  type: "LOOKUP_WORD";
}

/** From the offscreen page when it has been idle long enough to close. */
export interface OffscreenIdle {
  type: "OFFSCREEN_IDLE";
}

/** A finished lookup, for the word log. The worker writes it. */
export interface LogLookup {
  type: "LOG_LOOKUP";
  entry: NewEntry;
}

export type Message = LookupSubtitle | LookupWord | OffscreenIdle | LogLookup;

/**
 * From the worker to the offscreen page, which holds the dictionary and the model;
 * `to` tells the other listeners to ignore it.
 *
 * `CHOOSE_SENSE` runs the model and ranks the senses. `SENSE_CANDIDATES` only looks the
 * word up in the dictionary, which a provider that picks for itself needs, and leaves
 * the model unloaded.
 */
export interface AskOffscreen extends Target {
  type: "CHOOSE_SENSE" | "SENSE_CANDIDATES";
  to: "offscreen";
}

/** `error` is for the console. */
export type ChooseResult =
  { ok: true; choice: Choice | null } | { ok: false; error: string };

/** The word's senses, in the dictionary's order, or null when it has none. */
export type CandidatesResult =
  { ok: true; entry: Candidates | null } | { ok: false; error: string };

export interface Candidates extends Entry {
  /** Unset for a phrase. */
  pos?: string;
}

/** `message` is set only when it is meant for the reader; see `LookupError`. */
export type LookupResult =
  { ok: true; meaning: Meaning } | { ok: false; message?: string };
