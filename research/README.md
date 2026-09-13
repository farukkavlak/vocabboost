# research

Builds the model. Nothing here ships — the extension only sees what phase 16 exports.

Only `data/candidates.jsonl` is in git: 201 subtitle lines with their senses marked by
hand. Everything else in `data/` is downloaded or built, and rebuilds from a make
target.

## Results

Each number is the share of 149 hand-labelled lines where the right sense came first.
`first 3` and `first 5` are the share where it was somewhere in the top three or five,
which is what the card shows.

|                               |   size |     first |   first 3 |   first 5 |
| ----------------------------- | -----: | --------: | --------: | --------: |
| first sense in the dictionary |      0 |     45.6% |         - |         - |
| + phrase matching             |      0 |     55.0% |         - |         - |
| untrained 22M encoder         |  23 MB |     47.7% |     75.2% |     88.6% |
| untrained 110M encoder        | 110 MB |     55.7% |     80.5% |     89.3% |
| **trained 22M encoder**       |  23 MB | **59.1%** | **82.6%** | **91.3%** |

The extension today shows the first sense the dictionary lists and is wrong more often
than right. The trained model is the only one small enough to ship and the best of the
lot.

By frequency band, both measured after phrase matching:

| band     | senses a word | baseline | trained |
| -------- | ------------: | -------: | ------: |
| everyday |           9.3 |    52.0% |   52.0% |
| common   |           5.8 |    70.0% |   64.0% |
| uncommon |           6.0 |    42.9% |   61.2% |

All of the model's gain is on uncommon words, where it is 18 points ahead. On everyday
words it draws, and on common words it is 6 points behind — there the dictionary's own
ordering is hard to beat, because a common word's commonest sense usually is the right
one.

That split matters for shipping. A reader who clicks `vaudeville` is much better served
than one who clicks `play`, and the phrase layer rather than the model is what carries
the everyday words.

## Running it

```sh
make setup       # virtualenv and NLTK data
make pool        # sample 200k subtitle lines, count word frequencies   (~7 min)
make wiktionary  # download and trim the Wiktionary dump                (~30 min)
make vocab       # build vocab.db from WordNet
make semcor      # training examples from SemCor
```

Building the test set, in order:

```sh
make candidates  # pick 201 lines worth labelling
make phrases     # point the lines that are really phrases at the phrase
make label       # mark the right sense by hand                         (~2 hours)
make split       # 149 to work with, 51 sealed until phase 17
make recheck     # days later: how often do you agree with yourself?
```

`make label` saves after every answer. `make label REDO=4,9` reopens answered lines.

Measuring:

```sh
make baseline    # what the extension does today
make evaluate    # score data/model against the working set
make compare     # every model side by side
make failures    # the lines the model gets wrong
make lookup      # check phrase matching on a few known cases
```

The one-off measurements quoted below have targets too, so their numbers can be
reproduced: `lexicons`, `phrase-impact`, `phrase-split`, `sense-distance`.

Training runs on Colab — see below.

## Building the test set

**The corpus is streamed, not downloaded.** OpenSubtitles is 3.6 GB gzipped. We read
from the start, keep what is usable, and stop at a byte budget. Reservoir sampling
spreads the sample across everything read, so the lines are not all from three films.

**Target words are chosen by frequency, not by ambiguity.** Picking the most ambiguous
word gives `get`, `go` and `have` every time, and nobody looks those up. Frequency
comes from the pool itself, so it measures the language of film.

**Three frequency bands, reported separately.** A beginner stops at `play`; someone
further along only at `vaudeville`. The bands are not equally hard — everyday words
average 11.5 senses against 6.4 — and one overall number hides that. Words above five
thousand occurrences are dropped: `do` and `have` are tagged as verbs but carry no
meaning to look up.

**Senses are shuffled before the labeller sees them.** WordNet lists them commonest
first, and how often the first one is right is the thing being measured.

**Several senses can be accepted, and answers can be marked unsure.** Trained native
annotators agree on about three WordNet labels in four. That is the sense list's
fault, not the labeller's: `1,3` accepts both, `?1` records a doubt, and the score is
reported with and without the doubtful lines.

**`n` and `x` differ.** `n` means the line is fine and no sense fits — `club` in `club
soda` carries none of its own meanings, which is what phase 15 learns from. `x` means
the line is garbled and was never a fair question, so it leaves the set.

**51 lines are sealed** and opened once, in phase 17. Which lines is decided from the
full file before any labelling, so the sealed set cannot shift as more labels arrive.

## Choosing the sense inventory

Measured over 7,198 distinct words from 10,000 subtitle lines. "Trimmed" drops senses
marked obsolete, archaic, rare, historical, dated, or as spelling variants.

|                     | by word | by use | senses | 10 or more |
| ------------------- | ------: | -----: | -----: | ---------: |
| WordNet             |   85.2% |  95.2% |    4.7 |        390 |
| Wiktionary          |   89.3% |  96.4% |    7.8 |       1463 |
| Wiktionary, trimmed |   87.3% |  95.4% |    7.0 |       1135 |

The plan expected Wiktionary to win on both counts. It does not. Coverage is a tie
where it matters — 95.2% against 95.4% of actual use — and the words only Wiktionary
carries are function words and interjections, not slang. On granularity it is worse:
`club` is 7 senses in WordNet and 13 in Wiktionary.

