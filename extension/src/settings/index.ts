import {
  keyFor,
  needsKey,
  preferences,
  save,
  saveLanguage,
} from "../lookup/settings";
import type { MeaningProvider } from "../meaning";
import { local } from "../lookup/local/client";
import { providerFor, providers } from "../lookup/providers";

const list = document.getElementById("providers") as HTMLElement;
const does = document.getElementById("does") as HTMLElement;
const credentials = document.getElementById("credentials") as HTMLElement;
const key = document.getElementById("key") as HTMLInputElement;
const getKey = document.getElementById("get-key") as HTMLAnchorElement;
const language = document.getElementById("language") as HTMLSelectElement;
const translate = document.getElementById("translate") as HTMLElement;
const said = document.getElementById("said") as HTMLElement;
const shortcut = document.getElementById("shortcut") as HTMLElement;

function tell(message: string, wrong = false): void {
  said.textContent = message;
  said.classList.toggle("wrong", wrong);
}

function chosen(): MeaningProvider {
  const picked = list.querySelector<HTMLInputElement>(":checked")?.value;
  return providerFor(picked ?? "") ?? local;
}

/** What the reader gets from this model, in one line. */
function describe(provider: MeaningProvider): string {
  if (!needsKey(provider)) {
    return "Picks the meaning on your machine. No key, no network.";
  }
  return provider.explains
    ? "Explains the word in its line, with a level and a translation. Your key, their servers."
    : "Picks the meaning, more often right than the built-in model. Your key, their servers.";
}

/** Only a model that writes prose can translate, and only a keyed one needs a key. */
function fields(provider: MeaningProvider): void {
  does.textContent = describe(provider);
  credentials.hidden = !needsKey(provider);
  translate.hidden = !provider.explains;
}

/** Each provider keeps its own key, so switching back does not ask for it again. */
async function show(provider: MeaningProvider): Promise<void> {
  fields(provider);
  tell("");
  if (!needsKey(provider)) {
    // Nothing to save: the choice itself is the setting.
    await save(provider.id, "");
    return;
  }
  getKey.href = provider.keyUrl ?? "#";
  key.placeholder = `${provider.label} key`;
  key.value = await keyFor(provider.id);
}

function draw(current: string): void {
  for (const provider of providers) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "provider";
    radio.value = provider.id;
    radio.checked = provider.id === current;
    radio.addEventListener("change", () => void show(provider));

    label.append(radio, document.createTextNode(provider.label));
    list.append(label);
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
  const origin = provider.origin ?? "";
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    tell(`Without access to ${origin} the key cannot be used.`, true);
    return;
  }

  await save(provider.id, value);
  tell(`Saved. Words are now looked up with ${provider.label}.`);
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
  const provider = chosen();
  fields(provider);
  if (needsKey(provider)) {
    getKey.href = provider.keyUrl ?? "#";
    key.placeholder = `${provider.label} key`;
    key.value = await keyFor(provider.id);
  }
  await showShortcut();
}

document.getElementById("save")?.addEventListener("click", () => void onSave());

language.addEventListener("change", () => {
  void saveLanguage(language.value);
});

document.getElementById("open-log")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("logbook.html") });
});

document.getElementById("change-shortcut")?.addEventListener("click", () => {
  // chrome:// URLs cannot be opened from a link on a page.
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

void start();
