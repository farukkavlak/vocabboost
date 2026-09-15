# Rewrite Plan

Working document. One phase per branch, merged into `main` before the next starts.

## Why

The 2023 version screenshotted the tab, sent the PNG to Google Cloud Vision for OCR, drew
a button over every recognised word, and asked a server for a definition.

1. OCR was unnecessary. Subtitles are in the DOM. Reading them back out of pixels is
   fragile, costs an API call per lookup, and needs `<all_urls>` plus screenshot
   permissions, which alone keep it out of the Web Store.
2. The word was sent without its line, so "run" got the same answer every time.
3. The server used `text-davinci-003` through `openai` v3. Both retired.
4. The content script matched `*://*/*` and knew nothing about where it was running.

## Phases

### 1 — `chore/cleanup`

- [x] Merge the two `.gitignore` files into one
- [x] Drop the unused `notifications`, `scripting` and `tabs` permissions
- [x] Narrow `host_permissions` and `content_scripts.matches` from `*://*/*`
- [x] Delete the `removeListener(arguments.callee)` line, which threw in strict mode
- [x] Move `nodemon` to `devDependencies`

### 2 — `chore/toolchain`

- [x] npm workspaces, Vite build, TypeScript, `@types/chrome`
- [x] Port `background.js` and `content.js` to `.ts`, types only
- [x] ESLint, Prettier, `.editorconfig`, husky + lint-staged
- [x] Scripts: `build`, `lint`, `format`, `typecheck`

Decided: plain TypeScript and CSS. React and Tailwind for one settings form is more
machinery than this earns.

### 3 — `refactor/remove-ocr`

- [x] Delete the Vision call, the API key constant, the base64 payload
- [x] Delete `captureVisibleTab` and the bbox maths (`dpr`, scroll offset, `innerWidth`)
- [x] Drop `vision.googleapis.com` from `host_permissions`
- [x] Read captions with a `MutationObserver` and keep the last ~5 lines with their
      `video.currentTime`

### 4 — `refactor/caption-port`

- [x] A `CaptionSource` port and a registry that picks by `matches(location.href)`
- [x] YouTube (`.ytp-caption-window-container`) and Netflix (`.player-timedtext`)
- [x] Generate the manifest's match patterns from the registry, so a platform is declared
      once
- [x] Prime (`.atvwebplayersdk-captions-text`), from a live session on 2026-09-09

Netflix's selectors are unverified against a live session. The tests prove the mechanism,
not the selectors.

Prime is on `primevideo.com` only. It also streams from `amazon.com/gp/video`, which
would mean injecting the content script into Amazon's shopping paths, so that is left
until it can be checked.

Prime cost the port four changes, each with a test that fails without it:

- Only the caption line carries a stable class. The fourteen ancestors between it and
  `.atvwebplayersdk-player-container` are generated (`span.fbhsa9`, `div.f1iwgj00`), so
  the container has to be the player. Hiding that while the panel stands in would black
  out the film, so `hideSelector` hides the lines instead.
- Prime breaks a long line with `<br>`, which contributes no whitespace to `textContent`:
  "confidentiality<br>codes" arrived as one word. `innerText` handles the break but reads
  as empty while the panel has the caption hidden, which put the glued line in the buffer
  instead. Both are avoided by replacing the breaks on a copy of the node.
- The container is the player, so the observer fires on every seek-bar tick. A line that
  has not changed returns before anything is measured.
- The first `<video>` in the document is a 0x0 placeholder, so `getVideo` takes the
  largest one rather than the first.

`containerIsCaptionLayer` says whether the container can stand in for a missing segment.
YouTube and Netflix draw captions in a layer of their own, where its text, bounds and font
size are the caption's. Prime's is the whole player, where each of those would be wrong:
the panel would be sized to the video and set in the player's UI font.

### 5 — `feat/overlay`

- [x] Remove the `window.alert` override and every inline style
- [x] A stylesheet in a shadow root, so the page and the panel cannot reach each other
- [x] The panel: shortcut, pause, clickable words, previous line above, Esc to resume

Decided: the panel takes the caption's place so the eye does not move, and the meaning
opens under the clicked word.

### 5b — polish

Screenshots of the built extension (`npm run shots`) showed what reading the code had not.

- [x] The panel grew downwards and ran off short windows. It is anchored on its own line
      of words, aligned to the caption's centre, and grows upwards.
- [x] Chips made the line read as a tag cloud. Every token is drawn now; only the words
      worth a lookup are buttons, marked on hover. The lookup still uses the bare word.
