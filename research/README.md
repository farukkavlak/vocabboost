# research

How the extension's local model was built and measured. Nothing here ships directly;
`make extension` exports what the extension uses.

What was learned along the way, including what didn't work, is in [NOTES.md](NOTES.md).

## The task

A reader clicks a word in a subtitle line. WordNet lists the word's senses; the model
picks the one the line uses. It is a 22M-parameter sentence encoder
(`all-MiniLM-L6-v2`) that encodes the line and each sense, and ranks the senses by
cosine similarity.

## Final comparison

On the 51 sealed hand-labelled lines, opened once after everything else was fixed
(`make comparison SET=sealed`). `first` is how often the right sense comes first.

|                       | first | 95% range | top 3 | per lookup | cost per lookup | download |
| --------------------- | ----: | --------: | ----: | ---------: | --------------: | -------: |
| first sense           | 56.9% |    43–69% |     - |      <1 ms |              $0 |    19 MB |
| untrained encoder     | 41.2% |    29–55% |   71% |          - |               - |        - |
| **our model, Chrome** | 64.7% |    51–76% |   84% |     134 ms |              $0 |    62 MB |
| Claude Haiku 4.5      | 80.4% |    68–89% |     - |      1.1 s |        $0.00022 |        - |
| GPT-4o mini           | 74.5% |    61–84% |     - |      1.3 s |        $0.00003 |        - |

For reference: the labeller agreed with themselves on 28 of 30 lines (93%), and on a
different, standard benchmark Blevins and Zettlemoyer (2020) report 65.5 F1 for the first
sense and 79.0 for a trained bi-encoder.

- Our model beats the first sense by 8 points and runs offline, free, about eight times
  faster. It trails Claude by 16 points and GPT-4o mini by 10.
- When it leads with one sense it was right every time (14 of 14). When it is unsure, the
  right sense is in the three it shows on half of its misses (9 of 18).
- Where it loses: the 3 lines where no sense fits (it cannot say so), slang and idiom
  (`kicking that shit`, `one last big score`), and fine WordNet distinctions (`night`,
  `date`). The gap is widest on common words (10 of 17 against Claude's 15).
- 51 lines is few. Our range overlaps both hosted models', so the true gap may be
  smaller (or larger) than it looks.
- Claude Haiku 4.5 and GPT-4o mini were two of the five models whose labels trained ours.
  Provider times include the fal.ai round trip.

## Results

On the 149 hand-labelled lines. `first` is how often the right sense is ranked first;
`first 3` how often it is in the top three.

|                               | first | first 3 |
| ----------------------------- | ----: | ------: |
| first sense in the dictionary | 55.0% |       - |
| untrained 22M encoder         | 47.7% |   75.2% |
| untrained 110M encoder        | 55.7% |   80.5% |
| trained on SemCor             | 64.4% |   86.6% |
| **+ tuned on subtitle lines** | 65.8% |   87.2% |
| the labeller, relabelling     | 93.0% |       - |

The last row is a ceiling: 30 lines relabelled blind days later matched the first answer
28 times.

On the 409 test lines of the panel-labelled set, at three seeds:

| seed | trained on SemCor | + tuned |
| ---- | ----------------: | ------: |
| 17   |             66.5% |   69.2% |
| 23   |             65.3% |   68.5% |
| 41   |             66.7% |   69.9% |

The model does best where it matters least. When the right sense is the word's commonest
one it is right 84% of the time; when it is another sense, 46%. Readers look words up
mostly in the second case.

| test set      | right sense   | lines | model | top 3 |
| ------------- | ------------- | ----: | ----: | ----: |
| hand-labelled | the commonest |    82 | 85.4% | 98.8% |
|               | another one   |    67 | 41.8% | 73.1% |
| panel test    | the commonest |   252 | 83.7% | 99.6% |
|               | another one   |   157 | 45.9% | 83.4% |

## How it was built

**Sense inventory: WordNet.** Wiktionary covers no more of real use (95.4% against 95.2%
over 10,000 subtitle lines) and splits meanings more finely. WordNet also comes with
SemCor's human labels.

**Phrases first.** A third of WordNet's lemmas are phrases. Matching them (`ran into` →
`run into`, `check it out` → `check out`) lifted the first-sense baseline from 45.6% to
55.0% on its own.

**A hand-labelled test set.** 201 subtitle lines, balanced across three frequency bands;
51 are sealed until the final comparison.

