# Plan

Working plan for the rewrite. Results and details live in `research/README.md` and
`research/NOTES.md`; this file tracks what is done and what is next.

## Where things stand (2026-09-17)

Version 2.0.0 is built, tested and ready for the Chrome Web Store. Phases 1 to 17 are
done; what is left below is either a release step or an improvement.

Next, in this order:

1. Check by hand on live YouTube, Netflix and Prime, then publish (see Release).
2. Review mode in the word log, built from the reader's own lines (phase 9).
3. Export the word log to CSV or Anki (phase 9).
4. CEFR level for each word (phase 11).
5. Model work: more rare-sense data (phase 13), and detecting lines where no sense fits
   (phase 15).
6. Probabilities and calibrated confidence like Jev's (phase 18); trying Jev once a key
   arrives (phase 19), and adding it as a provider if it earns it (phase 20).

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

### 9 — word log

- [x] Save each looked-up word with its line, video and timestamp, automatically
- [x] A page listing them, grouped by video, with search and removal
- [x] Link back to the moment, on YouTube only for now
- [x] For unsure answers, the reader picks the right meaning in the log, not mid-film
- [ ] Review built from the reader's own lines
- [ ] Export to CSV or Anki
- [ ] Decide whether "Ask your model" answers go into the log too; only the local answer does now
- [ ] Cap the answer cache in `storage.local`, which is never cleared (about 1 KB a lookup)

## Release

- [x] CI: lint, format, build and tests on every push and pull request
- [x] Version 2.0.0, a changelog, and `npm run package` for the store zip
- [x] Privacy policy, store listing, permission reasons and store screenshots
- [ ] Check by hand before publishing: live captions on YouTube, Netflix and Prime, the
      keyboard shortcut, and a real Claude and OpenAI call
- [ ] Publish on the Chrome Web Store

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
- [ ] Decide what the card does for very common verbs (`have`, `get`); they were left out
      of the labelled data and the model is weak on them

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

## Part three: decisions like Jev

TypeSafe's Jev (released 2026-09-15) answers a question over a fixed set of options with
a probability for each and a calibrated confidence, and writes no text. Picking a
WordNet sense for a line is that kind of question. Cloud only, behind a waitlist, and its
benchmarks are the vendor's own.

### 18 — probabilities and calibrated confidence

The local model returns raw scores and a yes/no `confident`. Make it return a
probability for each sense and a confidence that means what it says.

- [ ] Turn scores into probabilities (softmax, temperature fitted on validation words)
- [ ] Map the gap to a confidence (the top score alone barely separates right from
      wrong, see phase 15); fit on validation words only
- [ ] Reliability table: at each confidence, how often the sense is right
- [ ] Keep the 85% bar: the card leads with one sense only above the confidence that
      clears it; must not lead less often than the 0.081 gap on test
- [ ] `Choice` carries `probability` per sense and a numeric `confidence`; `confident`
      is derived from it
- [ ] Log keeps the confidence; decide whether the card shows it

### 19 — trying Jev

Needs a TypeSafe key (on the waitlist).

- [ ] `research/scripts/jev.py`: each line's WordNet senses as one `choice` question
- [ ] Score on the working set; the sealed lines only as a footnote, since they were
      opened in phase 17
- [ ] Accuracy, reliability of its confidence, speed and cost next to the phase 17 table
- [ ] Where it wins and loses against ours: slang, idioms, common words
- [ ] Decide on the numbers whether phase 20 is worth doing

### 20 — Jev as a provider

Only if phase 19 says so. Like Claude and OpenAI: optional, the reader's own key.

- [ ] Jev picks the sense among the local model's candidates; it writes no explanation,
      so it is a second opinion on the sense, not a replacement for the explain step
- [ ] Host permission requested only when a key is entered; key in `storage.local`
- [ ] Settings, PRIVACY.md and the store's permission reasons updated
- [ ] Tests with a mocked API

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

- The local model picks a dictionary sense; a written explanation needs a provider key.
- It cannot use world knowledge ("he pulled a Houdini").
- Irony and wordplay have no right sense to pick.