- [x] The fixed 19px became the caption's own computed size, so it matches in fullscreen.
      The card's text is scaled from it but bounded.
- [x] Width is the caption's plus what the hover padding adds, capped at 92% of the
      window.
- [x] The card was white over a dark video and covered the sentence. It is dark, points
      at its word, and clears the whole line.
- [x] Esc closes the card first, the panel second. The panel takes focus so the arrow
      keys walk the line. The hint says "click anywhere" rather than Esc: in fullscreen
      the browser takes Esc to leave fullscreen, so advertising it would throw the film
      out of fullscreen on the way past.

Resuming: the shortcut and Esc were the only ways back. The content script listens for
the video's `play` event now, so however it is started the panel gets out of the way.
Clicking outside dismisses it too. A video that was already paused is left paused.

### 6 — `refactor/meaning-provider`

Decided: **the dictionary answers first, the model only when asked.** The audience is
people learning English inside English, so an English definition is the answer they want.

The 2023 mistake was not using a model, it was sending the word alone. Measured against
`dictionaryapi.dev` on 2026-09-09:

|                       | Dictionary                                   | Model                         |
| --------------------- | -------------------------------------------- | ----------------------------- |
| `department`, `alone` | instant, free, cacheable                     | a wasted call and a 2s wait   |
| `run`                 | 63 senses, the first one literally "To run." | picks the sense the line uses |
| `run into`            | looks up "run", loses the phrasal verb       | sees the phrase               |
| `ran`, `better`       | often missing (`ran` answered 522 that day)  | unaffected                    |
| pronunciation         | IPA and a recording                          | cannot give one               |
| usage example         | a real example per sense                     | invents one                   |

- [x] `DictionaryApiProvider`: no key, the default. Fills `partOfSpeech`, `senses`,
      `example`, `phonetic`, `audio`.
- [x] "In this sentence" on the card asks the model with the whole line, and keeps the
      pronunciation the dictionary gave.
- [x] Providers are a registry like `sources/`. `llm.ts` holds the prompt, the schema and
      the request; `anthropic.ts` and `openai.ts` are a dozen lines each. The reader
      chooses this one, unlike a caption source, which recognises its own page.
- [x] Cache in `chrome.storage.local`, keyed by (provider, word), plus the sentence only
      for a provider that reads it. Keying the dictionary by sentence would miss every
      hit.
- [x] Show at most two senses of one part of speech.
- [x] Delete `AnswerFormat.js` and `server/`.
- [x] The pronunciation is fetched and played from a blob. A media element with a remote
      `src` answers to the host page's CSP.

```ts
type Meaning = {
  senses: { definition: string; example?: string }[];
  partOfSpeech?: string;
  phonetic?: string;
  audio?: string;
  phrase?: string; // set when the word belongs to an idiom or phrasal verb
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  translation?: string; // only when a target language is set
};
```

`senses` is a list because the dictionary answers with several and the model with one.
`phrase` matters: looking up "run" alone loses "run into". `cefr` lets the card stay short
for easy words. Both come from the model only.

Decided while building it:

- **Lookups run in the background worker.** Its requests carry the extension's own
  permissions, so no provider's CORS policy matters. Measured 2026-09-09: a page-origin
  preflight to `api.anthropic.com` is refused without
  `anthropic-dangerous-direct-browser-access`; from the worker it is not needed. The key
  also never enters a script sharing a page with the site.
- **Raw `fetch`, not each vendor's SDK.** Anthropic's guidance prefers the SDK, but one
  shared transport keeps both adapters the same shape and the worker at 8 KB, against
  9 MB unpacked for the Anthropic SDK alone. The cost is updating two request shapes by
  hand if an API changes.
- **`claude-haiku-4-5` and `gpt-4o-mini` as defaults.** A subtitle word is a small
  question.
- **Keys in `storage.local`, one per provider.** `sync` would carry them to Google.
- **The paid path sits behind a press,** so the extension is useful with no key, and the
  user's own key is a reasonable ask. That is why `server/` is gone: a hosted proxy buys
  nothing worth its bill.

`dictionaryapi.dev` is a community service with no SLA. It answered 522 three times while
this was built, so a 5xx or a dropped connection is retried twice with a short backoff,
and the reader is told the dictionary is not answering rather than shown a status code.
A second free dictionary is the next step if it keeps happening.

### 7 — `feat/settings`

