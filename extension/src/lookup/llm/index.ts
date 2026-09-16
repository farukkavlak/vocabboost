import { anthropic } from "./anthropic";
import type { LlmProvider } from "./provider";
import { openai } from "./openai";

/** Adding a provider is a new file in this folder and one entry here. */
export const llmProviders: readonly LlmProvider[] = [anthropic, openai];

export function providerFor(id: string): LlmProvider | undefined {
  return llmProviders.find((provider) => provider.id === id);
}
