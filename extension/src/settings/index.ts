import { llmProviders, providerFor } from "../lookup/llm";
import type { LlmProvider } from "../lookup/llm/provider";
import { keyFor, preferences, save, saveLanguage } from "../lookup/settings";

const providers = document.getElementById("providers") as HTMLElement;
const key = document.getElementById("key") as HTMLInputElement;
const getKey = document.getElementById("get-key") as HTMLAnchorElement;
const language = document.getElementById("language") as HTMLSelectElement;
const said = document.getElementById("said") as HTMLElement;
const shortcut = document.getElementById("shortcut") as HTMLElement;

function tell(message: string, wrong = false): void {
  said.textContent = message;
  said.classList.toggle("wrong", wrong);
}

function chosen(): LlmProvider {
  const picked = providers.querySelector<HTMLInputElement>(":checked")?.value;
  return providerFor(picked ?? "") ?? (llmProviders[0] as LlmProvider);
}

/** Each provider keeps its own key, so switching back does not ask for it again. */
async function show(provider: LlmProvider): Promise<void> {
  getKey.href = provider.keyUrl;
  key.placeholder = `${provider.label} key`;
  key.value = await keyFor(provider.id);
  tell("");
}

function draw(current: string): void {
  for (const provider of llmProviders) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "provider";
    radio.value = provider.id;
    radio.checked = provider.id === current;
    radio.addEventListener("change", () => void show(provider));

    label.append(radio, document.createTextNode(provider.label));
    providers.append(label);
  }
}

async function onSave(): Promise<void> {
  const provider = chosen();
  const value = key.value.trim();
  if (!value) {
    tell("Paste a key first.", true);
    return;
  }

  // The host is optional in the manifest, so an install with no key is never asked for
  // it. This click is the user gesture the request needs.
  const granted = await chrome.permissions.request({
    origins: [provider.origin],
  });
  if (!granted) {
    tell(`Without access to ${provider.origin} the key cannot be used.`, true);
    return;
  }

  await save(provider.id, value);
  tell(`Saved. "Ask your model" now asks ${provider.label}.`);
}

async function showShortcut(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const lookup = commands.find((command) => command.name === "lookup-subtitle");
  // `suggested_key` is only a suggestion: a taken combination is dropped in silence.
  shortcut.textContent = lookup?.shortcut ? lookup.shortcut : "not set";
}

async function start(): Promise<void> {
  const saved = await preferences();
  draw(saved.provider);
  language.value = saved.language;
  await show(chosen());
  await showShortcut();
}

document.getElementById("save")?.addEventListener("click", () => void onSave());

language.addEventListener("change", () => {
  void saveLanguage(language.value);
});

document.getElementById("change-shortcut")?.addEventListener("click", () => {
  // chrome:// URLs cannot be opened from a link on a page.
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

void start();
