# research

Builds the model. Nothing here ships — the extension only sees what phase 16 exports.

Two files in `data/` are in git because remaking them costs hours or money:
`candidates.jsonl`, the 201 subtitle lines marked by hand, and `panel.jsonl`, what
three models answered on them. Everything else is built by a make target.

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
| **trained 22M encoder**       |  23 MB | **64.4%** | **85.2%** | **90.6%** |
| the labeller, relabelling     |      — |     93.0% |         - |         - |

The extension today shows the first sense the dictionary lists, and is wrong more often
than right. The trained 22M model is both the best here and the only one small enough
to ship.

The last row is the ceiling: 30 lines relabelled blind days later, agreeing with the
first answer 28 times. No model measured against these labels can honestly claim much
past it — and the model is 29 points below, so the gap is real work, not noise.

By frequency band, both measured after phrase matching:

| band     | senses a word | baseline | trained |
| -------- | ------------: | -------: | ------: |
| everyday |           9.3 |    52.0% |   56.0% |
| common   |           5.8 |    70.0% |   72.0% |
| uncommon |           6.0 |    42.9% |   65.3% |

The model is ahead in every band, but the gain is lopsided: 22 points on uncommon words
against 4 and 2 on the others. A common word's commonest sense usually is the right one,
so the dictionary's ordering is hard to beat there. A reader who clicks `vaudeville` is
served much better than one who clicks `play`.

## Running it

