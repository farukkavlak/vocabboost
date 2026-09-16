import { LookupError } from "../../meaning";
import type { Meaning, MeaningProvider } from "../../meaning";
import type { ChooseResult, ChooseSense } from "../../messages";

const PAGE = "offscreen.html";

/**
 * Senses shown before the rest fold away. The right one is among the first three on 91%
 * of the lines the model is unsure of, and each after that adds three points. A lone
 * fourth is shown rather than folded behind "1 more".
 */
const SHOWN = 3;

const PARTS = { n: "noun", v: "verb", a: "adjective", r: "adverb" } as const;

let opening: Promise<void> | undefined;

async function openPage(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  // Two lookups at once would both find no page, and Chrome allows only one.
  opening ??= chrome.offscreen
    .createDocument({
      url: PAGE,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification:
        "Runs the sense model, which has to outlive the service worker.",
    })
    .finally(() => {
      opening = undefined;
    });
  await opening;
}

/** Hands the model's memory back. The page asks for this once it has been idle. */
export async function closePage(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

/** The model shipped with the extension: no key, no network, and the default. */
export const local: MeaningProvider = {
  id: "local",
  usesSentence: true,

  async lookup(word: string, sentence: string): Promise<Meaning> {
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

    const choice = result.choice;
    if (!choice) {
      throw new LookupError(`"${word}" is not in the dictionary.`);
    }

    const shown =
      choice.ranked.length <= SHOWN + 1
        ? choice.ranked
        : choice.ranked.slice(0, SHOWN);
    return {
      senses: shown.map(({ gloss, examples }) => ({
        definition: gloss,
        ...(examples[0] ? { example: examples[0] } : {}),
      })),
      confident: choice.confident,
      more: choice.ranked.length - shown.length,
      ...(choice.pos ? { partOfSpeech: PARTS[choice.pos] } : {}),
      ...(choice.lemma.includes(" ") ? { phrase: choice.lemma } : {}),
    };
  },
};