**Subtitle labels from a panel of models.** Five models from different families label
each line independently, each with the senses in its own shuffled order. Where all five
agree, the label matched a person 97% of the time (60 lines checked blind); where four
agree, 80%. The 3,708 unanimous lines are used. Adding the 4-of-5 lines was a tie at
three seeds, so the cleaner set stays.

**A fixed split by word.** 2,175 words are split once into train, validation and test
(`data/label-split.json`), stratified by frequency band, so no word appears on two sides
and every run uses the same split.

**Two-stage training.** First on all 177,665 SemCor examples, then three epochs on the
subtitle lines, keeping the epoch that scores best on the validation words. Mixing both
into one set did worse than SemCor alone. More data of SemCor's kind stopped helping:
OMSTI's million examples added nothing.

**Knowing when not to lead with one sense.** Confidence is the gap between the first and
second sense's scores; the top score alone barely separates right from wrong. The bar was
set first: a sense the card leads with must be right 85% of the time, the labeller's own
agreement. The lowest gap that clears it on the validation words is **0.081**.

|            | leads with one | right | otherwise, right sense in top 3 |
| ---------- | -------------: | ----: | ------------------------------: |
| validation |          45.5% | 85.1% |                           87.6% |
| test       |          43.5% | 88.2% |                           90.5% |

When the model is unsure, the card shows three senses: on test, the right one is first,
in the top two and in the top three 55%, 78% and 91% of the time, and each further sense
adds about three points.

**Probabilities and a confidence that means what it says.** Scores are cosine
similarities, not probabilities, and "confident" was only yes or no. Both are now fitted
on the validation words and reported on the 409 test lines with more than one sense
(`make calibrate`):

- A softmax over a line's scores with temperature 0.0614 gives each sense a probability.
  The right sense's log loss falls from 1.52 to 0.90.
- The confidence is a logistic curve over the gap, the signal phase 15 found. It is
  calibrated to within 6 points on average (ECE 0.059): of the answers it gives 90–100%,
  98.6% are right; of those it gives 60–70%, 70.5%.
- The curve rises with the gap, so the card leads with one sense exactly where it did:
  gap 0.081 is confidence 0.685.
- The first sense's softmax probability works as a confidence too (ECE 0.057), and would
  lead more often (48.7%), but falls just under the bar on test (84.9%), so it is not used.

With 409 lines, differences of a point or two in these numbers are noise.

## Jev

TypeSafe's Jev answers a question over a fixed set of options with a probability for each
and no prose, which is the shape of picking a sense. Each line's WordNet senses go to it
as one `choice` question, named `sense-1`, `sense-2`... in an order shuffled per line, with
`none` offered as the panel models had it. It needs a key (`TYPESAFE_KEY` in `.env`).

|                  | working, 149 lines | sealed, 51 lines |
| ---------------- | -----------------: | ---------------: |
| first sense      |              45.6% |            56.9% |
| ours             |              65.1% |            64.7% |
| GPT-4o mini      |              65.1% |            74.5% |
| Claude Haiku 4.5 |              68.5% |            80.4% |
| **Jev**          |          **79.2%** |        **82.4%** |

It is also the fastest and the cheapest of the hosted models: 0.8 s a line, and $0.0055
for all 200 lines together.

**Its confidence holds up.** Of the working lines it answered above 0.9 confidence, 96.2%
were right (78 lines); between 0.5 and 0.7, 70.0% (20 lines). That is why the extension
leads with one sense above 0.9.

**It can say no sense fits**, which ours cannot: on the working lines it said so 7 times
where 5 lines were labelled that way.

**Asking it only when ours is unsure is worse than asking it always** (77.9% against
79.2%): on the lines ours calls itself sure, Jev was still ahead, 88.1% to 85.1%.

With 149 and 51 lines these differences carry a few points of noise, and the sealed lines
had been opened once already, in the phase 17 comparison.

## In the browser

The model is exported to ONNX and run with `transformers.js` in an offscreen page.

| copy         |  file | same first choice as PyTorch | first | memory in use |
| ------------ | ----: | ---------------------------: | ----: | ------------: |
| 32-bit float | 91 MB |                      409/409 | 69.2% |       ~730 MB |
| 16-bit float | 46 MB |                      409/409 | 69.2% |       ~700 MB |
| **8-bit**    | 23 MB |                      381/409 | 68.9% |   **~450 MB** |

