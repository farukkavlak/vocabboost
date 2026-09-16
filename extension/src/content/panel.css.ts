// Lives in a shadow root, so these rules cannot leak out and the host page's cannot
// leak in. Kept as a string because a content script has no stylesheet loader.
export const panelStyles = `
  :host {
    all: initial;
    /* Set from the caption's own computed size, so the panel matches the subtitle it
       replaces at any window size and in fullscreen. */
    --size: 19px;
    --meaning-size: 14px;
    --accent: #d0451b;
  }

  .panel {
    position: fixed;
    box-sizing: border-box;
    padding: 8px 14px 10px;
    border-radius: 10px;
    background: rgba(15, 15, 17, 0.92);
    color: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: var(--size);
    line-height: 1.35;
    text-align: center;
    z-index: 2147483647;
  }

  /* The panel takes focus so the arrow keys reach the line; it is not itself a control,
     so it must not draw a focus ring. */
  .panel:focus {
    outline: none;
  }

  .previous {
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.75em;
    line-height: 1.3;
    margin-bottom: 2px;
  }

  /* The words stay in the flow of a sentence: only hover and focus mark them as
     clickable, so the line still reads like the subtitle it stands in for. */
  .line {
    /* Cancels the hover padding at the line's edges, so the text still starts and ends
       where the caption's did. */
    margin: 0 -0.08em;
  }

  .word,
  .filler {
    font: inherit;
    color: inherit;
    line-height: inherit;
  }

  .word {
    appearance: none;
    margin: 0;
    padding: 0 0.08em;
    border: 0;
    border-radius: 0.18em;
    background: transparent;
    cursor: pointer;
    transition: background-color 100ms ease-out;
  }

  .word:hover,
  .word:focus-visible {
    background: rgba(255, 255, 255, 0.22);
    outline: none;
  }

  .word[aria-expanded="true"] {
    background: var(--accent);
  }

  .hint {
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 0.55em;
    letter-spacing: 0.02em;
  }

  .meaning {
    position: fixed;
    box-sizing: border-box;
    min-width: 220px;
    max-width: min(360px, 80vw);
    padding: 10px 13px 11px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    background: rgba(22, 22, 26, 0.98);
    color: #f2f2f5;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: var(--meaning-size);
    line-height: 1.45;
    text-align: left;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    z-index: 2147483647;
  }

  /* Added once placed: an element measured mid-animation reports where the animation
     has it, not where it was put. */
  .appear {
    animation: appear 140ms ease-out;
  }

  /* Points back at the word, so the card is never mistaken for a page element. */
  .arrow {
    position: absolute;
    width: 10px;
    height: 10px;
    background: rgba(22, 22, 26, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.14);
    transform: rotate(45deg);
  }

  .arrow.below {
    top: -6px;
    border-right: 0;
    border-bottom: 0;
  }

  .arrow.above {
    bottom: -6px;
    border-left: 0;
    border-top: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }

  .head h1 {
    margin: 0;
    font-size: 1.08em;
    font-weight: 600;
  }

  .badge {
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.78em;
    text-transform: lowercase;
  }

  .badge.cefr {
    background: rgba(208, 69, 27, 0.22);
    color: #ffb59b;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .sense + .sense {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .definition {
    margin: 0;
  }

  .example {
    margin: 2px 0 0;
    color: rgba(255, 255, 255, 0.55);
    font-style: italic;
  }

  .phrase {
    margin: 0 0 4px;
    color: #ffb59b;
    font-size: 0.92em;
  }

  .translation {
    margin: 5px 0 0;
    padding-top: 5px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.72);
  }

  .ask {
    display: block;
    margin-top: 8px;
    padding: 4px 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 7px;
    background: transparent;
    color: rgba(255, 255, 255, 0.75);
    font: inherit;
    font-size: 0.88em;
    cursor: pointer;
    transition: background-color 100ms ease-out;
  }

  .ask:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .note {
    margin: 6px 0 0;
    color: #ffb59b;
    font-size: 0.92em;
  }

  .ask:not(:disabled):hover,
  .ask:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }

  .pending {
    color: rgba(255, 255, 255, 0.5);
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .appear {
      animation: none;
    }

    .word {
      transition: none;
    }
  }
`;
