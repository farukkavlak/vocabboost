# Research notes

Short notes on what we learned, in the order we learned it. Current numbers are in
[README.md](README.md).

## Test set

- Subtitle lines come from OpenSubtitles. We stream the 3.6 GB file and sample from it
  instead of downloading it.
- Target words are picked by frequency, not by how ambiguous they are. The most
  ambiguous words are `get`, `go`, `have`, and nobody looks those up.
- Words are split into three bands: everyday, common, uncommon. The bands are not equally
  hard, so we report each one.
- Very common words (over 5,000 uses in the pool) are dropped. They mostly do grammar.
- Senses are shuffled when labelling. Otherwise the first sense gets picked too often.
- More than one sense can be accepted for a line. WordNet splits meanings very finely.
- `n` = the line is fine but no sense fits (`club` in `club soda`). `x` = the line is
  broken.
- 51 of the 201 lines are sealed. We pick them once, before labelling, so they never
  change.
- Relabelling 30 lines blind, days later: I agreed with myself 28 times. That is the
  ceiling for any model scored on my labels.

## Dictionary

- WordNet vs Wiktionary on 10,000 subtitle lines: both cover about 95% of words used.
  Wiktionary has more senses per word (7.0 vs 4.7), which makes the task harder.
- So WordNet is the dictionary. It also comes with SemCor's human labels.
- Senses must be stored in WordNet's order per word (commonest first). A bug once stored
  them in file order and put the wrong sense of `safe` first.
- A third of WordNet's entries are phrases (`club soda`, `check out`). Matching phrases
  alone raised the first-sense baseline from 45.6% to 55.0%.
- Phrase matching needs inflection (`ran into` → `run into`) and one pronoun inside
  (`check it out` → `check out`).
- `the boot`, `the street` are skipped as phrases: they clash with the plain noun.
- We tried to find senses people cannot tell apart using WordNet's structure. Five
  signals, none worked.

## Untrained model

- The model turns text into vectors; close meanings get close vectors. We compare the
  line to each sense with cosine similarity.
- Writing a sense as synonyms + definition + examples works best. Examples alone beat the
  definition alone by 7 points.
- Writing the word before the line (`run: he had to run...`) helps a little.
- After phrase matching, the untrained model barely beat the baseline (55.7% vs 55.0%).
  Most of its earlier gain was just the phrase problem.

## Training

- Training runs on Kaggle. A laptop is about 100 times slower. Colab's free session
  ended mid-run, so we moved.
- Negatives in training are other senses of the same word. Random sentences are too
  easy to teach anything.
- SemCor (177,665 examples) took the model from 47.7% to 64.4%.
- More data stopped helping: 50k → 177k gave +5 points, 177k → 1M (with OMSTI) gave 0.
- OMSTI's labels are worse than SemCor's (automatic, not human).
- Mixing subtitle labels into SemCor made it worse. Training on them second worked.
- Seeds matter. Without seeding torch, the same run gave 64.4% and 68.5%. Now we seed
  everything and run three seeds.
- Two runs that agree are not proof. An early +4.0 claim disappeared at three seeds.
- Don't choose the epoch on the set you report. We use the validation words now.
- The training score keeps rising while the real score falls. That is overfitting, so
  the training score can't choose the epoch.

## Labelling with a panel of models

- One model alone is right 65–74% of the time on my lines. Too noisy.
- Five models answer separately. When all five agree, they matched me 97% of the time
  (checked blind on 60 lines). Four of five: 80%.
- Each model needs its own shuffled order. With one shared order, agreement looked
  better than it was.
- Some models (Mistral, Cohere, Phi, DeepSeek) answered with text instead of a number,
  so they are not on the panel.
- About $4 for 8,440 lines. 3,708 had all five agreeing on a sense.
- Adding the 4-of-5 lines (more data, more errors) was a tie. We keep 5-of-5 only.
- Compare two models only on the same lines. The Kaggle log once compared them on
  different lines and looked wrong.
- Split by word, not by line. Otherwise the same word is in train and test.
- The panel's test lines have about 3% wrong labels. Good for comparing models, not for
  claiming an exact score.

## What the model gets wrong

- It is good when the right sense is the commonest one (84%) and weak when it is not
  (46%). Readers mostly need the second case.
- Misses fall into: idioms, words with many senses, senses too close to tell apart,
  lines that need world knowledge, broken lines.

## Confidence

- A high top score does not mean the answer is right.
- The gap between the first and second score does work.
- We set the rule first: a sense the card leads with must be right 85% of the time (my
  own agreement). Then the validation data picked the gap: 0.081.
- It held on the test words: 88% right, on 44% of lines.
- When unsure, show 3 senses. The right one is in them 91% of the time.
- The gap can't tell when no sense fits. Still open.

## In the browser

- ONNX lets the Python model run in JavaScript.
- 8-bit weights: 4× smaller. One scale per matrix lost 4 points; one scale per row lost
  about 1.
- 16-bit weights save disk but not memory. The browser expands them back to 32-bit.
- Memory matters more than download size. 8-bit uses ~450 MB, 16-bit ~700 MB.
- Measure memory for the test browser's own processes only. I once measured the
  biggest Chrome tab on the machine by mistake.
- The model lives in an offscreen page. Chrome stops an idle service worker after 30 s.
- The page closes after 2 idle minutes so the memory is freed.
- Vite inlined the 14 MB runtime into the bundle twice. Using onnxruntime's build with
  external files fixed it (39 MB → 1.2 MB).
- The same 8-bit model scores slightly differently in Python, Chrome and Node.

## Part of speech

- The research always knew the word's part of speech (from NLTK). The browser didn't.
- Without it, accuracy fell from 69% to 60%.
- JavaScript taggers disagree with NLTK on about 10% of words, and still fall short.
- The test labels were made with NLTK's tags, so they are unfair to other taggers.
- So we ported NLTK's own tagger (about 100 lines + 5 MB of weights). Same tags on every
  test line.
- NLTK splits sentences with a trained model (Punkt). A simple rule was close enough:
  1 word's tag changed in 8,580 lines.

## General lessons

- Measure before building. The part-of-speech gap would have broken the extension
  silently.
- Check ports against the original, line by line, with a test that fails when you break
  the code on purpose.
- Set the rule before looking at the data, then let the data pick the number.
- Write down the split and the seeds, so runs can be compared.
