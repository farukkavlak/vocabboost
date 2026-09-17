import type { NewEntry } from "./logbook/entry";
import type { Choice } from "./lookup/local/choose";
import type { Meaning, Target } from "./meaning";

export interface LookupSubtitle {
  type: "LOOKUP_SUBTITLE";
}

export interface LookupWord extends Target {
  type: "LOOKUP_WORD";
}

/** The same word, asked of the reader's provider. */
export interface ExplainWord extends Target {
  type: "EXPLAIN_WORD";
}

/** Whether a provider key has been entered, so the card can offer the second step. */
export interface ModelReady {
  type: "MODEL_READY";
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

export type Message =
  | LookupSubtitle
  | LookupWord
  | ExplainWord
  | ModelReady
  | OffscreenIdle
  | LogLookup;

/** From the worker to the offscreen page; `to` tells the other listeners to ignore it. */
export interface ChooseSense extends Target {
  type: "CHOOSE_SENSE";
  to: "offscreen";
}

/** `error` is for the console. */
export type ChooseResult =
  { ok: true; choice: Choice | null } | { ok: false; error: string };

/** `message` is set only when it is meant for the reader; see `LookupError`. */
export type LookupResult =
  { ok: true; meaning: Meaning } | { ok: false; message?: string };
