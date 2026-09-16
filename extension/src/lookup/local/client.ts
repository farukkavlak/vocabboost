/**
 * The worker's side of the local model. The model lives in an offscreen page, because
 * Chrome stops an idle service worker and the model would reload on every lookup.
 */

import { LookupError, type Meaning, type MeaningProvider } from "../../meaning";
import type { ChooseResult, ChooseSense } from "../../messages";
import type { Choice, Ranked } from "./choose";

const PAGE = "offscreen.html";

/** Senses shown before the rest are folded away. */
const SHOWN = 3;

const POS_NAMES = {
  n: "noun",
  v: "verb",
  a: "adjective",
  r: "adverb",
} as const;

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

export async function closePage(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

/** The first three, or all four when folding would hide a single sense. */
function shown(ranked: Ranked[]): Ranked[] {
  return ranked.length <= SHOWN + 1 ? ranked : ranked.slice(0, SHOWN);
}

function toMeaning(choice: Choice): Meaning {
  const senses = shown(choice.ranked);
  return {
    senses: senses.map(({ gloss, examples }) => ({
      definition: gloss,
      ...(examples[0] ? { example: examples[0] } : {}),
    })),
    confident: choice.confident,
    hidden: choice.ranked.length - senses.length,
    ...(choice.pos ? { partOfSpeech: POS_NAMES[choice.pos] } : {}),
    ...(choice.lemma.includes(" ") ? { phrase: choice.lemma } : {}),
  };
}

export const local: MeaningProvider = {
  id: "local",
  usesSentence: true,

  async lookup(word, sentence) {
    await openPage();
    const question: ChooseSense = {
      type: "CHOOSE_SENSE",
      target: "offscreen",
      word,
      sentence,
    };
    const result: ChooseResult = await chrome.runtime.sendMessage(question);
    if (!result.ok) {
      console.error("The sense model failed:", result.error);
      throw new LookupError("The meaning could not be worked out. Try again.");
    }
    if (!result.choice) {
      throw new LookupError(`"${word}" is not in the dictionary.`);
    }
    return toMeaning(result.choice);
  },
};
