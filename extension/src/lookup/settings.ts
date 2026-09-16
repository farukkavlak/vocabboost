import { llmProviders, providerFor } from "./llm";
import type { LlmProvider } from "./llm/provider";

/**
 * Keys are kept in `storage.local`: `sync` would carry them to Google's servers. The
 * preferences beside them are worth syncing, and say nothing secret.
 */
const keyName = (id: string): string => `key ${id}`;

export interface Preferences {
  provider: string;
  /** Empty means the card stays in English, which is the default. */
  language: string;
}

export interface Configured {
  provider: LlmProvider;
  key: string;
  language: string;
}

export async function preferences(): Promise<Preferences> {
  const stored: Record<string, unknown> = await chrome.storage.sync.get([
    "provider",
    "language",
  ]);

  return {
    provider:
      typeof stored.provider === "string"
        ? stored.provider
        : (llmProviders[0]?.id ?? ""),
    language: typeof stored.language === "string" ? stored.language : "",
  };
}

export async function keyFor(id: string): Promise<string> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(
    keyName(id),
  );
  const key = stored[keyName(id)];
  return typeof key === "string" ? key : "";
}

/** What the worker needs to ask the model, or null when no key has been entered. */
export async function configured(): Promise<Configured | null> {
  const { provider: id, language } = await preferences();
  const provider = providerFor(id);
  if (!provider) {
    return null;
  }

  const key = await keyFor(provider.id);
  return key ? { provider, key, language } : null;
}

export async function save(id: string, key: string): Promise<void> {
  await chrome.storage.local.set({ [keyName(id)]: key });
  await chrome.storage.sync.set({ provider: id });
}

export async function saveLanguage(language: string): Promise<void> {
  await chrome.storage.sync.set({ language });
}