- [x] Popup: the service first, then one key field, then an optional language
- [x] Provider hosts moved to `optional_host_permissions`, requested beside the key field.
      A keyless install is never asked, and a key is not saved if access is refused.
- [x] Each provider carries a `label` and a link to where its key is issued
- [x] Preferences in `chrome.storage.sync`, keys in `storage.local`, one per provider, so
      switching service does not throw the other key away
- [x] Link to `chrome://extensions/shortcuts`, opened with `chrome.tabs.create` because a
      page cannot link to a `chrome://` URL. `suggested_key` is only a suggestion: a taken
      combination is dropped in silence. It was never assigned under Vivaldi.

A translation is asked for only when a language is set, and then the prompt and the schema
both grow the field.

### 8 — `docs/readme`

- [x] Rewrite the README. The old one was a template with badges, a table of contents for
      three sections, and setup steps for a Vision key and a server that no longer exist.
- [x] `npm run recording` plays the flow once under Playwright and turns the video into
      `docs/flow.gif`, so it is regenerated rather than kept by hand
- [x] Delete `screenshots/`, which showed the OCR-era flow

### 9 — `feat/logbook`

Not started. Part two came first, because a record of words you looked up is worth
more once the lookup itself is good. This gets designed from scratch when it comes up.

Where this is going. A lookup popup is a commodity; the record is not. The line, the
video, the timestamp, and the fact that you did not know that word there.

- [ ] Save the word with its line, video and timestamp on lookup
- [ ] A page listing them, grouped by video
- [ ] Review built from the user's own sentences

It gives the extension a reason to be opened when nothing is playing, and puts the model
somewhere it earns its cost.

## Testing

Playwright drives a real Chromium with the built extension loaded.

- `npm test` — the deterministic suite. `context.route` serves a fixture under a
  `youtube.com` URL, so the manifest's match pattern applies and the content script is
  injected as in production.
- `npm run test:live` — hits youtube.com and checks only that the DOM contract holds.
- `npm run shots` — writes PNGs of the panel. Asserts nothing; the layout defects in
  phase 5b were invisible in test output.
- `npm run recording` — rebuilds `docs/flow.gif`. Needs ffmpeg.

Anything asserting on geometry waits for the opening animation first (`settled()` in
`tests/fixture.ts`). A rect read mid-animation is where the animation has it, not where it
was placed, which is what an intermittent 2-4px failure turned out to be.

Four things the suite cannot cover:

1. **Caption text on the live site.** YouTube reports every caption track as
   `is_servable: false` for a signed-out automated session, so no subtitle is rendered
   under Playwright. The fixture's markup is our reconstruction.
2. **The keyboard shortcut.** `chrome.commands` shortcuts cannot be triggered from
   Playwright, so tests message the content script directly and the wiring in
   `background.ts` is untested.
3. **Granting an optional host permission.** Chrome asks in its own bubble, which
   Playwright cannot click, so `chrome.permissions.request` is stubbed. The permission is
   enforced (a worker `fetch` to an ungranted origin fails, measured 2026-09-09), but a
   routed request is fulfilled before Chrome checks, so the model tests pass without it.
   What the suite proves is that the page asks for the right origin and refuses to save a
   key when access is denied.
4. **A live call to a model provider.** Both are stubbed. One real call with a real key
   should be made by hand before release.

Checked by hand on YouTube, 2026-09-09: the panel showed the words of the line on screen,
and the buffer served the previous line after the caption had cleared.

## Part two: the model

Decided 2026-09-09: build the meaning provider ourselves, so the extension answers with no
key and no network. Anthropic and OpenAI stay, as the better answer for whoever has a key.

The job is not to write meanings. A dictionary already holds them. The job is to pick the
one the line means:

> `run` has 63 senses. Which one is this?

That is classification, not writing, and small models are good at it. A 22M parameter
sentence encoder is about 23MB once quantized and answers in milliseconds on the reader's
own machine.

Claude is still used, but at build time, not at run time. A panel of models labels our training
data, and Claude fills gaps in the dictionary. The result ships as a data file. Nobody's browser ever calls
it.

### How to work through this

One phase per branch, as before, plus two rules for this part:

1. **Nothing is written that has not been explained first.** Every phase opens with what it
   teaches. If a term appears in the code but not in this plan, the plan is wrong and gets
   fixed before the code is.
2. **Every phase ends with a number.** Not "it feels better". The next phase begins by
   beating the last number.

