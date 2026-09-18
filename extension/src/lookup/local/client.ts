/**
 * The worker's side of the local model. The model lives in an offscreen page, because
 * Chrome stops an idle service worker and the model would reload on every lookup.
 */

import {
  LookupError,
  type Meaning,
  type MeaningProvider,
  type Sense,
} from "../../meaning";
import type { AskOffscreen, ChooseResult } from "../../messages";
import type { Choice, Ranked } from "./choose";
import { POS_NAMES } from "./vocab";

const PAGE = "offscreen.html";

/** Bump when the model or its data change, so cached answers from the old one go unused. */
const MODEL_VERSION = 2;

/** Senses shown when the model is unsure; the rest are folded away. */
const UNSURE_SHOWN = 3;

let opening: Promise<void> | undefined;

async function openPage(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  // Chrome allows one offscreen page, so concurrent lookups share one creation.
  opening ??= chrome.offscreen
    .createDocument({
      url: PAGE,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the sense model outside the service worker.",
    })
    .finally(() => {
      opening = undefined;
    });
  await opening;
}

/** Opens the page if it is closed and asks it one question. */
export async function askOffscreen<T>(question: AskOffscreen): Promise<T> {
  await openPage();
  return chrome.runtime.sendMessage<AskOffscreen, T>(question);
}

export async function closePage(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

/**
 * One sense when the model is confident. Otherwise the first three, or all four when
 * folding would hide a single sense.
 */
function shownCount({ confident, ranked }: Choice): number {
  if (confident) {
    return 1;
  }
  return ranked.length <= UNSURE_SHOWN + 1 ? ranked.length : UNSURE_SHOWN;
}

function toSense({ gloss, examples }: Ranked): Sense {
  return {
    definition: gloss,
    ...(examples[0] ? { example: examples[0] } : {}),
  };
}

function toMeaning(choice: Choice): Meaning {
  const count = shownCount(choice);
  return {
    senses: choice.ranked.slice(0, count).map(toSense),
    others: choice.ranked.slice(count).map(toSense),
    confident: choice.confident,
    confidence: choice.confidence,
    ...(choice.pos ? { partOfSpeech: POS_NAMES[choice.pos] } : {}),
    ...(choice.lemma.includes(" ") ? { phrase: choice.lemma } : {}),
  };
}

export const local: MeaningProvider = {
  id: "local",
  version: MODEL_VERSION,
  label: "Built-in model",
  explains: false,
  usesSentence: true,

  async lookup(target) {
    const question: AskOffscreen = {
      type: "CHOOSE_SENSE",
      to: "offscreen",
      ...target,
    };
    // The page may have closed for idleness between opening it and asking.
    const result = await askOffscreen<ChooseResult>(question).catch(() =>
      askOffscreen<ChooseResult>(question),
    );
    if (!result.ok) {
      console.error("The sense model failed:", result.error);
      throw new LookupError("The meaning could not be worked out. Try again.");
    }
    if (!result.choice) {
      throw new LookupError(`"${target.word}" is not in the dictionary.`);
    }
    return toMeaning(result.choice);
  },
};
