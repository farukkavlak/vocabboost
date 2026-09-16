import { LookupError } from "../meaning";
import type { Meaning, Target } from "../meaning";
import { readCache, writeCache } from "./cache";
import { local } from "./local/client";
import { configured } from "./settings";

export async function lookupWord(target: Target): Promise<Meaning> {
  const cached = await readCache(local, target);
  if (cached) {
    return cached;
  }

  const meaning = await local.lookup(target);
  await writeCache(local, target, meaning);
  return meaning;
}

/** The optional second step: the provider the reader added a key for. */
export async function explainWord(target: Target): Promise<Meaning> {
  const model = await configured();
  if (!model) {
    throw new LookupError("Add a model key in the extension's settings.");
  }

  const cached = await readCache(model.provider, target);
  if (cached) {
    return cached;
  }

  const meaning = await model.provider.lookup(target.word, target.sentence, {
    key: model.key,
    language: model.language || undefined,
  });
  await writeCache(model.provider, target, meaning);
  return meaning;
}
