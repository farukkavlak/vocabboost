import { button, element } from "../dom";
import { escapeRegExp } from "../text";
import { momentUrl, videoKey, type LogEntry, type Moment } from "./entry";
import { chooseSense, readLog, removeEntry } from "./store";

/** Entries drawn at once; the rest wait behind "Show more". */
const PAGE = 100;
/** Pause after typing before the search runs. */
const SEARCH_DELAY_MS = 150;

const PLATFORMS: Record<string, string> = {
  youtube: "YouTube",
  netflix: "Netflix",
  prime: "Prime Video",
};

const log = document.getElementById("log") as HTMLElement;
const count = document.getElementById("count") as HTMLElement;
const search = document.getElementById("search") as HTMLInputElement;

/** The whole log, newest first; read once and kept in step with every change. */
let entries: LogEntry[] = [];
let shown = PAGE;

const plural = (n: number, noun: string): string =>
  n === 1 ? `1 ${noun}` : `${n.toLocaleString()} ${noun}s`;

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function watchAgain(moment: Moment): HTMLElement | null {
  const url = momentUrl(moment);
  if (!url) {
    return null;
  }
  const link = element("a", "", `Watch at ${clock(moment.seconds)}`);
  link.href = url;
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

/** The meaning, or for an unsure entry without an answer, the question. */
function meaning(entry: LogEntry): HTMLElement[] {
  const index = entry.confident ? 0 : entry.chosen;
  const sense = index === undefined ? undefined : entry.senses[index];
  if (sense) {
    return [element("p", "definition", sense.definition)];
  }

  const choices = element("ul", "choices");
  entry.senses.forEach((option, i) => {
    const item = element("li");
    item.append(
      element("span", "", option.definition),
      button("This one", () => void choose(entry, i)),
    );
    choices.append(item);
  });
  return [element("p", "question", "Which meaning did the line use?"), choices];
}

function entryItem(entry: LogEntry): HTMLElement {
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
  actions.append(button("Remove", () => void remove(entry)));
  head.append(actions);

  const item = element("li", "entry");
  item.append(head, ...meaning(entry), lineWith(entry));
  return item;
}

function videoSection(group: LogEntry[]): HTMLElement {
  const { moment } = group[0]!;
  const platform = PLATFORMS[moment.platform] ?? moment.platform;
  const list = element("ul", "entries");
  list.append(...group.map(entryItem));

  const section = element("section", "video");
  section.append(
    element("h2", "", moment.title || "Untitled video"),
    element("p", "source", `${platform}, ${plural(group.length, "word")}`),
    list,
  );
  return section;
}

/** Entries grouped by video; videos come in the order of their newest entry. */
function byVideo(page: LogEntry[]): LogEntry[][] {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of page) {
    const key = videoKey(entry.moment);
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return [...groups.values()];
}

function matching(): LogEntry[] {
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return entries;
  }
  return entries.filter(
    (entry) =>
      entry.headword.toLowerCase().includes(query) ||
      entry.line.toLowerCase().includes(query),
  );
}

function draw(): void {
  count.textContent = plural(entries.length, "word");
  if (!entries.length) {
    log.replaceChildren(
      element(
        "p",
        "empty",
        "Words you look up while watching will appear here, with the line they came from.",
      ),
    );
    return;
  }

  const found = matching();
  if (!found.length) {
    log.replaceChildren(
      element("p", "empty", `Nothing matches "${search.value.trim()}".`),
    );
    return;
  }

  const sections = byVideo(found.slice(0, shown)).map(videoSection);
  const rest = found.length - shown;
  if (rest > 0) {
    const more = () => {
      shown += PAGE;
      draw();
    };
    sections.push(button(`Show ${Math.min(rest, PAGE)} more`, more, "more"));
  }
  log.replaceChildren(...sections);
}

async function choose(entry: LogEntry, index: number): Promise<void> {
  await chooseSense(entry.id, index);
  entry.chosen = index;
  draw();
}

async function remove(entry: LogEntry): Promise<void> {
  await removeEntry(entry.id);
  entries = entries.filter((kept) => kept !== entry);
  draw();
}

let pending: ReturnType<typeof setTimeout> | undefined;
search.addEventListener("input", () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    shown = PAGE;
    draw();
  }, SEARCH_DELAY_MS);
});

void readLog().then((saved) => {
  entries = saved;
  draw();
});
