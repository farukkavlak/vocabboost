# research

Builds the model. Nothing here ships — the extension only sees what phase 16 exports.

Three files in `data/` are in git because remaking them costs hours or money:
`candidates.jsonl`, the 201 subtitle lines marked by hand; `panel.jsonl`, what the panel
of models answered on them; and `teacher-labels.jsonl`, the 8,431 lines the panel
labelled. Everything else is built by a make target.

## Results

Each number is the share of 149 hand-labelled lines where the right sense came first.
`first 3` and `first 5` are the share where it was somewhere in the top three or five,
which is what the card shows.

|                                |   size |     first | first 3 | first 5 |
| ------------------------------ | -----: | --------: | ------: | ------: |
| first sense in the dictionary  |      0 |     45.6% |       - |       - |
| + phrase matching              |      0 |     55.0% |       - |       - |
| untrained 22M encoder          |  87 MB |     47.7% |   75.2% |   88.6% |
| untrained 110M encoder         | 438 MB |     55.7% |   80.5% |   89.3% |
| trained on SemCor              |  87 MB |     64.4% |   86.6% |   90.6% |
| **+ tuned on subtitle labels** |  87 MB | **65.8%** |   87.2% |   91.9% |
| the labeller, relabelling      |      — |     93.0% |       - |       - |

The extension today shows the first sense the dictionary lists, and is wrong more often
than right. The trained 22M model is the best here and the only one small enough to ship: 23 MB
once its weights are rounded to 8 bits, at a cost of one test line in 409. Sizes here
were once written as 23 MB for the 22M models; that was the rounded size, claimed before
anything was rounded.

The two trained rows are seed 17, the model every other table here is measured on. On
149 lines one line is 0.7 points, so the gap between them is two lines. The fairer
comparison is 409 panel-labelled test lines at three seeds, where tuning is worth +3.0;
the section on seeds has it.

The last row is the ceiling: 30 lines relabelled blind days later, agreeing with the
first answer 28 times. No model measured against these labels can honestly claim much
past it — and the model is 27 points below, so the gap is real work, not noise.

By frequency band, both measured after phrase matching:

| band     | senses a word | baseline | trained |
| -------- | ------------: | -------: | ------: |
| everyday |           9.3 |    52.0% |   58.0% |
| common   |           5.8 |    70.0% |   74.0% |
| uncommon |           6.0 |    42.9% |   65.3% |

The model is ahead in every band, but the gain is lopsided: 22 points on uncommon words
against 6 and 4 on the others. A common word's commonest sense usually is the right one,
so the dictionary's ordering is hard to beat there. A reader who clicks `vaudeville` is
served much better than one who clicks `play`. Fifty lines a band and one seed, and the
uncommon figure has read 71.4% and 63.3% on earlier models, so the split is a direction,
not a measurement.

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

Labelling a larger set with a panel of models:

```sh
make teacher      # draw lines the test set never saw                    (~2 min)
make panel        # put each one to five models                          (~70 min, ~$4)
make panel-check  # score the panel against the 200 marked by hand
make labels       # join the lines and the answers into one file
make check-teacher  # hand-label 100 of them blind, to measure the panel
make label-split  # decide once which words train, which choose, which report
```

Measuring:

