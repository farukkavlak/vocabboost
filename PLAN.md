# Plan

Working plan for the rewrite. Results and details live in `research/README.md` and
`research/NOTES.md`; this file tracks what is done and what is next.

## Why the rewrite

The 2023 version screenshotted the tab, sent it to Google Cloud Vision for OCR, and asked
a server what the word meant, without the line it came from.

- Subtitles are already in the DOM; OCR was slow, costly and needed broad permissions.
- Without the line, "run" got the same answer every time.
- The server used models that have since been retired.

## How we work

- One phase at a time, in order.
- Nothing goes into the code before it is understood.
- Every research phase ends with a number, and the next phase has to beat it.
- Small changes go straight to `main`; larger ones get a branch and a PR.

## Part one: the extension

### 1 — cleanup ✅

- [x] One `.gitignore`, unused permissions dropped, host permissions narrowed
- [x] Broken strict-mode code removed, dev dependencies sorted

### 2 — toolchain ✅

- [x] npm workspaces, Vite, TypeScript, ESLint, Prettier, husky + lint-staged
- [x] Plain TypeScript and CSS; no framework for one settings form

### 3 — remove OCR ✅

- [x] Vision API, screenshots and bounding-box maths removed
- [x] Captions read with a `MutationObserver`; the last few lines are kept

### 4 — caption sources

- [x] A `CaptionSource` interface and a registry, one file per platform
- [x] YouTube, Netflix and Prime Video; the manifest's match patterns come from the registry
- [ ] Check Netflix's selectors against a live session

### 5 — overlay ✅

- [x] A panel in a shadow root that takes the caption's place, with clickable words
- [x] Scales with the caption, grows upwards, and its card clears the line
- [x] Esc closes the card, then the panel; playing the video closes it too

### 6 — meaning providers ✅

- [x] Lookups run in the background worker, so API keys never reach the page
- [x] Claude and OpenAI through one shared `fetch` provider, with a JSON schema
- [x] Answers cached in `storage.local`, per line for providers that read it

The free dictionary built here was replaced by the local model in phase 16.

### 7 — settings ✅

- [x] Popup: provider, key, optional translation language, shortcut link
- [x] Provider host permission asked only when a key is saved
- [x] Keys in `storage.local`, one per provider; preferences in `storage.sync`

### 8 — README

- [x] README rewritten; `npm run recording` regenerates `docs/flow.gif`
- [x] GIF re-recorded with the phase 15 card

### 9 — logbook

Not started; comes after part two.

- [ ] Save each looked-up word with its line, video and timestamp
- [ ] A page listing them, grouped by video
- [ ] Review built from the reader's own lines

## Testing

Playwright runs a real Chromium with the built extension.

- `npm test`: the full suite, with pages served from fixtures under the real URLs
- `npm run test:live`: checks the DOM contract on youtube.com
- `npm run shots`: screenshots for visual review
- `npm run test:memory`: checks the model's memory is given back (slow)
- `npm run recording`: rebuilds `docs/flow.gif` (needs ffmpeg)

Not covered: live caption text (YouTube hides captions from automated sessions), the
keyboard shortcut, Chrome's permission prompt, and real provider calls. Check these by
hand before a release.

## Part two: the local model

Goal: answer with no key and no network. A dictionary already holds the meanings; the
model picks the sense the line uses. That is classification, which a small model can do
in the browser. Claude and OpenAI stay as an optional second step.

The research lives in `research/`, in Python. Only phase 16 touches the extension.

### 10 — test set ✅

- [x] 201 subtitle lines labelled by hand, across three frequency bands
- [x] 149 to work with, 51 sealed until phase 17
- [x] First-sense baseline: 45.6%
- [x] Self-agreement ceiling: 28 of 30 lines

### 11 — dictionary

- [x] WordNet chosen over Wiktionary after measuring both
- [x] `vocab.db` built from WordNet (27 MB)
- [x] Lemmatizer and phrase matching; the baseline rises to 55.0%
- [x] Automatic sense merging tried; it did not work
- [ ] CEFR level for each word
- [ ] Fill words WordNet lacks from Wiktionary (optional; unknown words say so)
- [ ] Measure coverage again after that

