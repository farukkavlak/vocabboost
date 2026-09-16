import { LookupError } from "../meaning";
import type { Meaning, MeaningProvider } from "../meaning";
import { readCache, writeCache } from "./cache";
import { local } from "./providers/local";
import { configured } from "./settings";

/** The model shipped with the extension answers first, with no key and no network. */
const provider: MeaningProvider = local;

export async function lookupWord(
  word: string,
  sentence: string,
): Promise<Meaning> {
  const cached = await readCache(provider, word, sentence);
  if (cached) {
    return cached;
  }

  const meaning = await provider.lookup(word, sentence);
  await writeCache(provider, word, sentence, meaning);
  return meaning;
}

/** The second step, for readers who added a key: a model that writes its own answer. */
export async function explainWord(
  word: string,
  sentence: string,
): Promise<Meaning> {
  const model = await configured();
  if (!model) {
    throw new LookupError("Add a model key in the extension's settings.");
  }

  const cached = await readCache(model.provider, word, sentence);
  if (cached) {
    return cached;
  }

  const meaning = await model.provider.lookup(word, sentence, {
    key: model.key,
    language: model.language || undefined,
  });
  await writeCache(model.provider, word, sentence, meaning);
  return meaning;
}