So WordNet is the inventory, with Wiktionary filling the words it lacks. That keeps
SemCor's 187,000 human labels and the published numbers to compare against.

Granularity is still the ceiling — annotators agree on fine WordNet distinctions about
70% of the time. Merging the senses nobody can tell apart would raise it, and OntoNotes
shows it works: they merged until agreement hit 90%, and disambiguation against the
merged inventory reaches 87–89% where fine-grained WordNet reaches 79.

Finding those merges automatically failed. The pairs a labeller accepted together were
compared against the pairs they rejected over five signals — subject file, two
hierarchy distances, synonym overlap, definition overlap — and nothing separated them
(0.17 against 0.16 on the best one). WordNet's structure does not carry the judgement.
Parked until a gloss encoder can be asked the same question.

## vocab.db

27 MB of SQLite: 117,659 senses stored once, 157,300 entries pointing at them, 5,859
irregular forms so `ran` finds `run`. Senses are shared — `run` and `go` have one in
common — so storing them once rather than per word took the file from 40 MB to 27 MB.

Two bugs found while building it. Senses were stored in WordNet's file order rather
than per word, which put the contraceptive sense of `safe` above the strongbox and
would have made the first-sense baseline meaningless. And `Confederacy` was
overwriting `confederacy`, dropping senses.

### Phrases

A third of WordNet's lemmas are phrases — 64,334 of them, including `club soda`,
`check out` and `pull together`. The idioms that showed up in phase 12's failures were
never missing data. We were asking what `club` means in `club soda`.

Matching them needs more than string equality: `check it out` is `check out` with a
pronoun inside, `ran into` is `run into` inflected. So each position is tried in its
dictionary form and one object pronoun is allowed inside a two-word phrase. WordNet
files a few slang idioms under `the something` — `the boot` for dismissal — which
collide with the plain noun on nearly every line, so those are skipped.

25 of the 201 test lines turned out to be phrases. Their labels answered the wrong
question and were made again, against 2.0 senses on average instead of 8.3. The
first-sense baseline went from 45.6% to 55.0% — nine and a half points from a
dictionary, with no model involved.

## Embeddings

An embedding model turns text into numbers arranged so that close meanings land close
together. Untrained, it has never seen this task.

| change                                           | effect      |
| ------------------------------------------------ | ----------- |
| represent a sense by its examples, not its gloss | 38.3 → 45.0 |
| write the target word in front of the line       | 45.0 → 45.6 |
| a 110M model instead of a 22M one                | 45.6 → 51.0 |

Examples beat definitions by seven points. WordNet's definitions are abstract — "the
dark part of the diurnal cycle" — while its examples are how people speak, and the
question is a line somebody spoke.

Those numbers predate phrase matching. Against the 55.0% baseline the untrained 110M
model is worth 0.7 points, and on phrase lines it is worse than showing the first
sense: a phrase carries two senses on average and the first is right nine times in ten.
So most of what the untrained model appeared to be worth was it compensating for a
badly asked question.

### Where it goes wrong

73 of 149 lines get the wrong sense first; 45 of those still have a right sense in the
top three. How badly wrong the rest are is not measured — WordNet's verbs are three
levels deep against nine for nouns, so `buy` as trade scores further from `buy` as
purchase than `hand` the body part does from `hand` the card game.

Read by hand, the misses are five kinds:

- **Idioms** — `pull yourself together`. Fixed by phrase matching.
- **Everyday words with many senses** — `hand` has 14, `check` has 25. Fixed by training.
- **Distinctions too fine to make** — `man` as "adult male with a manly character"
  against "adult person who is male". Would need clustering.
- **World knowledge** — "Yvonne's gone over to the enemy" is a wartime scene and the
  line does not say so. Cannot be fixed.
- **Garbled lines** that should have been dropped with `x`.

## Training

Runs on Colab, not here. Five minutes on a free T4; 42 seconds a step on an M-series
Mac, about a hundred times slower, and it locks the machine up. There is no local
training script, because a path that does not work invites someone to try it.

`colab/run.py` does everything in one run: builds the SemCor examples, trains, scores
against the hand-labelled lines, saves the model. One script rather than notebook
cells, because a Colab runtime that recycles between cells takes the trained model with
it.

```
upload colab/run.py and data/working.jsonl to a Colab notebook with a T4 runtime
!pip -q install sentence-transformers
!python run.py
```

Then unzip `model/` into `data/model` and run `make evaluate` here. It uses the same
code that scored the untrained models, so the comparison is like for like.

### The run

`all-MiniLM-L6-v2`, 50,000 SemCor examples, one epoch, batch of 64. Wrong answers are
drawn from the other senses of the same word — telling `safe` the strongbox from `safe`
the contraceptive is the job, telling it from "the weather is nice" is not.

The data is split by word, not by row, so a word in training never appears in
validation. On those held-out words the triplet score went from 0.674 to 0.766.

Against the baseline the trained model is +4.1, which on 149 lines is inside the error
bar. The convincing number is elsewhere: same model, same lines, same evaluation code,
+11.4 points from training alone.

### Left on the table

One epoch, and 50,000 of 177,665 examples. SemCor is books and journalism while the
test set is speech. And 68.5% of training examples are the commonest sense of their
word, which is the opposite of when a reader reaches for a dictionary.
