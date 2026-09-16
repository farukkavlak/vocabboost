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

/** The same word, asked of the reader's provider. */
export interface ExplainWord {
  type: "EXPLAIN_WORD";
  word: string;
  sentence: string;
}

/** Whether a provider key has been entered, so the card can offer the second step. */
export interface ModelReady {
  type: "MODEL_READY";
}

/** From the offscreen page when it has been idle long enough to close. */
export interface OffscreenIdle {
  type: "OFFSCREEN_IDLE";
}

export type Message =
  LookupSubtitle | LookupWord | ExplainWord | ModelReady | OffscreenIdle;

/** From the worker to the offscreen page, which is the only listener with this target. */
export interface ChooseSense {
  type: "CHOOSE_SENSE";
  target: "offscreen";
  word: string;
  sentence: string;
}

/** `error` is for the console. */
export type ChooseResult =
  { ok: true; choice: Choice | null } | { ok: false; error: string };

/** `message` is set only when it is meant for the reader; see `LookupError`. */
export type LookupResult =
  { ok: true; meaning: Meaning } | { ok: false; message?: string };