All three answer in about 0.1 s a word. The 8-bit copy ships: the 16-bit one saves no
memory, because the browser widens its weights back to 32 bits. Weights are quantized per
row of each matrix; one scale per matrix lost 4.2 points. The 8-bit score also varies a
little by runtime: 68.0% in Python, 68.9% in Chrome, 66.5% in Node.

**The part of speech matters.** Every labelled line was tagged with NLTK before a sense
was chosen. Without a tag the model picks among all of a lemma's senses and drops from
69.2% to 59.7%, under the 85% bar. JavaScript taggers (compromise, wink, en-pos) agree
with NLTK on 87–91% of lines and still fall under the bar, so the extension ships a port
of NLTK's own tagger, which gives the same tags on all 1,666 fixture lines.

**The vocabulary ships as JSON** (19 MB), not SQLite: smaller, about 120 MB in memory
against 150, and no library.

The extension is about 62 MB unpacked. The offscreen page closes after two idle minutes;
in the extension the model adds about 350 MB while open, and closing the page gives it
back within about half a minute (`npm run test:memory`).

## Not solved

- **No sense fits.** The gap does not detect it: on lines where all five models said no
  sense fits, the card still leads with one about half the time (6 of 14).
- **Very common verbs** such as `have` and `get` were left out of the labelled data, so
  the model was never measured on them. The one seen so far, `had`, was wrong.
- **Merging senses nobody can tell apart.** WordNet's own structure does not separate
  them; the attempt is in the notes.

## Running it

Setup and data:

```sh
make setup       # virtualenv and NLTK data
make pool        # sample 200k subtitle lines, count word frequencies   (~7 min)
make wiktionary  # download and trim the Wiktionary dump                (~30 min)
make vocab       # build vocab.db from WordNet
make semcor      # training examples from SemCor
make ufsac       # training examples from OMSTI and MASC                (~10 min)
```

The hand-labelled test set:

```sh
make candidates  # pick 201 lines to label
make phrases     # point lines that are phrases at the phrase
make label       # label by hand; REDO=4,9 reopens lines                (~2 hours)
make split       # 149 to work with, 51 sealed
make recheck     # days later, relabel 30 blind
```

The panel-labelled set:

```sh
make teacher        # draw lines the test set never saw
make panel          # ask five models about each line               (~70 min, ~$4)
make panel-check    # score the panel against the hand labels
make labels         # join lines and answers into teacher-labels.jsonl
make check-teacher  # hand-label 100 panel lines blind
make label-split    # split the words into train, validation and test
```

Measuring:

```sh
make baseline     # the first-sense strategy
make evaluate     # score data/model on the hand-labelled lines
make compare      # every model side by side
make failures     # the lines the model gets wrong
make sense-split  # commonest sense against the rest
make confidence   # choose and report the confidence threshold
make calibrate    # fit probabilities and a calibrated confidence
make jev-probe    # one line to TypeSafe's Jev, printing the raw answer
make jev          # ask Jev every line of a set, cached
make jev-report   # Jev's accuracy, confidence, speed and cost
make pos-effect   # with and without the part of speech
```

For the extension:

```sh
make extension    # onnx + tagger + vocab-json
make onnx         # export data/model, and copy the 8-bit copy into the extension
make check-onnx   # compare the exported copies with PyTorch
make tagger       # NLTK's tagger and its test fixture
make vocab-json   # vocab.db as JSON and its test fixture
```

`lexicons`, `phrase-split`, `phrase-impact` and `sense-distance` reproduce one-off
measurements from the notes.

Files in `data/` that are in git, because remaking them costs hours or money:

- `candidates.jsonl`: the hand-labelled lines
- `panel.jsonl`: the panel's answers on them
- `teacher-panel.jsonl`, `teacher-labels.jsonl`: the panel's answers on the larger set,
  and the labels taken from them
- `teacher-check.jsonl`: the blind hand check of the panel
- `label-split.json`: the word split

## Training on Kaggle

Training needs a GPU, so it runs on Kaggle (about 18 minutes for SemCor on a free GPU).
`kaggle/run.py` trains and scores one model; `kaggle/kernel.py` runs every job in one
session.

Install the CLI with `uv tool install kaggle` and put an API token in
`~/.kaggle/access_token`. The account has to be phone-verified to get a GPU.

```sh
make kaggle M="what changed"    # upload the data as a new version, push the kernel
kaggle kernels status ofarukkavlak/vocabboost-wsd-training
kaggle kernels output ofarukkavlak/vocabboost-wsd-training -p data/
```

Unzip a model into `data/model` to measure it here.
