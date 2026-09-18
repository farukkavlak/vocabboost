import { LookupError } from "../meaning";
import type { Ask, Meaning, MeaningProvider, Target } from "../meaning";
import { readCache, writeCache } from "./cache";
import { local } from "./local/client";
import { chosen } from "./settings";

async function answer(
  provider: MeaningProvider,
  target: Target,
  ask: Ask,
): Promise<Meaning> {
  const cached = await readCache(provider, target);
  if (cached) {
    return cached;
  }

  const meaning = await provider.lookup(target, ask);
  await writeCache(provider, target, meaning);
  return meaning;
}

/**
 * The model the reader chose answers. When a keyed model cannot — no network, a key it
 * rejects — the built-in one answers instead and the card says why.
 */
export async function lookupWord(target: Target): Promise<Meaning> {
  const { provider, ask } = await chosen();
  if (provider === local) {
    return answer(local, target, ask);
  }

  try {
    return await answer(provider, target, ask);
  } catch (error: unknown) {
    const said =
      error instanceof LookupError
        ? error.message
        : `${provider.label} could not be reached.`;
    return { ...(await answer(local, target, { key: "" })), note: said };
  }
}