```sh
make setup       # virtualenv and NLTK data
make pool        # sample 200k subtitle lines, count word frequencies   (~7 min)
make wiktionary  # download and trim the Wiktionary dump                (~30 min)
make vocab       # build vocab.db from WordNet
make semcor      # training examples from SemCor
make ufsac       # training examples from OMSTI and MASC                (~10 min)
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

Training runs on Kaggle — see below.

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
hierarchy distances, synonym overlap, definition overlap. Over 31 accepted pairs and
249 rejected ones, nothing separates them: 0.18 against 0.16 on hierarchy distance,
0.46 against 0.47 on synonym overlap. WordNet's structure does not carry the
judgement. Parked until a gloss encoder can be asked the same question.

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

25 of the 201 test lines turned out to be phrases, 18 of them in the working set.
Their labels answered the wrong question and were made again, against 2.0 senses on
average instead of 8.3. The first-sense baseline went from 45.6% to 55.0% — nine and a
half points from a dictionary, with no model involved.

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
model is worth 0.7 points, so most of what it appeared to be worth was it compensating
for a badly asked question.

Split by whether the line is a phrase, both models measured the same way:

|              | lines | senses | baseline | untrained 110M | trained 22M |
| ------------ | ----: | -----: | -------: | -------------: | ----------: |
| phrases      |    18 |    2.0 |    88.9% |          83.3% |       94.4% |
| single words |   131 |    7.7 |    50.4% |          51.9% |       60.3% |
| all          |   149 |    7.0 |    55.0% |          55.7% |       64.4% |

On single words the trained model is 9.9 points ahead of the baseline where the
untrained one managed 1.5. On phrases it is ahead too, by 5.6 — the earlier run was
behind the baseline there, which is what suggested skipping the model below three
senses. That rule is off the table: on 18 lines one either way is noise, but the model
is no longer the risk.

### Where it goes wrong

53 of 149 lines get the wrong sense first; 31 of those still have a right sense in the
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

### How high the ceiling is

`make recheck` shows 30 already-labelled lines again, days later, shuffled and without
the earlier answer. Agreement with that answer was **28 of 30**.

Two reasons the number flatters us. It is the same person twice, where the published
70–78% is two different people, and intra-annotator agreement is always the higher of
the two. And the test is lenient: `1,3` first and `3` second counts as agreement. On 30
lines the interval is roughly ±9 points, so the honest reading is a ceiling somewhere
above 84%.

Even at 84% the model is twenty points short, which is what makes the next phase worth
paying for. The two lines that disagreed are the expected kind:

- _"At night he becomes the night-walker"_ — `become` as entering a state, or as
  undergoing a change.
- _"The captain's never forgotten about Mars"_ — `captain` as a leader, or as a rank.

Neither line says which. They are WordNet distinctions too fine to make from one line,
and the model will lose them too.

## Training

Runs on Kaggle, not here. Eighteen minutes on a free GPU; 42 seconds a step on an
M-series Mac, about a hundred times slower, and it locks the machine up. There is no
local training script, because a path that does not work invites someone to try it.

It was on Colab until the free session limit — around fifty minutes — killed a run
overnight and took its log with it. Kaggle gives twelve hours a session and runs
detached, so the machine here can be closed.

`kaggle/run.py` trains and scores; `kaggle/kernel.py` is what Kaggle executes, and it
runs every job in one session so a single push answers every question. Both read the
`.jsonl` files the builders produce, so the data is prepared on a laptop where it can
be looked at, and the GPU only trains.

Needs the Kaggle CLI and a token: `uv tool install kaggle`, then Settings → API on
kaggle.com, and the token string into `~/.kaggle/access_token`. The account has to be
phone-verified or Kaggle quietly hands out a CPU instead of a GPU, which is why
`kernel.py` stops on the first line if there is no GPU.

```sh
make ufsac                      # once: download the corpora and build the examples
make kaggle M="what changed"    # upload the data, push the script
kaggle kernels status ofarukkavlak/vocabboost-wsd-train
kaggle kernels output ofarukkavlak/vocabboost-wsd-train -p data/
```

Then unzip a model into `data/model` and run `make evaluate` here. It uses the same
code that scored the untrained models, so the comparison is like for like.

### The run

`all-MiniLM-L6-v2`, all 177,665 SemCor examples, one epoch, batch of 64. Wrong answers
are drawn from the other senses of the same word — telling `safe` the strongbox from
`safe` the contraceptive is the job, telling it from "the weather is nice" is not.

The data is split by word, not by row, so a word in training never appears in
validation. On those held-out words the triplet score went from 0.674 to 0.793.

Against the baseline the trained model is +9.4. The cleaner number is the same model,
same lines, same evaluation code, before and after training: +16.7 points.

### More data stopped helping

Four runs, one epoch each, same model and same evaluation. Only the data changed.

| data         |  examples | held-out triplets | first | first 3 |
| ------------ | --------: | ----------------: | ----: | ------: |
| semcor       |    50,000 |             0.766 | 59.1% |   82.6% |
| semcor       |   177,665 |             0.793 | 64.4% |   85.2% |
| omsti        |   177,665 |             0.769 | 61.1% |   85.2% |
| semcor+omsti | 1,033,556 |         **0.805** | 64.4% |   85.9% |

Two answers in one table.

**OMSTI's labels are worse than SemCor's.** Same size, 3.3 points behind, which is what
automatic alignment against human annotation costs. Still 6 points over the baseline,
so it is not junk.

**More data has stopped buying anything.** 50k to 177k was worth 5.3 points; 177k to
1.03M is worth zero. The curve flattened between those two runs.

The held-out column is the interesting part. The combined run scores highest there —
0.805, above either corpus alone — while its subtitle score does not move. The model
did get better at the task as SemCor and OMSTI pose it. That improvement just does not
reach film dialogue, which is the domain gap stated as a measurement rather than a
worry.

By band the tie hides a trade. Against the SemCor run, adding OMSTI is +8 on common
words and −6 on everyday ones. Fifty lines a band, so treat the size with caution, but
the direction is consistent with OMSTI being a different register rather than more of
the same.

One caveat on the comparison: Kaggle gave the OMSTI runs two T4s, so their effective
batch was 128 against SemCor's 64 on one. Fewer, larger updates. Some of OMSTI's 3.3
points could be that rather than its labels.

### The corpora

UFSAC bundles fifteen sense-annotated corpora in one XML format, all keyed to WordNet
3.0, which is what `vocab.db` uses. Two are worth training on, and `build_ufsac.py`
turns them into the same rows `build_semcor.py` produces.

| corpus | examples | words | senses | commonest sense | examples a word |
| ------ | -------: | ----: | -----: | --------------: | --------------: |
| semcor |  177,665 | 9,008 |    8.1 |           68.5% |              20 |
| omsti  |  978,044 | 8,633 |    9.0 |           46.5% |             113 |
| masc   |   41,276 | 3,064 |    6.3 |           60.2% |              13 |

SemCor was marked by people. OMSTI was aligned automatically from parallel text, so it
is large and, as the runs below show, noisier; MASC is smaller but includes
transcribed speech and is untouched so far.

OMSTI is deep rather than broad: nearly SemCor's vocabulary with five times the
examples a word, so it teaches known words in more contexts rather than new words.

Only 46.5% of its examples are the commonest sense against SemCor's 68.5% — closer to
how a reader uses a dictionary, since you look a word up when the obvious sense does not
fit. That read two ways: either OMSTI holds the harder examples, or automatic alignment
skews away from common senses and the labels are unreliable. Training on it settled it
in favour of the second; see the runs below.

MASC needed a decision. 63,253 of its words carry two sense keys where the annotator
would not choose — more than the 41,276 kept — and those are dropped rather than
resolved to the first. OMSTI has the same problem 2,690 times, so it is a MASC problem,
not a UFSAC one.

### Left on the table

One epoch, and 22M parameters. But the measured bottleneck is neither: a million
examples moved the held-out score and not the subtitle score, so what is missing is
subtitle-register training data, not more of the same.

## Labelling with a panel of models

The student can never beat its labels, and one model alone is wrong more often than it
sounds. So before spending anything on ten thousand lines, three models were run over
the 200 already marked by hand — a teacher is only scorable against an answer key.

Each model answers alone, with the senses shuffled in its own order. Models anchor on
the first option the way people do, and WordNet lists senses commonest first.

|                  | matches the person |
| ---------------- | -----------------: |
| claude-haiku-4.5 |              73.5% |
| gemini-2.5-flash |              74.5% |
| gpt-4o-mini      |              70.0% |

Each on its own lands where published evaluations put single models on this task,
between 56% and 77%. Agreement is what changes that:

|              | lines | matches the person |
| ------------ | ----: | -----------------: |
| 3 of 3 agree |   132 |              86.4% |
| 2 of 3 agree |    58 |              53.4% |
| 1 of 3 agree |    10 |              40.0% |

So keeping only unanimous answers gives labels for two thirds of the data at 86.4%.
For comparison, two trained human annotators agree on fine WordNet distinctions about
70–78% of the time — though the unanimous lines are the easy ones, where people would
agree more too, so it is not a like-for-like comparison.

The lines the panel splits on are not waste: they are the genuinely ambiguous ones, and
what phase 15 needs to teach the model when to say nothing.

Cost: $0.000429 a line for three models, so ten thousand lines is about $4.30.

### Now worth spending

The free data is spent. SemCor is used in full, OMSTI adds nothing on top of it, and a
million examples moved the held-out score without moving the subtitle score. More of the
same register will not close the gap, and the ceiling is high enough that there is a gap
worth closing.

That is the argument the $4.30 needed. It was not available before the runs, which is
why they came first.

### If a panel is used

Ten model families answer on fal's OpenRouter endpoint: Anthropic, Google, OpenAI,
Meta, Mistral, Alibaba, DeepSeek, xAI, Cohere, Amazon. Five different families is
easily reachable and more diverse than three.

Three of them failed the format, though. Asked for a number alone, Mistral replied
`Sure: "okay"`, Cohere `Okay.`, and Phi a paragraph. A judge has to answer in the shape
asked for, so the panel is picked from the ones that do.
