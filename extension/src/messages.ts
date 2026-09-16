import type { Choice } from "./lookup/local/choose";
import type { Meaning } from "./meaning";

export interface LookupSubtitle {
  type: "LOOKUP_SUBTITLE";
}

export interface LookupWord {
  type: "LOOKUP_WORD";
  word: string;
  sentence: string;
}

/** The same word, asked of the model with the line it appeared in. */
export interface ExplainWord {
  type: "EXPLAIN_WORD";
  word: string;
  sentence: string;
}

/** Whether a model key has been entered, which decides if the card offers the step. */
export interface ModelReady {
  type: "MODEL_READY";
}

/** Sent by the offscreen page when nobody has asked it anything for a while. */
export interface OffscreenIdle {
  type: "OFFSCREEN_IDLE";
}

export type Message =
  LookupSubtitle | LookupWord | ExplainWord | ModelReady | OffscreenIdle;

/**
 * From the worker to the offscreen page only. Every extension page hears every runtime
 * message, so the target says who should answer.
 */
export interface ChooseSense {
  type: "CHOOSE_SENSE";
  target: "offscreen";
  word: string;
  sentence: string;
}

/** `error` is for the console, not the reader. */
export type ChooseResult =
  { ok: true; choice: Choice | null } | { ok: false; error: string };

/** `message` is set only when it was written for the reader; see `LookupError`. */
export type LookupResult =
  { ok: true; meaning: Meaning } | { ok: false; message?: string };
