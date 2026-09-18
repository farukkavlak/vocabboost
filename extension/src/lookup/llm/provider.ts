import { LookupError } from "../../meaning";
import type { Ask, Meaning, MeaningProvider, Target } from "../../meaning";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** The JSON schema the model's answer is constrained to. */
function schemaFor(language?: string): object {
  const properties: Record<string, object> = {
    definition: { type: "string" },
    partOfSpeech: { type: "string" },
    cefr: { type: "string", enum: LEVELS },
    phrase: { type: "string" },
    ...(language ? { translation: { type: "string" } } : {}),
  };
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Checked even though the schema constrains the answer: a truncated reply is still valid
 * JSON, and a missing field would reach the card as "undefined".
 */
function parseAnswer(text: string, label: string): Meaning {
  let answer: Record<string, unknown>;
  try {
    answer = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new LookupError(`${label} answered with something that is not JSON.`);
  }

  const definition = nonEmpty(answer.definition);
  if (!definition) {
    throw new LookupError(`${label} answered without a definition.`);
  }

  const partOfSpeech = nonEmpty(answer.partOfSpeech);
  const cefr = LEVELS.find((level) => level === answer.cefr);
  const phrase = nonEmpty(answer.phrase);
  const translation = nonEmpty(answer.translation);
  return {
    senses: [{ definition }],
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(cefr ? { cefr } : {}),
    ...(phrase ? { phrase } : {}),
    ...(translation ? { translation } : {}),
  };
}

/** Both providers put the reason for a failure in `error.message`. */
function errorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    return typeof message === "string" ? message.slice(0, 120) : undefined;
  } catch {
    return undefined;
  }
}

function prompt(word: string, sentence: string, language?: string): string {
  return [
    `In the subtitle line "${sentence}", what does "${word}" mean?`,
    "Define it as it is used in that line, in one sentence of plain English,",
    "for someone learning English who is staying inside English.",
    'If the word belongs to a phrasal verb or idiom, set "phrase" to that whole',
    'expression; otherwise set it to "".',
    language
      ? `Also translate the word, as used in that line, into ${language}.`
      : "Do not translate.",
  ].join(" ");
}

export interface LlmConfig {
  id: string;
  /** The name shown to the reader. */
  label: string;
  /** Where to get a key; linked from the settings page. */
  keyUrl: string;
  model: string;
  endpoint: string;
  headers(key: string): Record<string, string>;
  body(text: string, model: string, schema: object): unknown;
  /** The model's JSON answer, still as text. */
  extract(payload: unknown): string | undefined;
}

/** Every provider is the same request: post JSON with a key, read one JSON answer back. */
export function llmProvider(config: LlmConfig): MeaningProvider {
  return {
    id: config.id,
    version: 1,
    label: config.label,
    explains: true,
    keyUrl: config.keyUrl,
    origin: `${new URL(config.endpoint).origin}/*`,
    usesSentence: true,

    async lookup({ word, sentence }: Target, { key, language }: Ask) {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...config.headers(key) },
        body: JSON.stringify(
          config.body(
            prompt(word, sentence, language),
            config.model,
            schemaFor(language),
          ),
        ),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new LookupError(`${config.label} rejected the key.`);
        }

        const said = errorMessage(await response.text());
        throw new LookupError(
          said
            ? `${config.label}: ${said}`
            : `${config.label} answered ${response.status}.`,
        );
      }

      const text = config.extract(await response.json());
      if (!text) {
        throw new LookupError(`${config.label} answered with nothing.`);
      }

      return parseAnswer(text, config.label);
    },
  };
}
