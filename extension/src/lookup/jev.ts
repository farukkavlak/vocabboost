/**
 * TypeSafe's Jev picks the sense itself. The extension looks the word up in WordNet and
 * hands Jev the senses as the options of one question; Jev answers with the option it
 * picks and a probability for each. It writes no text, so its card reads like the
 * built-in model's, with its own numbers behind it.
 *
 * The options keep the dictionary's order, so the same line always asks the same
 * question and the answer can be cached.
 */

import {
  LookupError,
  type Ask,
  type Meaning,
  type MeaningProvider,
  type Sense,
} from "../meaning";
import type { AskOffscreen, Candidates, CandidatesResult } from "../messages";
import { askOffscreen } from "./local/client";
import { POS_NAMES, type Pos, type Synset } from "./local/vocab";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

/** The option for a line no sense fits, which WordNet has no entry for. */
const NONE = "none";

/**
 * Above this Jev was right on 96% of the research lines, which clears the 85% bar the
 * card leads with one sense at; see research/README.md.
 */
const CONFIDENT = 0.9;

/** Senses shown when it is not confident; the rest are folded away. */
const UNSURE_SHOWN = 3;

const NAME = (shown: number): string => `sense-${shown}`;

interface Answer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

function criteria(synsets: Synset[]): Record<string, string> {
  const options: Record<string, string> = {};
  synsets.forEach((synset, i) => {
    const examples = synset.examples.length
      ? ` (for example: ${synset.examples.join("; ")})`
      : "";
    options[NAME(i + 1)] =
      `${synset.synonyms.join(", ")}: ${synset.gloss}${examples}`;
  });
  options[NONE] =
    "The word is not used in any of the senses above on this line.";
  return options;
}

function toSense({ gloss, examples }: Synset): Sense {
  return {
    definition: gloss,
    ...(examples[0] ? { example: examples[0] } : {}),
  };
}

/** The senses Jev thinks likeliest, best first. */
function byProbability(entry: Candidates, answer: Answer): Synset[] {
  return entry.synsets
    .map((synset, i) => ({
      synset,
      probability: answer.probabilities[NAME(i + 1)] ?? 0,
    }))
    .sort((a, b) => b.probability - a.probability)
    .map(({ synset }) => synset);
}

function toMeaning(entry: Candidates, answer: Answer): Meaning {
  const ranked = byProbability(entry, answer);
  const fits = answer.choice !== NONE;
  const confident = fits && answer.confidence >= CONFIDENT;
  const count = confident
    ? 1
    : Math.min(ranked.length, UNSURE_SHOWN + (ranked.length === 4 ? 1 : 0));

  return {
    senses: ranked.slice(0, count).map(toSense),
    others: ranked.slice(count).map(toSense),
    confident,
    confidence: answer.confidence,
    ...(entry.pos ? { partOfSpeech: POS_NAMES[entry.pos as Pos] } : {}),
    ...(entry.lemma.includes(" ") ? { phrase: entry.lemma } : {}),
    ...(fits ? {} : { note: "Jev found no sense that fits this line." }),
  };
}

/** TypeSafe puts what is wrong with a request in `detail`. */
function errorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    return typeof parsed.detail === "string"
      ? parsed.detail.slice(0, 120)
      : undefined;
  } catch {
    return undefined;
  }
}

async function candidatesFor(target: {
  word: string;
  sentence: string;
  occurrence: number;
}): Promise<Candidates> {
  const question: AskOffscreen = {
    type: "SENSE_CANDIDATES",
    to: "offscreen",
    ...target,
  };
  // The page may have closed for idleness between opening it and asking.
  const result = await askOffscreen<CandidatesResult>(question).catch(() =>
    askOffscreen<CandidatesResult>(question),
  );
  if (!result.ok) {
    console.error("The dictionary failed:", result.error);
    throw new LookupError("The meaning could not be worked out. Try again.");
  }
  if (!result.entry) {
    throw new LookupError(`"${target.word}" is not in the dictionary.`);
  }
  return result.entry;
}

export const jev: MeaningProvider = {
  id: "jev",
  version: 1,
  label: "Jev",
  explains: false,
  keyUrl: "https://console.typesafe.ai",
  origin: `${new URL(ENDPOINT).origin}/*`,
  usesSentence: true,

  async lookup(target, { key }: Ask) {
    const entry = await candidatesFor(target);

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        state: { subtitle_line: target.sentence, clicked_word: entry.lemma },
        questions: {
          sense: {
            type: "choice",
            instructions: `Which of these senses is the word "${entry.lemma}" used in on this line?`,
            criteria: criteria(entry.synsets),
          },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new LookupError("Jev rejected the key.");
      }
      const said = errorMessage(await response.text());
      throw new LookupError(
        said ? `Jev: ${said}` : `Jev answered ${response.status}.`,
      );
    }

    const answer = ((await response.json()) as { answers?: { sense?: Answer } })
      .answers?.sense;
    if (!answer?.choice) {
      throw new LookupError("Jev answered with nothing.");
    }
    return toMeaning(entry, answer);
  },
};
