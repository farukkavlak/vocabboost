import { clamp, EDGE } from "./layout";
import { logLookup, lookupWord } from "./lookup";
import { LookupError } from "../meaning";
import type { Meaning, Sense, Target } from "../meaning";
import { button, element } from "../dom";
import { newEntry, type Moment } from "../logbook/entry";

/** Where a line came from; the word log keeps it with the answer. */
export interface LineOrigin {
  moment: Moment;
  previous?: string;
}

/** Between the card and the panel it belongs to. */
const GAP = 8;
/** Half the arrow's diagonal, to centre it on the word it points at. */
const ARROW_OFFSET = 5;

/**
 * On whichever side of the panel has more room, and never over it: the panel holds the
 * line the meaning is read against. The card's body scrolls if the room is short.
 */
function place(card: HTMLElement, word: HTMLElement, panel: HTMLElement): void {
  const line = panel.getBoundingClientRect();
  const roomBelow = window.innerHeight - line.bottom - GAP - EDGE;
  const roomAbove = line.top - GAP - EDGE;
  const below = roomBelow >= roomAbove;
  card.style.maxHeight = `${Math.max(below ? roomBelow : roomAbove, 0)}px`;

  const box = card.getBoundingClientRect();
  const top = below ? line.bottom + GAP : line.top - GAP - box.height;
  card.style.top = `${Math.max(EDGE, top)}px`;

  const anchor = word.getBoundingClientRect();
  const centre = anchor.left + anchor.width / 2;
  const left = clamp(
    centre - box.width / 2,
    EDGE,
    window.innerWidth - box.width - EDGE,
  );
  card.style.left = `${left}px`;

  // The card is clamped to the window, so the arrow follows the word, not the card.
  const arrow = card.querySelector<HTMLElement>(".arrow");
  if (arrow) {
    arrow.className = `arrow ${below ? "below" : "above"}`;
    arrow.style.left = `${clamp(centre - left - ARROW_OFFSET, 10, box.width - 20)}px`;
  }
}

/**
 * "92% sure", when the model led with one sense out of several. Capped at 99: a model's
 * answer is never certain.
 */
function sureness({ confident, confidence }: Meaning): string | null {
  if (!confident || confidence === undefined || confidence >= 1) {
    return null;
  }
  return `${Math.min(Math.round(confidence * 100), 99)}% sure`;
}

function head(word: string, meaning: Meaning): HTMLElement {
  const node = element("div", "head");
  const title = document.createElement("h1");
  title.textContent = meaning.phrase ?? word;
  node.append(title);
  if (meaning.partOfSpeech) {
    node.append(element("span", "pos", meaning.partOfSpeech));
  }
  if (meaning.cefr) {
    node.append(element("span", "level", meaning.cefr));
  }
  const sure = sureness(meaning);
  if (sure) {
    node.append(element("span", "sure", sure));
  }
  return node;
}

function senseList(
  senses: Sense[],
  className: string,
  withExamples: boolean,
): HTMLElement {
  const list = element("ul", className);
  for (const sense of senses) {
    const item = element("li", "sense");
    item.append(element("p", "definition", sense.definition));
    if (withExamples && sense.example) {
      item.append(element("p", "example", sense.example));
    }
    list.append(item);
  }
  return list;
}

/** A button that shows or hides the senses the model ranked lower. */
function foldedSenses(others: Sense[], onToggle: () => void): HTMLElement[] {
  const list = senseList(others, "others", false);
  list.id = "vocab-other-senses";
  list.hidden = true;

  const noun = others.length === 1 ? "other meaning" : "other meanings";
  const toggle = button(
    `${others.length} ${noun}`,
    () => {
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded", String(!list.hidden));
      onToggle();
    },
    "more",
  );
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", list.id);
  return [toggle, list];
}

function render(
  card: HTMLElement,
  word: string,
  meaning: Meaning,
  relayout: () => void,
): void {
  card.className = "meaning";
  card.textContent = "";

  const body = element("div", "body");
  body.append(head(word, meaning));

  const unsure = meaning.confident === false;
  if (unsure) {
    body.append(element("p", "lead", "Could be any of these"));
  }
  body.append(
    senseList(meaning.senses, unsure ? "senses compact" : "senses", true),
  );

  if (meaning.translation) {
    body.append(element("p", "translation", meaning.translation));
  }
  if (meaning.note) {
    body.append(element("p", "note", meaning.note));
  }

  const others = meaning.others ?? [];
  if (others.length) {
    const [toggle, list] = foldedSenses(others, relayout);
    const actions = element("div", "actions");
    actions.append(toggle!);
    body.append(actions, list!);
  }

  card.append(element("div", "arrow"), body);
}

export function isCardOpen(root: ShadowRoot | null | undefined): boolean {
  return root?.querySelector(".meaning") != null;
}

export function closeCard(root: ShadowRoot | null | undefined): void {
  root?.querySelector(".meaning")?.remove();
  root
    ?.querySelectorAll<HTMLElement>('.word[aria-expanded="true"]')
    .forEach((word) => word.setAttribute("aria-expanded", "false"));
}

/** Opens the card in its pending state and fills it in when the lookup answers. */
export function openCard(
  root: ShadowRoot,
  panel: HTMLElement,
  wordButton: HTMLElement,
  target: Target,
  origin: LineOrigin,
): void {
  const { word } = target;
  closeCard(root);
  wordButton.setAttribute("aria-expanded", "true");

  const card = element("div", "meaning pending");
  card.id = "vocab-meaning";
  const pending = element("div", "body");
  pending.append(element("p", "definition", `Looking up "${word}"…`));
  card.append(element("div", "arrow"), pending);
  root.appendChild(card);
  place(card, wordButton, panel);
  card.classList.add("appear");

  const fill = (meaning: Meaning): void => {
    // Closed, or another word opened, while the lookup was out.
    if (!card.isConnected) {
      return;
    }
    const relayout = (): void => place(card, wordButton, panel);
    render(card, word, meaning, relayout);
    relayout();
    card.classList.add("appear");
  };

  const said = (error: unknown): string =>
    error instanceof LookupError
      ? error.message
      : `Could not look up "${word}".`;

  void lookupWord(target)
    .then((meaning) => {
      logLookup(newEntry(target, meaning, origin.moment, origin.previous));
      fill(meaning);
    })
    .catch((error: unknown) => fill({ senses: [{ definition: said(error) }] }));
}
