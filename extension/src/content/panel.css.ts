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
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 220px;
    max-width: min(400px, 80vw);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgb(22, 22, 26);
    color: #f2f2f5;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: var(--meaning-size);
    line-height: 1.45;
    text-align: left;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
  }

  /* The card's height is capped to the room beside the panel; the body scrolls. */
  .body {
    padding: 10px 14px 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Added once placed: an element measured mid-animation reports where the animation
     has it, not where it was put. */
  .appear {
    animation: appear 120ms ease-out;
  }

  /* Points back at the word, so the card is never mistaken for a page element. */
  .arrow {
    position: absolute;
    width: 10px;
    height: 10px;
    background: rgb(22, 22, 26);
    border: 1px solid rgba(255, 255, 255, 0.12);
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

  /* Headword, then part of speech in italics, as a printed dictionary sets them. */
  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: 0.5em;
    margin-bottom: 6px;
  }

  .head h1 {
    margin: 0;
    font-size: 1.12em;
    font-weight: 650;
  }

  .pos {
    color: rgba(255, 255, 255, 0.62);
    font-style: italic;
  }

  .level,
  .sure {
    color: rgba(255, 255, 255, 0.62);
    font-size: 0.86em;
    font-variant-numeric: tabular-nums;
  }

  .lead {
    margin: 0 0 6px;
    color: rgba(255, 255, 255, 0.62);
  }

  .senses,
  .others {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sense + .sense {
    margin-top: 8px;
  }

  .definition {
    margin: 0;
  }

  .example {
    margin: 2px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-style: italic;
  }

  /* Several candidates: each keeps to a short block so they can be compared. */
  .compact .sense {
    padding-left: 10px;
    border-left: 2px solid rgba(255, 255, 255, 0.14);
  }

  .compact .example {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Indented to start where the toggle's text does. */
  .others {
    margin-top: 6px;
    padding-left: 1em;
    color: rgba(255, 255, 255, 0.62);
  }

  .others .sense + .sense {
    margin-top: 4px;
  }

  .translation {
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.72);
  }

  /* Errors from a provider; shown under the answer they failed to replace. */
  .note {
    margin: 8px 0 0;
    color: #f0b4a4;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
  }

  .more,
  .ask {
    padding: 2px 0;
    border: 0;
    background: none;
    color: rgba(255, 255, 255, 0.62);
    font: inherit;
    cursor: pointer;
  }

  .more::before {
    content: "";
    display: inline-block;
    width: 0.4em;
    height: 0.4em;
    margin: 0 0.5em 0.15em 0.1em;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 120ms ease-out;
  }

  .more[aria-expanded="true"]::before {
    transform: rotate(45deg);
  }

  .ask {
    margin-left: auto;
    color: #f2f2f5;
    text-decoration: underline;
    text-decoration-color: rgba(255, 255, 255, 0.3);
    text-underline-offset: 3px;
  }

  .more:hover,
  .ask:not(:disabled):hover {
    color: #fff;
  }

  .more:focus-visible,
  .ask:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .ask:disabled {
    color: rgba(255, 255, 255, 0.45);
    text-decoration: none;
    cursor: default;
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