```sh
make baseline    # what the extension does today
make evaluate    # score data/model against the working set
make compare     # every model side by side
make failures    # the lines the model gets wrong
make sense-split # accuracy when the right sense is the commonest, and when not
make confidence  # when the card leads with one sense, and when it does not
make onnx        # export data/model for the browser, full, half and 8-bit
make check-onnx  # do the exported copies answer like data/model?
make pos-effect  # the model with the tagged part of speech, and without it
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
average 11.5 senses against 6.4, before phrase matching — and one overall number hides that. Words above five
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
| single words |   131 |    7.7 |    50.4% |          51.9% |       61.8% |
| all          |   149 |    7.0 |    55.0% |          55.7% |       65.8% |

On single words the trained model is 11.4 points ahead of the baseline where the
untrained one managed 1.5. On phrases it is one line ahead — the baseline is 88.9% there,
against 2.0 senses to choose from, so there is almost nothing to win. An
earlier run came out behind, which is what suggested skipping the model below three
senses. That rule is off the table: on 18 lines one either way is noise, and the model is
no longer the risk.

Split by whether the right sense is the first one WordNet lists:

| test set          | right sense   | lines | first sense | model | top 3 |
| ----------------- | ------------- | ----: | ----------: | ----: | ----: |
| hand-labelled     | the commonest |    82 |        100% | 85.4% | 98.8% |
|                   | another one   |    67 |          0% | 41.8% | 73.1% |
| panel test, 5 / 5 | the commonest |   252 |        100% | 83.7% | 99.6% |
|                   | another one   |   157 |          0% | 45.9% | 83.4% |

Showing the first sense is right exactly when the line uses the commonest sense, and never
otherwise. The model trades: it gives up about 15 points where the commonest sense is
right to find the others four times in ten. The second row is the one that matters — a
reader looks a word up mostly when the obvious sense does not fit — and there the model
is wrong more often than right.

Both test sets say the same thing, which is worth more than either alone: the hand labels
are few, and the panel labels are about 3% wrong.

### Where it goes wrong

51 of 149 lines get the wrong sense first; 32 of those still have a right sense in the
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

Even at 84% the model is eighteen points short, which is what makes the next phase worth
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
kaggle.com, and the token string into `~/.kaggle/access_token`. An older pip-installed
CLI on PATH will fail on that token format, so the Makefile calls `~/.local/bin/kaggle`
directly; override with `make kaggle KAGGLE=...`. The account has to be
phone-verified or Kaggle quietly hands out a CPU instead of a GPU, which is why
`kernel.py` stops on the first line if there is no GPU. A dataset version also takes a
minute or two to process, and a kernel pushed before it is ready mounts the previous
version silently, so `make kaggle` waits for it.

```sh
make ufsac                      # once: download the corpora and build the examples
make kaggle M="what changed"    # upload the data, push the script
kaggle kernels status ofarukkavlak/vocabboost-wsd-training
kaggle kernels output ofarukkavlak/vocabboost-wsd-training -p data/
```

Then unzip a model into `data/model` and run `make evaluate` here. It uses the same
code that scored the untrained models, so the comparison is like for like.

### Where the subtitle labels go

Four jobs in one session, one question: is 3,708 lines of the right register worth
anything on top of 177,665 lines of the wrong one?

| job              | data                      | examples | epochs | first | first 3 |
| ---------------- | ------------------------- | -------: | -----: | ----: | ------: |
| model-semcor     | semcor, the control       |  177,665 |      1 | 64.4% |   83.9% |
| model-mixed      | semcor + labels, one pile |  181,373 |      1 | 61.7% |   83.9% |
| model-tuned      | labels, from model-semcor |    3,708 |      3 | 67.1% |   87.9% |
| model-tuned-4of5 | same, including 4 of 5    |    5,563 |      3 | 65.8% |   86.6% |

**Mixing them made it worse**, by 2.7 points. The expectation was that nothing would
happen — 3,708 examples is 2% of the pile and one pass cannot weight them. Instead the
2% was enough to disturb and not enough to teach.

**Two stages read as better**, and the 4-of-5 labels as worse. Both readings are 1.3 to
2.7 points, and none of these four jobs seeded torch, so none of them can tell a real
difference from a different batch order. The next section is what replaced them.

### One score is not a result

The tuned run was repeated to save a model the first session had overwritten. Same code,
same data, same `--seed 17`. The control came back **68.5%** where it had twice been
**64.4%**.

Nothing had changed. `run.py` seeded Python's `random`, which fixes the data — which rows,
which wrong answers, which words are held out — and never seeded torch, which fixes the
training: batch order and dropout. So every run drew a different training order, and four
points moved with it. That is wider than every difference the table above claims.

`run.py` now seeds torch too, and both settings run at three seeds. Control and tuned
share a seed inside each pair, so the difference is read pair by pair rather than between
averages. The epoch is chosen on the validation words, and every model is scored on the
409 unanimous lines of the test words, which nothing was trained or chosen on.

| seed | control | tuned | first | first 3 |
| ---- | ------: | ----: | ----: | ------: |
| 17   |   66.5% | 69.2% |  +2.7 |    +0.7 |
| 23   |   65.3% | 68.5% |  +3.2 |     0.0 |
| 41   |   66.7% | 69.9% |  +3.2 |    +0.2 |

**Two stages help.** +3.0 at first place on average, positive at every seed: about twelve
lines of 409. The top three barely moves. The control already has the right sense near
the top, and tuning moves it to first.

**The same seed gives the same model.** This session ran twice and produced identical
scores both times. An earlier seeded run had put the control at 63.1% on the 149 lines at
every seed, where these give 64.4, 64.4 and 61.7; the code changed between the two, and
that earlier +2.4 was chosen and reported on the same lines. It is replaced by the table
above.

**Two draws that agree are not a measurement.** Two unseeded runs had both shown +4.0 in
the top three, and that was read as the effect the card would feel. It is under one
point.

The test lines are panel-labelled, so about 3% of their labels are wrong. That error hits
both sides of a pair, so the difference holds; the absolute 69% does not. Phase 17 opens
the 51 sealed lines once for that.

### The first run

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

These are one run each, and the section below puts the run-to-run spread at four points,
so a real gain smaller than that would be hidden here. It does not rescue OMSTI: a gain
this table cannot see is a gain not worth six times the data.

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
is large and, as the runs above show, noisier; MASC is smaller but includes
transcribed speech and is untouched so far.

OMSTI is deep rather than broad: nearly SemCor's vocabulary with five times the
examples a word, so it teaches known words in more contexts rather than new words.

Only 46.5% of its examples are the commonest sense against SemCor's 68.5% — closer to
how a reader uses a dictionary, since you look a word up when the obvious sense does not
fit. That read two ways: either OMSTI holds the harder examples, or automatic alignment
skews away from common senses and the labels are unreliable. Training on it settled it
in favour of the second.

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
sounds. So before spending anything on ten thousand lines, the panel was run over the
200 already marked by hand — a teacher is only scorable against an answer key.

Each model answers alone, with the senses shuffled in an order seeded by the line and
the model together. Models anchor on the first option the way people do, and WordNet
lists senses commonest first.

|                        | matches the person |
| ---------------------- | -----------------: |
| claude-haiku-4.5       |              74.0% |
| llama-3.3-70b (Meta)   |              74.0% |
| qwen-2.5-72b (Alibaba) |              74.0% |
| gemini-2.5-flash       |              72.5% |
| gpt-4o-mini            |              65.5% |

Each on its own lands where published evaluations put single models on this task,
between 56% and 77%. Agreement is what changes that:

| agreed | lines | matches the person |
| ------ | ----: | -----------------: |
| 5 of 5 |    84 |          **92.9%** |
| 4 of 5 |    57 |              78.9% |
| 3 of 5 |    45 |              62.2% |
| 2 of 5 |    13 |              38.5% |

The seed has to carry the model as well as the line. The first version seeded by line
alone, so all five models saw one shared order: unanimity looked like 105 lines at
91.4%, and the 4 of 5 row came out at 72.7%, below a three-model panel's 86.4%. A fifth
of the agreement was five models anchoring the same way rather than five models
agreeing. With its own order per model the table above is monotonic instead.

How many agree is itself the confidence signal: every step down the table costs
accuracy, with no exception. A three-model panel is unanimous on 109 lines at 89.9%, so
two more families buy 3 points of accuracy for 12 points of coverage. The panel is five,
because the OMSTI runs showed that more labels have stopped helping while cleaner ones
have not been tried.

At 92.9% the panel is at the labeller's own ceiling of 28 in 30. The unanimous lines are
the easy ones, where people agree more too, so it is not a like-for-like comparison.

The lines the panel splits on are not waste: they are the genuinely ambiguous ones, and
what phase 15 needs to teach the model when to say nothing.

Four families answer in prose where a number was asked for and are not on the panel:
Mistral, Cohere, Phi, and DeepSeek — the last on 57 of 200 lines.

Cost: measured at $0.0004 a line for five models, so ten thousand lines is roughly $4.

### What the panel labelled

8,440 lines, drawn from the same pool as the test set with the test set held out, the
phrases pointed at their phrase, and the single-sense lines dropped. 42,200 calls, nine
of which came back without a number.

| agreed | lines |       |
| ------ | ----: | ----: |
| 5 of 5 | 3,833 | 45.5% |
| 4 of 5 | 1,932 | 22.9% |
| 3 of 5 | 1,976 | 23.4% |
| 2 of 5 |   676 |  8.0% |
| 1 of 5 |    14 |  0.2% |

Unanimity ran at 45.5% against the 42% the 200-line measurement predicted, so the larger
pool behaves like the small one. That leaves **3,708 usable labels** over 1,560 distinct
words, plus **125 lines where all five agreed no sense fits** — the abstain examples
phase 15 needs, and five models saying it together is worth more than one saying it.

58.9% of the labels are the word's commonest sense, against SemCor's 68.5% and OMSTI's
46.5%. Between the two is where it should be: a reader looks a word up when the obvious
sense does not fit, so a set that was 68% obvious would be teaching the wrong habit.

3,708 is small next to SemCor's 177,665, and deliberately so — the measured gap was
register, not volume. The bet paid, modestly: +3.0 points at first place on the test words,
positive at all three seeds. The section on seeds has the pairs.

`make labels` joins the lines and the answers into `teacher-labels.jsonl`, in the shape
`build_semcor.py` produces, so training reads both the same way. Every line is kept, not
just the unanimous ones: `agreed` is a difficulty score, and the split lines are what
phase 15 learns to say nothing from.

### How wrong the teacher is

100 of the panel's own lines were labelled again by hand, blind: no panel answer shown,
the buckets mixed together, and the senses shuffled as usual.

| agreed | matches the person | predicted |
| ------ | -----------------: | --------: |
| 5 of 5 |        58/60 = 97% |     92.9% |
| 4 of 5 |        32/40 = 80% |     78.9% |

The 4 of 5 bucket landed where the 200-line measurement put it, which is the better news
of the two: the prediction holds on a pool forty times the size.

Unanimity came out cleaner than predicted. On 60 lines the interval is around ±5 points,
so the honest reading is "above 92%" rather than 97 — but that is already the labeller's
own 28-in-30, and no set of labels can be measured cleaner than the person measuring it.

Both misses are the granularity problem, not a wrong label:

- _"transfer all the women from this boat into that boat"_ — `transfer` as "move from
  one place to another", or as "move around".
- _"you got no reason to believe me"_ — `reason` as "a rational motive", or as "a fact
  that logically justifies".

The same kind as the two lines the labeller disagreed with themselves on. A model will
lose these too, and nothing in the data can fix them.

That leaves a choice worth measuring rather than arguing:

|             | lines | label quality |
| ----------- | ----: | ------------: |
| 5 of 5 only | 3,708 |           97% |
| plus 4 of 5 | 5,640 |          ~91% |

Half again as much data for six points of label error. Measured at three seeds, on the
same 409 unanimous test lines:

| seed | 5 of 5 | plus 4 of 5 | first | first 3 |
| ---- | -----: | ----------: | ----: | ------: |
| 17   |  69.2% |       69.9% |  +0.7 |    +0.2 |
| 23   |  68.5% |       65.8% |  −2.7 |    +1.2 |
| 41   |  69.9% |       69.7% |  −0.2 |    −0.7 |

A tie. The extra lines and the extra error cancel out, so the cleaner labels stay.

The run's own log says otherwise, and is wrong to: each model reports on the test lines
at its own bar, so the 4-of-5 models were scored on 592 lines including the ones five
models could not agree on. Comparing two models means scoring them on the same lines.

### Train, choose, report

2,175 words, divided once and written to `data/label-split.json`.

|            | words | lines | 5 of 5 | no sense fits | commonest |
| ---------- | ----: | ----: | -----: | ------------: | --------: |
| train      | 1,739 | 6,765 |  2,945 |           295 |     58.5% |
| validation |   218 |   807 |    354 |            34 |     59.0% |
| test       |   218 |   859 |    409 |            23 |     61.6% |

Split by word, and stratified by frequency band. By word because a lemma here has 2.4
lines on average, so splitting by line would put the same word on both sides and let the
model recognise it rather than read the sentence. By band because the bands are not
equally hard — the baseline is 52% on everyday words and 43% on uncommon ones — and an
unstratified draw would let the mix drift between the parts.

Written down rather than drawn at runtime. `run.py` used to divide the words itself,
with the same seed that fixes the batch order, so two settings compared at two seeds were
also being validated on two different sets of words.

What it buys: the epoch is now chosen by ranking accuracy on the validation words instead
of on the 149 hand-labelled lines. Choosing on the set you then report flatters it by
however much the epochs differ, and they differ — the three-epoch run went 66.4, 67.1,
65.8 there. The held-out triplet score cannot do the job either: it climbs through every
epoch, so it would pick the worst of the three.

Every line of a word goes with it — the unanimous ones, the ones the panel split on, and
the 352 where all five said no sense fits. Phase 15 calibrates on how often the model is
right at a given confidence, and it can only do that where the hard lines are still in.

The test part is not the sealed 51. It is panel-labelled, so it carries the panel's own
error: 3% where five models agreed, 20% where four did. It can compare two models scored
on the same lines; it cannot say how good either one is. The 51 stay sealed for phase 17.

### Now worth spending

The free data is spent. SemCor is used in full, OMSTI adds nothing on top of it, and a
million examples moved the held-out score without moving the subtitle score. More of the
same register will not close the gap, and the ceiling is high enough that there is a gap
worth closing.

That is the argument the money needed. It was not available before the runs, which is
why they came first.

## Knowing when not to answer

The model always has a nearest sense, even when nothing fits. Wrong a third of the time
and sure every time, it would teach wrong meanings. So the card leads with one sense only
when the model is confident, and otherwise says the line does not settle it and shows
the likeliest few.

### What confidence is

Two readings, both on the 354 unanimous lines of the validation words:

| answers | right, by top score | right, by gap |
| ------: | ------------------: | ------------: |
|    100% |               64.7% |         64.7% |
|     80% |               68.2% |         69.6% |
|     60% |               71.2% |         79.2% |
|     40% |               72.5% |         86.6% |
|     30% |               73.6% |         90.6% |

The top score barely separates right from wrong: answering only on the surest 30% lifts
accuracy nine points. A line can sit close to every sense at once, and a high score then
says nothing about which one it means. The gap between the first and second choice does
the job — it is how far ahead the answer is, not how near.

### Where the line goes

The bar was set before the curve was read: a sense the card leads with must be right at
least **85%** of the time. That is how often the labeller agreed with themselves days
later. Asking more claims a certainty the labels do not have; asking less shows a wrong
meaning as the answer, and the reader remembers the one at the top.

The lowest gap that clears it on the validation words is **0.081**. The test words were
then read once, with that threshold:

|            | leads with one | right | otherwise, right sense in the top 3 |
| ---------- | -------------: | ----: | ----------------------------------: |
| validation |          45.5% | 85.1% |                               87.6% |
| test       |          43.5% | 88.2% |                               90.5% |

It holds on words it was not chosen on. The card leads with one sense on a little under
half the lines and is right on nine in ten of them; on the rest the right sense is among
three shown on nine in ten.

### How many to show

Where the model is not confident, how often the right sense is in the first few:

| shown | validation |  test |
| ----: | ---------: | ----: |
|     1 |      47.4% | 54.5% |
|     2 |      79.9% | 78.4% |
|     3 |      87.6% | 90.5% |
|     4 |      93.3% | 93.5% |
|     5 |      96.9% | 95.2% |

Three. Each sense up to the third is worth ten to thirty points and each after it three
or four. Five would reach 96%, but the median word on these lines has five senses, so
five is every sense — the wall the extension shows today. The rest stay one click away,
and a count of "+1 more" is sillier than the sense itself, so a lone fourth is shown too.

### Not solved

- **No sense fits.** Where all five panel models said none of the senses fits, the card
  still leads with one on 3 of 8 validation lines and 3 of 6 test lines. The gap measures
  which sense is ahead, not whether any is right. Fourteen lines cannot say how often
  this happens, only that the threshold does not catch it.
- **Words with many senses.** At six senses or more, what the card leads with was 67.9%
  right on the validation words and 86.7% on the test words, on about fifty lines each.
  The two disagree, so it is noise until more lines say otherwise. A threshold per
  sense count would fit fifty lines, not the words.

## In the browser

The model is exported to ONNX, a format any runtime can execute, and run in Chrome with
`transformers.js` on the 409 unanimous test lines. Three copies, differing in how
precisely each weight is stored:

| copy         |  file | same first choice | first | leads, right | memory in use |
| ------------ | ----: | ----------------: | ----: | -----------: | ------------: |
| 32-bit float | 91 MB |           409/409 | 69.2% |        88.2% |       ~730 MB |
| 16-bit float | 46 MB |           409/409 | 69.2% |        88.2% |       ~700 MB |
| **8-bit**    | 23 MB |           381/409 | 68.9% |        87.7% |   **~450 MB** |

Every copy answers in about 0.1 seconds a word (0.25 at the slowest tenth) and loads in
0.6. Speed is not what separates them.

The first 8-bit try gave one scale to each whole weight matrix and lost 4.2 points. A
matrix mixes rows of very different sizes, and one scale spends its 256 steps on the
largest; a scale a row brings the loss down to one line.

**8-bit ships.** The download was never the cost that mattered — a reader downloads once.
Memory is paid every time the model is up, and the 16-bit copy saves none of it: the
browser widens its weights back to 32 bits to compute with them. One line in 409 is not
worth 250 MB. Memory is the operating system's resident size for the page's renderer, less an
empty page's 90 MB, so read it as rough; the gap between the copies is not.

Even 450 MB is too much to hold while nobody is looking anything up. So the model runs in
its own offscreen page, opened on the first lookup and closed after a couple of idle
minutes, which hands every byte back. The first lookup after that waits the 0.6-second
load again, which is the right trade for a reader who looks up a few words and then
watches for a while.

### The part of speech

Every labelled line went through NLTK's tagger before a sense was chosen, so the model was
always picking among the verb senses of `run` or its noun senses, never both. A browser has
no tagger unless one ships. Given every sense of the lemma instead:

|                   | senses | first | leads | right |
| ----------------- | -----: | ----: | ----: | ----: |
| test, tagged      |    5.8 | 69.2% | 43.5% | 88.2% |
| test, every sense |    8.7 | 59.7% | 33.7% | 83.3% |

Ten points, and what the card leads with falls under the 85% bar. A tagger has to ship.

Three that already run in JavaScript were tried on the validation lines:

| tagger     | agrees with NLTK | first | leads, right |
| ---------- | ---------------: | ----: | -----------: |
| NLTK       |                — | 64.7% |        85.6% |
| en-pos     |            89.4% | 61.6% |        81.3% |
| wink       |            91.2% | 61.3% |        81.6% |
| compromise |            87.5% | 60.5% |        80.9% |
| none       |                — | 55.4% |        80.8% |

Every one of them lands under the bar. Where a tagger names the wrong part of speech, the
right sense is not on the list at all.

The comparison is also not fair, and cannot be made fair with these labels. The panel chose
among the senses of the part of speech NLTK named; where NLTK was wrong, it answered "no
sense fits", and the line never reached the unanimous set. So the test lines are the ones
NLTK tagged right, and a tagger that disagrees with it is scored wrong even where it is
the one that is right.

So NLTK's own tagger ships. It is an averaged perceptron — a weighted vote over a dozen
features of the word and its neighbours — about a hundred lines of code and 5.7 MB of
weights. Ported, it gives the tags every number here was measured with, and "the same tag
on every test line" is a check that can be run. The JavaScript taggers were measured once
with a throwaway script and are not reproduced by a target.