The work lives in `research/`, in Python, outside the extension. Only phase 16 touches
`extension/`. If phase 12 or 14 fails to beat its baseline, we stop and keep the dictionary
provider. That is a real outcome, not a failure.

### 10 — `research/baseline`

**Learn:** what a test set is, why it is built before anything else, how accuracy is
measured, and why the model must never see the test set while it is being trained.

- [x] `research/` with a Python environment and a `Makefile`
- [x] 200 lines pulled from OpenSubtitles, each with one word worth a lookup, spread
      evenly over three frequency bands so the everyday words that carry the most
      meanings are not left out
- [x] Mark the right sense for each by hand, choosing from the sense list
- [x] Split them: 149 to work with, 51 sealed until phase 17
- [x] Measure how often "just show the first sense" is right, per band and overall.
      45.6% overall, and 36.0% on the everyday words a beginner is likeliest to click.
- [x] Relabel 30 of them blind, days later, and measure how often you agree with
      yourself: 28 of 30. It flatters us — same person twice where the published 70-78%
      is two people, and a lenient test where `1,3` then `3` counts as agreement — so
      read it as a ceiling somewhere above 84%. The model is at 64.4%, twenty points
      short, which is what makes phase 13's second half worth paying for. Both
      disagreements were WordNet distinctions the line does not settle: `become` as
      entering a state against undergoing a change, `captain` as a leader against a rank.
- [x] Run the phase 13 panel of models over the same 200 lines and compare it to the
      hand labels. A unanimous panel of three matches the person 86.4% of the time and
      covers two thirds of the lines; each model alone manages 70-74%. So the panel may
      label at scale, but only where it agrees.

**Exit:** one number, and it is 45.6%. Phase 11 raised it to 55.0% by asking about
phrases rather than the words inside them, and 55.0% is what later phases are measured
against.

Without this there is no way to tell an improvement from a change.

These 200 are labelled by hand and no model touches them. Models agree with each other
more readily than they are right, and unanimity concentrates on the easy lines, so a set
labelled that way would carry perhaps five to ten wrong labels in every hundred. On 200
lines that is the same size as the difference we are trying to measure. It is also the
only reason phase 17 means anything: a test set written by Claude and GPT would score
Claude and GPT well, and would score a model distilled from Claude well too.

### 11 — `research/lexicon`

**Learn:** tokenizing, lemmatizing, and how to measure whether a data source covers your
problem. No machine learning in this phase at all.

WordNet stopped in 2011 and was built from written English. Subtitles are spoken English.
Wiktionary is updated daily and holds slang, `gonna`, and `sus`. `kaikki.org` publishes it
as machine readable JSON, so it does not have to be scraped.

Annotators asked to choose among WordNet's senses agree with each other between 67% and
78% of the time; on coarser inventories they agree around 90%. That gap is a ceiling on
the whole task, because senses nobody can tell apart cannot be told apart by a model
either. Choosing the inventory may matter more than choosing the model, which is why this
phase measures before it builds.

Measured, the expectation was wrong. Wiktionary covers no more of actual use than WordNet
does — 95.4% against 95.2% — and splits meanings more finely, not less: 7.0 senses a word
against 4.7. So WordNet is the inventory and Wiktionary fills the words it lacks, which
are interjections and function words rather than slang. That keeps SemCor's 187,000 human
labels and the published numbers to compare against.

The ceiling stays, and the way through it is to cluster WordNet's own senses rather than
to swap the source. That is known to work when people do it: OntoNotes merged senses until
annotators agreed 90% of the time rather than 70%, and disambiguation against the merged
inventory reaches 87-89% where fine-grained WordNet reaches 79. Finding those merges
automatically is the open question, and the cheap attempt at it failed.

- [x] Pull the Wiktionary dump and measure both sources over 10,000 subtitle lines,
      before building anything on either
- [x] Build `vocab.db` (SQLite) from WordNet: 117,659 senses stored once, 157,300
      entries pointing at them, 27 MB
- [ ] Fill the words WordNet lacks from Wiktionary. Two of the 25 phrase lines needed
      it: WordNet knows `at a loss` only as "below cost" and `go back` only as "date
      back", and Wiktionary has the everyday reading of both.
- [x] Try to find the senses nobody can tell apart from WordNet's own structure, its
      synonyms and its definitions. None of the five signals separate the pairs a
      labeller merged from the pairs they kept apart, so this is parked until phase 12
      can ask a gloss encoder the same question.
