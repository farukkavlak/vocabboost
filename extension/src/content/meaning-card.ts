import { clamp, EDGE } from "./layout";
import { explainWord, lookupWord, modelReady } from "./lookup";
import { LookupError } from "../meaning";
import type { Meaning, Sense } from "../meaning";

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

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
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
  const toggle = element("button", "more", `${others.length} ${noun}`);
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", list.id);
  toggle.addEventListener("click", () => {
    list.hidden = !list.hidden;
    toggle.setAttribute("aria-expanded", String(!list.hidden));
    onToggle();
  });
  return [toggle, list];
}

/** Offered only when the reader has added a provider key. */
function askButton(onPress: () => void): HTMLElement {
  const button = element("button", "ask", "Ask your model");
  button.type = "button";
  button.addEventListener("click", () => {
    // A provider takes seconds to answer; say so rather than look idle.
    button.disabled = true;
    button.textContent = "Asking…";
    onPress();
  });
  return button;
}

function render(
  card: HTMLElement,
  word: string,
  meaning: Meaning,
  relayout: () => void,
  ask?: () => void,
  note?: string,
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
  if (note) {
    body.append(element("p", "note", note));
  }

  const others = meaning.others ?? [];
  if (others.length || ask) {
    const actions = element("div", "actions");
    const [toggle, list] = others.length ? foldedSenses(others, relayout) : [];
    if (toggle) {
      actions.append(toggle);
    }
    if (ask) {
      actions.append(askButton(ask));
    }
    body.append(actions);
    if (list) {
      body.append(list);
    }
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
  button: HTMLElement,
  word: string,
  sentence: string,
): void {
  closeCard(root);
  button.setAttribute("aria-expanded", "true");

  const card = element("div", "meaning pending");
  card.id = "vocab-meaning";
  const pending = element("div", "body");
  pending.append(element("p", "definition", `Looking up "${word}"…`));
  card.append(element("div", "arrow"), pending);
  root.appendChild(card);
  place(card, button, panel);
  card.classList.add("appear");

  const fill = (meaning: Meaning, ask?: () => void, note?: string): void => {
    // Closed, or another word opened, while the lookup was out.
    if (!card.isConnected) {
      return;
    }
    const relayout = (): void => place(card, button, panel);
    render(card, word, meaning, relayout, ask, note);
    relayout();
    card.classList.add("appear");
  };

  const said = (error: unknown): string =>
    error instanceof LookupError
      ? error.message
      : `Could not look up "${word}".`;

  // If the provider fails, the local answer stays with the reason under it.
  const explain = (local: Meaning | null) => (): void => {
    void explainWord(word, sentence)
      .then((meaning) => fill(meaning))
      .catch((error: unknown) =>
        local
          ? fill(local, explain(local), said(error))
          : fill({ senses: [{ definition: said(error) }] }, explain(null)),
      );
  };

  // Asked in parallel with the lookup, which is slower when the model has to load.
  const ready = modelReady();

  void lookupWord(word, sentence)
    .then(async (meaning) =>
      fill(meaning, (await ready) ? explain(meaning) : undefined),
    )
    .catch(async (error: unknown) =>
      fill(
        { senses: [{ definition: said(error) }] },
        (await ready) ? explain(null) : undefined,
      ),
    );
}
