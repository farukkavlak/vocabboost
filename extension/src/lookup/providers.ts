import { anthropic } from "./llm/anthropic";
import { jev } from "./jev";
import { local } from "./local/client";
import type { MeaningProvider } from "../meaning";
import { openai } from "./llm/openai";

/**
 * Every model the reader can choose between, in the order the settings page offers
 * them. The first is the default: it needs no key and no network.
 *
 * Adding one is a new file in this folder and one entry here.
 */
export const providers: readonly MeaningProvider[] = [
  local,
  jev,
  anthropic,
  openai,
];

export function providerFor(id: string): MeaningProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

/** The hosts the manifest asks for only when a key for one is saved. */
export const optionalOrigins = providers
  .map((provider) => provider.origin)
  .filter((origin): origin is string => origin !== undefined);