- [x] Add a lemmatizer so `ran` finds `run`. WordNet's irregular list plus a handful
      of suffix rules.
- [ ] Add CMUdict for pronunciation and a CEFR word list for level
- [x] Match phrases, so `run into` is not looked up as `run`. A third of WordNet's
      lemmas are already phrases, so this was never missing data. Matching needs the
      first word lemmatised and one object pronoun allowed inside — `check it out` is
      `check out`, `ran into` is `run into`.
- [x] Measure what it was worth: the first-sense baseline goes from 45.6% to 55.0%,
      and 25 of the 201 test lines were answering the wrong question and were labelled
      again.
- [x] Measure coverage over 10,000 subtitle lines, by distinct word and weighted by
      how often each word occurs, with senses per word alongside it
- [ ] Measure coverage again once Wiktionary is filling WordNet's gaps

**Exit:** two coverage numbers, a count of how finely each source splits meanings, and a
database file with a known size.

It changed what phase 12 means. Against the old baseline the untrained embeddings were
worth 5.4 points; against this one they are worth 0.7, and on phrase lines they are worse
than showing the first sense. Most of what the model appeared to be worth was it
compensating for a question asked badly. The case for training now rests on training.

At the end of this phase the extension could already ship offline, at baseline quality.
Everything after it is about picking a better sense.

### 12 — `research/embeddings`

**Learn:** what an embedding is, what cosine similarity measures, and what "zero-shot"
means. This is the phase where meaning turning into numbers stops being a metaphor.

The idea is small. Turn the subtitle line into a list of numbers. Turn each candidate sense
into a list of numbers. Pick the sense whose numbers sit closest to the line's.

This shape has a name and a published result. Blevins and Zettlemoyer called it a
bi-encoder: one encoder reads the line, another reads the gloss, and the nearest sense
wins. It scored 79.0 F1 where a first-sense baseline scored 65.5, and the code is open. We
are not inventing an architecture, we are shrinking a known one — their model is two
BERT-bases, around 220M parameters, and ours has to fit in a browser at a tenth of that.
Those figures are on a different test set and do not transfer; what transfers is the gap
they found between a first-sense baseline and a trained bi-encoder.

- [ ] Read the bi-encoder paper and its code before writing any
- [x] Run the model locally through `sentence-transformers`
- [x] Embed the line, embed every sense, take the nearest
- [x] Measure against phase 10, on the 149, never the 51. 51.0% against the 45.6%
      baseline of the time, with no training at all.
- [x] Measure whether the right sense is first, in the top three, and in the top five.
      81.2% and 89.9%, so the card should list three and the gain is far larger than
      the top-one figure suggests.
- [x] Try more than one way of writing a sense down. Its examples beat its definition
      by seven points, because the definitions are abstract and the question is a line
      somebody spoke.
- [x] Look at 20 failures by hand and write down what kind they are. Five kinds:
      idioms where the word carries no meaning alone, everyday words with too many
      senses, distinctions too fine to make, lines that need world knowledge, and
      garbled lines we should have dropped. The first two are most of them and both
      are fixable.
- [x] Try to sort the misses by how wrong they are, and find that WordNet's hierarchy
      cannot do it: its verbs are three levels deep against nine for nouns, so two
      near-synonyms score further apart than two unrelated senses. Second time its
      structure has failed to carry a human judgement.

**Exit:** accuracy with no training at all: 51.0% against the 45.6% baseline of the time.
Worth seeing before spending a week on training. Phase 11 then raised the baseline to
55.0% and left the untrained model worth 0.7 points.

It comes with a catch. The model that scores 51% has 110M parameters and will not fit in
a browser; the 22M one lands at 45.6%, level with the baseline of the time and no better.
Phase 14 has to close that gap, and now it has a number to close it to.

### 13 — `research/dataset`

**Learn:** distillation, what makes a label trustworthy, and why a lopsided dataset teaches
a lopsided model.

Distillation means a large model teaches a small one. The teacher labels examples, the
small model learns from the labels, and afterwards the small model works alone.

Most of the teaching does not need a teacher at all. SemCor is 187,000 sense annotations
made by people, it ships with NLTK, and it is what the bi-encoder in phase 12 was trained
on. It costs nothing and it is not guessing. What it is not is film: SemCor is books and
journalism, and our sentences are spoken, short and full of idiom.

