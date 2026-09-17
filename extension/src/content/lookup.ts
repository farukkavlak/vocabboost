import { LookupError } from "../meaning";
import type { Meaning, Target } from "../meaning";
import type { NewEntry } from "../logbook/entry";
import type { LogLookup, LookupResult } from "../messages";

async function ask(
  message: { type: "LOOKUP_WORD" | "EXPLAIN_WORD" } & Target,
): Promise<Meaning> {
  const result: LookupResult | undefined =
    await chrome.runtime.sendMessage(message);

  if (!result?.ok) {
    throw result?.message
      ? new LookupError(result.message)
      : new Error(`Lookup failed for "${message.word}".`);
  }

  return result.meaning;
}

export const lookupWord = (target: Target): Promise<Meaning> =>
  ask({ type: "LOOKUP_WORD", ...target });

export const explainWord = (target: Target): Promise<Meaning> =>
  ask({ type: "EXPLAIN_WORD", ...target });

/** False when no key has been entered, so the card can leave the step out. */
export async function modelReady(): Promise<boolean> {
  const ready: unknown = await chrome.runtime.sendMessage({
    type: "MODEL_READY",
  });
  return ready === true;
}

/** Hands a finished lookup to the worker, which keeps the word log. */
export function logLookup(entry: NewEntry): void {
  const message: LogLookup = { type: "LOG_LOOKUP", entry };
  void chrome.runtime.sendMessage(message);
}
