import { LookupError } from "../meaning";
import type { Meaning } from "../meaning";
import { readCache, writeCache } from "./cache";
import { local } from "./local/client";
import { configured } from "./settings";

export async function lookupWord(
  word: string,
  sentence: string,
): Promise<Meaning> {
  const cached = await readCache(local, word, sentence);
  if (cached) {
    return cached;
  }

  const meaning = await local.lookup(word, sentence);
  await writeCache(local, word, sentence, meaning);
  return meaning;
}

/** The optional second step: the provider the reader added a key for. */
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