So the data has two sources with two jobs. SemCor teaches the task. Model labels over
subtitle lines teach the register. Where models are used they answer as a panel rather
than alone, each seeing the senses in its own shuffled order, because the student can
never be better than its labels and a single model is wrong more often than it sounds —
one evaluation puts GPT-4 between 56% and 77% on this task depending on the setup.

- [x] Train on SemCor first and measure. It was most of the distance: 64.4% against a
      baseline of 55.0%, and +16.7 points over the same model untrained.
- [x] Exhaust the free data first. Done, and it is spent: SemCor in full, OMSTI on top
      of it, 1,033,556 examples. Paying for labels before measuring the free corpora
      would have repeated the Wiktionary mistake.
- [x] Download UFSAC and build examples from it in the SemCor format. OMSTI gives
      978,044, MASC 41,276. OMSTI is deep rather than broad — the same vocabulary as
      SemCor with five times the examples a word — and only 46.5% of its examples are
      the commonest sense against SemCor's 68.5%, which is closer to how a reader uses
      a dictionary. Whether that means harder examples or skewed automatic labels is
      what the training run has to settle.
- [x] Train on OMSTI at SemCor's size and on the two together. OMSTI alone gives 61.1%
      against SemCor's 64.4% — automatic labels cost 3.3 points. The two together give
      64.4%, exactly the SemCor number, so six times the data bought nothing.
- [x] Read the held-out column, not just the subtitle one. The combined run scores 0.805
      there against 0.793 and 0.769 — the best of the three — while its subtitle score
      does not move. The model got better at the task as these corpora pose it and no
      better at film dialogue. That is the domain gap measured rather than assumed, and
      it is the argument for paying for subtitle labels.
- [x] Pick the panel by measuring it, not by arguing. Five families — Anthropic, Google,
      OpenAI, Meta, Alibaba — agree unanimously on 84 of 200 lines and match the person
      on 92.9% of them, against 109 lines at 89.9% for three. Three points cleaner for
      twelve points of coverage, which is the right trade now that more labels have
      stopped helping. DeepSeek answers in prose on 57 of 200 and is out, like Mistral,
      Cohere and Phi.
- [x] Seed the sense shuffle by line _and_ model. Seeding by line alone gave all five
      models one shared order: unanimity looked like 105 lines at 91.4%, and a fifth of
      it was five models anchoring the same way. Fixed, it is 84 lines at 92.9%, and how
      many models agree became monotonic — 92.9, 78.9, 62.2, 38.5 — so the count is a
      usable confidence signal for phase 15.
- [x] Pull 10,000 subtitle lines and put each one to the five models independently.
      8,440 after dropping the single-sense lines, 42,200 calls, about $3. The test set
      was held out of the draw, so no line is in both.
- [x] Where they agree, take the label. Where they split, keep the line and the split.
      3,833 unanimous — 3,708 labels and 125 lines where no sense fits — against 4,598
      split ones. Unanimity ran at 45.5% where the 200-line measurement predicted 42%.
      `teacher-labels.jsonl` holds all 8,431 with the agreement count on each.
- [x] Check 100 of the labels by hand and report how often the teacher is wrong. Blind,
      buckets mixed: 5 of 5 is 58/60, 4 of 5 is 32/40. Unanimity beat its predicted
      92.9% and both misses are WordNet granularity rather than wrong labels. 4 of 5
      landed on its prediction, so adding it is half again as much data for six points
      of label error — phase 14 trains both and reports both.
- [x] Keep the lines the panel could not agree on. 4,598 of them, with the count of how
      many agreed, which the 200-line measurement showed is itself a difficulty score —
      92.9% right at five, 78.9% at four, 62.2% at three. Phase 15 calibrates on it.
- [ ] Search the corpus for rare senses on purpose and add those lines. Left alone, the
      data is nearly all common senses, and the model learns to always guess the common
      one. That is the exact opposite of what a reader needs, because a reader looks a word
      up when the usage is odd. The bi-encoder paper measures the size of this: 94.1 F1 on
      the commonest sense of a word against 52.6 on the rest. The gap, not the average, is
      the real problem.
- [ ] Add "none of these senses fit" examples, which phase 15 needs
- [ ] Split into train, validation and test, and record the split

**Exit:** a dataset with a measured label error rate and a sense distribution we chose
rather than inherited, plus a second, larger test set labelled by the panel. It is
reported separately from the hand-labelled 200 and never replaces it: large enough to
narrow the error bars, biased enough that it cannot settle a comparison on its own. Cost
is a few dollars of API calls.

### 14 — `research/train`

