import type { Ask, MeaningProvider } from "../meaning";
import { local } from "./local/client";
import { providerFor } from "./providers";

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

/** The model a lookup goes to, and what it needs to answer. */
export interface Chosen {
  provider: MeaningProvider;
  ask: Ask;
}

export async function preferences(): Promise<Preferences> {
  const stored: Record<string, unknown> = await chrome.storage.sync.get([
    "provider",
    "language",
  ]);

  return {
    provider: typeof stored.provider === "string" ? stored.provider : local.id,
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

/** Whether the reader has to enter a key before this model answers. */
export const needsKey = (provider: MeaningProvider): boolean =>
  provider.keyUrl !== undefined;

/** The chosen model, or the built-in one when the choice is unknown or has no key. */
export async function chosen(): Promise<Chosen> {
  const { provider: id, language } = await preferences();
  const provider = providerFor(id) ?? local;
  const key = needsKey(provider) ? await keyFor(provider.id) : "";
  return needsKey(provider) && !key
    ? { provider: local, ask: { key: "" } }
    : { provider, ask: { key, language: language || undefined } };
}

export async function save(id: string, key: string): Promise<void> {
  if (key) {
    await chrome.storage.local.set({ [keyName(id)]: key });
  }
  await chrome.storage.sync.set({ provider: id });
}

export async function saveLanguage(language: string): Promise<void> {
  await chrome.storage.sync.set({ language });
}