### 12 — untrained model

- [x] Sentence encoder; the nearest sense wins
- [x] Best sense text: synonyms + definition + examples
- [x] Failures read by hand and grouped
- [ ] Read the bi-encoder paper (Blevins and Zettlemoyer, 2020) and its code

### 13 — training data

- [x] SemCor, OMSTI and MASC converted; more data of this kind stopped helping
- [x] A panel of five models labelled 8,440 subtitle lines (about $3)
- [x] Panel checked by hand: 97% right when all five agree, 80% at four
- [x] Train, validation and test split by word, saved to `data/label-split.json`
- [ ] Add lines with rare senses on purpose; the model is weakest there (46%)

### 14 — training ✅

- [x] Two stages: SemCor, then the subtitle labels
- [x] Seeded, three seeds per setting; epoch chosen on validation words
- [x] 65.8% on the hand-labelled lines, 69.2% on the panel test lines
- [x] 5-of-5 labels only; adding 4-of-5 was a tie
- [x] Reported by frequency band, and by commonest sense against the rest

### 15 — confidence

- [x] Confidence = the gap between the first and second score
- [x] Threshold 0.081, chosen on validation: leads on 44% of test lines, 88% right
- [x] When unsure, show three senses (the right one is among them 91% of the time)
- [x] Card: when confident, lead with one sense and fold the rest behind a count
- [x] Card: when unsure, show the likeliest senses side by side and say so
- [x] The card never covers the subtitle line; long lists scroll inside it
- [ ] Detect lines where no sense fits (the gap does not)

### 16 — local model in the extension

- [x] ONNX export; the 8-bit copy (23 MB) chosen for memory (~450 MB in use)
- [x] Exported copies checked against PyTorch on the test lines
- [x] Part of speech measured as necessary; NLTK's tagger ported to TypeScript
- [x] Lemmatizer and phrase matching ported and checked against `lookup.py`
- [x] Vocabulary shipped as JSON
- [x] The whole chain scores 69.2% on the test lines, matching the research
- [x] The model runs offline in an offscreen page that closes after two idle minutes
- [x] The local model is the default; the free dictionary is removed
- [x] Memory is freed after the idle close: about +350 MB while open, back within ~30 s
- [x] Pass which occurrence of a word was clicked; 2 test lines still differ, from the
      simpler sentence split
- [ ] If the model is still too heavy, try static embeddings (Model2Vec)

### 17 — comparison ✅

Ours 64.7%, GPT-4o mini 74.5%, Claude Haiku 80.4% on the sealed lines.

- [x] Open the 51 sealed lines once and score every option on them
- [x] One table: accuracy, speed, cost per lookup and size for first sense, the untrained
      encoder, our model, Claude and OpenAI
- [x] Put the published numbers (first sense 65.5, bi-encoder 79.0) next to ours
- [x] Put the self-agreement ceiling next to them
- [x] Write down where ours loses
- [x] Add the table to the README

### 18 — writing explanations (only if phase 17 calls for it)

A picked sense may be enough. If not, the model would have to write, which needs a much
larger generative model.

- [ ] Read up on definition modelling
- [ ] Distil written explanations from Claude
- [ ] Train a 200M–500M model
- [ ] Find a way to judge free-text answers

## Data sources

- OpenSubtitles: subtitle lines
- WordNet 3.0: senses
- Wiktionary (kaikki.org): compared, not shipped
- SemCor and UFSAC: human and automatic sense labels
- NLTK: tokenizer, tagger, lemmatizer
- A panel of five models via fal.ai: subtitle labels

The code is MIT. The panel labels in the repository are model output and not ours to
relicense, so the Kaggle dataset is marked "other".

## Limits

- It picks a dictionary sense; it does not write an explanation.
- It cannot use world knowledge ("he pulled a Houdini").
- Irony and wordplay have no right sense to pick.