**Learn:** the training loop itself. Loss, epoch, batch, learning rate, and what a loss
curve looks like when a model is memorizing instead of learning. Then **domain
adaptation**: how to teach a model a second register without retraining it from nothing.

The two corpora are not interchangeable. SemCor is 177,665 examples of books and
journalism; the panel labels are 3,708 examples of film dialogue. Mixed into one pile the
subtitle lines are 2% of it, and one pass over 2% will not move the weights — the result
would read as "subtitle data did not help" when what failed was the mixing.

So it is done in two stages. SemCor first, where the model learns the task: given a line
and a sense, tell whether they match. Then a second, short run from that finished model
on the subtitle labels alone, where every batch is film dialogue rather than one in
fifty. The model already knows the job and is only being shown what the job looks like in
this register.

`run.py --from <model>` is the whole of the code change. The concept is the reason for it.

- [x] Fine-tune the encoder so a line lands near its right sense and away from the
      wrong ones. Eighteen minutes on a free GPU; 42 seconds a step on a laptop, which
      is why there is no local training script. Colab's free session ends around fifty
      minutes and killed an overnight run, so training moved to Kaggle: twelve hours a
      session, detached.
- [ ] Train in two stages and compare against mixing. Four jobs in one session:
      SemCor alone as the control, SemCor with the labels mixed in, and two runs that
      continue from the control on the labels alone — one at 5 of 5, one including
      4 of 5. Three epochs on the short runs, since 3,708 examples is 58 steps.
- [ ] Watch training loss and validation loss together. Training loss falling while
      validation loss rises is overfitting, and it is the single most useful thing to learn
      to recognize.
- [ ] Measure on the phase 13 test split
- [ ] Report it split by how common the sense is, not as one average. A model at 94 on
      commonest senses and 53 on the rest averages to something respectable and is still
      wrong exactly when it is asked.
- [x] Report it split by frequency band, against the baseline as it stands after phrase
      matching: 56.0% against 52.0% on everyday words, 72.0% against 70.0% on common,
      65.3% against 42.9% on uncommon. It is ahead everywhere now, but the gain is
      lopsided — 22 points on uncommon words against 4 and 2 on the rest, because a
      common word's commonest sense usually is the right one.
- [x] Try one smaller and one larger model and record accuracy, size and speed for
      each. The trained 22M beats the untrained 110M by 8.7 points at a fifth of the
      size, which is the only comparison that matters — the 110M was never going in a
      browser.

**Exit:** a trained model that beats phase 12, and it does: 64.4% against 55.7% for the
untrained 110M and 55.0% for the baseline. Eighteen minutes on a free GPU.

Two runs, one changing only the amount of data: 50,000 examples gave 59.1%, all 177,665
gave 64.4%, and the held-out triplet score moved with it (0.766 to 0.793). So the gain
is the task being learned, not SemCor being memorised, and more data is still buying
points.

The smaller and larger runs decide more than model choice. If the larger model is clearly
better, the ceiling is size, and a model too big for a browser could be served from a
machine we already own. If both plateau in the same place, the ceiling is the data, and a
bigger machine changes nothing. Offline stays the goal either way: a server means we see
what people look up, and it means the extension stops working the day the server does.

### 15 — `research/confidence`

**Learn:** why a similarity score is not a probability, what calibration is, and the trade
between answering more often and answering correctly.

The model always returns its nearest sense, even when nothing fits. It has to be able to
say so.

- [ ] Pick a threshold on the validation set, never the test set
- [ ] Plot accuracy against how often the model answers, and choose the point deliberately
- [ ] Below the threshold the card stops claiming. It shows the senses that fit, side
      by side and unranked, and says plainly that the line does not settle it.
- [ ] Above the threshold the card leads with one sense and folds the rest away behind
      a count. The other meanings stay one click from the reader either way, because
      ranking second is not the same as being absent.
- [ ] How many senses sit above the fold comes from the phase 12 numbers, not from
      taste. Showing every sense is what the extension does today, and a wall of
      thirteen definitions is the problem, not the fix. The ranking is what we add.

**Exit:** a threshold, with the accuracy and the answer rate that come with it.

The point is that a reader is never shown a confident wrong answer. That matters more than
the headline number: a wrong meaning delivered with certainty is what gets learned.

The card does not offer to call a model. Whoever wants one has chosen it in settings, and
for everyone else it is an advert in the middle of an answer.

### 16 — `feat/local-provider`

**Learn:** quantization, what an inference runtime does, and why a Manifest V3 service
worker cannot hold a model.

