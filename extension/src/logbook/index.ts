import { escapeRegExp } from "../text";
import {
  chooseSense,
  readLog,
  removeEntry,
  type LogEntry,
  type Moment,
} from "./store";

const log = document.getElementById("log") as HTMLElement;
const count = document.getElementById("count") as HTMLElement;
const search = document.getElementById("search") as HTMLInputElement;

const PLATFORMS: Record<string, string> = {
  youtube: "YouTube",
  netflix: "Netflix",
  prime: "Prime Video",
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function youtubeId(url: string): string | null {
  return new URL(url).searchParams.get("v");
}

/** Entries of one video share this, whatever time was in their URL. */
function videoKey({ platform, url }: Moment): string {
  const id = platform === "youtube" ? youtubeId(url) : null;
  return id ? `youtube ${id}` : `${platform} ${url.split(/[?#]/)[0]}`;
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** A link back to the moment; only YouTube takes a start time in the URL. */
function watchAgain({ platform, url, seconds }: Moment): HTMLElement | null {
  const id = platform === "youtube" ? youtubeId(url) : null;
  if (!id) {
    return null;
  }
  const link = element("a", "", `Watch at ${clock(seconds)}`);
  link.href = `https://www.youtube.com/watch?v=${id}&t=${seconds}s`;
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

/** The line, with the clicked occurrence of the word set apart. */
function lineWith({ line, word, occurrence }: LogEntry): HTMLElement {
  const paragraph = element("p", "line");
  const whole = new RegExp(
    `(?<![\\p{L}'])${escapeRegExp(word)}(?![\\p{L}'])`,
    "giu",
  );
  const found = [...line.matchAll(whole)][occurrence];
  if (found?.index === undefined) {
    paragraph.textContent = line;
    return paragraph;
  }
  const end = found.index + word.length;
  paragraph.append(
    line.slice(0, found.index),
    element("mark", "", line.slice(found.index, end)),
    line.slice(end),
  );
  return paragraph;
}

function meaning(entry: LogEntry): HTMLElement[] {
  const picked = entry.confident ? 0 : entry.chosen;
  const sense = picked === undefined ? undefined : entry.senses[picked];
  if (sense) {
    return [element("p", "definition", sense.definition)];
  }

  const choices = element("ul", "choices");
  entry.senses.forEach((option, index) => {
    const item = element("li", "");
    const pick = element("button", "", "This one");
    pick.type = "button";
    pick.addEventListener("click", () => {
      void chooseSense(entry.id, index).then(draw);
    });
    item.append(element("span", "", option.definition), pick);
    choices.append(item);
  });
  return [element("p", "question", "Which meaning did the line use?"), choices];
}

function entryItem(entry: LogEntry): HTMLElement {
  const item = element("li", "entry");
  const head = element("div", "entry-head");
  head.append(element("h3", "", entry.headword));
  if (entry.partOfSpeech) {
    head.append(element("span", "pos", entry.partOfSpeech));
  }

  const actions = element("div", "actions");
  const again = watchAgain(entry.moment);
  if (again) {
    actions.append(again);
  }
  const remove = element("button", "", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => {
    void removeEntry(entry.id).then(draw);
  });
  actions.append(remove);
  head.append(actions);

  item.append(head, ...meaning(entry), lineWith(entry));
  return item;
}

function videoSection(entries: LogEntry[]): HTMLElement {
  const { moment } = entries[0]!;
  const section = element("section", "video");
  const words = entries.length === 1 ? "1 word" : `${entries.length} words`;
  const platform = PLATFORMS[moment.platform] ?? moment.platform;
  section.append(
    element("h2", "", moment.title || "Untitled video"),
    element("p", "source", `${platform}, ${words}`),
  );
  const list = element("ul", "entries");
  list.append(...entries.map(entryItem));
  section.append(list);
  return section;
}

function matches(entry: LogEntry, query: string): boolean {
  return [entry.headword, entry.line].some((text) =>
    text.toLowerCase().includes(query),
  );
}

async function draw(): Promise<void> {
  const all = await readLog();
  const query = search.value.trim().toLowerCase();
  const shown = query ? all.filter((entry) => matches(entry, query)) : all;
  count.textContent = all.length === 1 ? "1 word" : `${all.length} words`;

  if (!all.length) {
    log.replaceChildren(
      element(
        "p",
        "empty",
        "Words you look up while watching will appear here, with the line they came from.",
      ),
    );
    return;
  }
  if (!shown.length) {
    log.replaceChildren(element("p", "empty", `Nothing matches "${query}".`));
    return;
  }

  // Entries are newest first, so videos come out ordered by their latest lookup.
  const videos = new Map<string, LogEntry[]>();
  for (const entry of shown) {
    const key = videoKey(entry.moment);
    videos.set(key, [...(videos.get(key) ?? []), entry]);
  }
  log.replaceChildren(...[...videos.values()].map(videoSection));
}

search.addEventListener("input", () => void draw());
void draw();
