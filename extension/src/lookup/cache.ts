import type { Cacheable, Meaning, Target } from "../meaning";

const PREFIX = "meaning";

function key(provider: Cacheable, target: Target): string {
  const parts = [PREFIX, provider.id, target.word.toLowerCase()];
  if (provider.usesSentence) {
    parts.push(String(target.occurrence), target.sentence);
  }

  return parts.join(" ");
}

// A cache that cannot be read or written makes the extension slower, not broken, so
// both sides swallow their failures.

export async function readCache(
  provider: Cacheable,
  target: Target,
): Promise<Meaning | null> {
  const id = key(provider, target);
  try {
    const stored = await chrome.storage.local.get(id);
    return (stored[id] as Meaning | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(
  provider: Cacheable,
  target: Target,
  meaning: Meaning,
): Promise<void> {
  try {
    await chrome.storage.local.set({ [key(provider, target)]: meaning });
  } catch {
    // Out of quota. The answer was still delivered.
  }
}