- [ ] Export to ONNX and quantize to int8. Roughly a quarter of the size for a small
      accuracy cost, which gets measured rather than assumed.
- [ ] If it is still too heavy, look at distilling the encoder to static embeddings
      (Model2Vec and the like). Far smaller and far faster, at a cost in accuracy that,
      again, gets measured.
- [ ] Confirm the quantized model gives the same answers as the Python one on the test set.
      This step is skipped often and is where silent breakage lives.
- [ ] Run it with `transformers.js` inside a `chrome.offscreen` document. The worker is
      killed after about 30 seconds idle, so a model loaded there would reload constantly.
      The offscreen document stays alive and the worker messages it.
- [ ] `providers/local.ts`, same interface as `anthropic.ts` and `openai.ts`, no key, no
      host permission, and the default choice
- [ ] Ship `vocab.db` and the weights as data. Manifest V3 bans remote code, but weights
      are data. The runtime `.wasm` is code and has to be bundled.

**Exit:** the extension answers with the network off.

### 17 — `docs/comparison`

**Learn:** how to report a result without overselling it.

- [ ] Open the 51 sealed lines from phase 10 and score every provider on them, once
- [ ] A table of accuracy, latency, cost per lookup and download size for: first sense,
      untrained embeddings, our model, Haiku, GPT-4o-mini
- [ ] Put the published numbers in the same table — a first-sense baseline of 65.5 and a
      bi-encoder at 79.0 — so ours is read against the field and not against itself
- [ ] Put the self-agreement figure from phase 10 next to them. A model at 74 where a
      person repeats themselves 76 of the time is a different result from a model at 74
      where a person repeats themselves 95.
- [ ] Write down where ours loses, not only where it wins
- [ ] Put the table in the README

**Exit:** the table. It is the most valuable output of this whole part.

### 18 — `research/writing`

Only if phase 17 says a chosen sense is not enough. An encoder picks, it cannot write. To
write a sentence-specific explanation the model has to generate text, which is a different
architecture and a much larger job.

**Learn:** the difference between an encoder and a decoder, and why generation is harder to
judge than classification.

- [ ] Read up on definition modeling, which is the name for this task
- [ ] Distill from Claude again, this time on written explanations rather than labels
- [ ] A 200M to 500M parameter model, which means a real GPU and a much larger download
- [ ] Judge the output, which is the hard part: there is no single right answer, so
      accuracy no longer applies

Written down so it is not forgotten. Not started until phase 17 justifies it. A dictionary
sense chosen well may simply be the right answer for people learning English inside
English, and if so this phase never happens.

### Data sources

- **OpenSubtitles** — our own domain, billions of words of subtitles
- **WordNet 3.0** — the sense inventory, and what SemCor's keys point at
- **Wiktionary via kaikki.org** — current, covers slang, machine readable
- **SemCor and UFSAC** — sense-labelled gold data, for training and comparison
- **WiC** — a benchmark asking whether two lines use a word the same way
- **CMUdict** — pronunciation
- **CEFR-J, EFLLex** — level lists
- **spaCy** — lemmatizer and part of speech tagger
- **A panel of five model families, via fal.ai** — the subtitle labels, phase 13

All free and open except the last, which is paid and whose output is not ours to
relicense. The shipped model is weights trained on it, not the labels themselves, but
`teacher-labels.jsonl` is in the repository and the distinction matters: the code is
MIT, the data it was built from is not all ours to give away. The Kaggle dataset says
"other" rather than CC0 for the same reason.

### What this will not do

Honest limits, after the ones we can fix with data:

1. **It picks, it does not write.** The reader gets a real dictionary sense, not prose
   composed for their line. Phase 18 exists for this and may never be needed.
2. **World knowledge.** "He pulled a Houdini" needs to know who Houdini was. No lexicon
   holds that.
3. **Irony and wordplay.** The literal sense is the wrong answer, and there is no right one
   to pick.

Not on the list, because they are not really limits:

- **Context beyond the line.** Claude only sees the line too. Ours is not behind here.
- **Slang and new words.** A Wiktionary problem, solved in phase 11 by choosing it.
- **Rare senses.** A data balance problem, handled in phase 13.
- **Saying "I don't know".** A calibration problem, handled in phase 15.

## Deferred

**Hosted backend.** Settled in phase 6: bring-your-own-key, and `server/` is deleted.
Revisit only if key handling turns out to be what stops people installing it.
