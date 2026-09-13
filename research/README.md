# research

Everything here builds the model. None of it ships. The extension only ever sees the
files phase 16 exports, so this folder can stay slow, messy in its data, and written
in Python.

`data/raw/` is downloaded and is not in git. Everything else in `data/` is small,
hand-made, and worth keeping.

## Phase 10 — the baseline

The point of this phase is one number: how often is the extension right today, when
it shows the first sense the dictionary lists? Every later phase is measured against
it. Without it there is no way to tell an improvement from a change.

```sh
make setup       # a virtualenv and the NLTK data files
make pool        # sample 200k subtitle lines, count word frequencies  (~7 min)
make candidates  # pick 200 lines, one word each, worth looking up
make label       # mark the right sense by hand                        (you, ~2 hours)
make split       # 150 to work with, 51 sealed until phase 17
make baseline    # the number
make recheck     # a few days later: how often do you agree with yourself?
```

`make label` saves after every answer, so stopping and running it again is fine.
`make label REDO=4,9` reopens lines you have already answered — the first twenty
teach you how to read the sense list, and you will want to revisit some of them.

### Why the pieces are the way they are

**The corpus is streamed, not downloaded.** The OpenSubtitles file is 3.6 GB gzipped.
We read it from the start, keep what is usable, and stop at a byte budget. Reservoir
sampling spreads the sample over everything we read, so the set is not two hundred
lines from the same three films.

**The target word is chosen by frequency, not by ambiguity.** Picking the word with
the most senses gives you `get`, `go` and `have` on every line, and nobody looks those
up. Frequency comes from the pool itself, which measures the language of film rather
than of English in general.

**The set is split into three frequency bands, and accuracy is reported for each.**
Who clicks a word depends on their level: a beginner stops at `play` and `run`,
someone further along only at `vaudeville`. Testing on rare words alone would hide
the hardest cases, because a word stays common by carrying many meanings — the
everyday band averages 11.8 senses a word against 6.3 in the uncommon band. One
overall number would average that difference away. Words above five thousand
occurrences are left out: `do` and `have` are tagged as verbs but are doing
grammatical work, not carrying a meaning to look up.

**The senses are shuffled before you see them.** WordNet lists senses commonest
first. Shown in that order, a tired labeller drifts towards the first one — and how
often the first one is right is the exact thing being measured. Shuffling keeps the
answer honest.

**Several senses can be accepted, and an answer can be marked unsure.** WordNet
splits meanings far more finely than anyone can reliably tell apart — trained native
annotators agree with each other on roughly three WordNet labels in four. That is a
property of the sense list, not of the labeller, so the tool stops pretending
otherwise: `1,3` accepts both, and `?1` records a doubt. The score is then reported
with and without the doubtful lines.

**Nothing but the line is shown, on purpose.** The model gets the same single line at
run time. If the line does not settle which meaning it is, neither of you can know,
and `n` is the honest answer rather than a guess.

**`n` and `x` are different answers.** `n` says the line is sound and no sense fits
it — `club` in `club soda` carries none of its own meanings, and that is real evidence
of the kind phase 15 learns from. `x` says the line is garbled and was never a fair
question, so it leaves the set rather than teaching anything. Subtitle files carry
their share of mangled text, and filing it under `n` would teach the model to
recognise nonsense instead of ambiguity.

**`make recheck` measures the ceiling.** Relabel thirty lines blind, days later, and
see how often you agree with your earlier self. No model judged on these labels can
honestly claim to beat that number, and a model score quoted without it means less
than it appears to.

**Fifty-one lines are sealed.** Anything tuned against a set of examples looks better
on that set than it will in the wild. The sealed lines are opened once, in phase 17,
and are spread evenly across the three bands so they cannot flatter us by accident.

### On WordNet

Phase 10 uses WordNet as its sense list, and that is not the same as deciding to ship
it. It comes with NLTK, the baseline measures ranking rather than coverage, and every
existing hand-labelled WSD dataset uses its sense keys. Phase 11 measures WordNet and
Wiktionary side by side and decides. Labels survive a switch, because the model
compares the text of a sense, not its key.

## Result so far

Preliminary, from the first 100 lines labelled. The working set is 82 of them; the
rest are sealed or were dropped as broken.

| band     | lines | senses | guessing | first sense |
| -------- | ----: | -----: | -------: | ----------: |
| everyday |    33 |   10.8 |       9% |       45.5% |
| common   |    25 |    7.0 |      14% |       64.0% |
| uncommon |    24 |    5.6 |      18% |       45.8% |
| **all**  |    82 |    8.1 |      12% |   **51.2%** |

So the extension today shows the wrong meaning about half the time. That is four
times better than guessing and nowhere near good enough, which is the whole reason
for the phases that follow.

Published all-words results put this baseline at 65.5 F1. Ours is lower because the
set was built to be hard: every line has a word with at least three senses, where
published evaluations include the single-sense words that are right for free.

The everyday band is the worst of the three at 45.5%, which is the opposite of what
you would guess. A word stays common by taking on more meanings — those lines carry
10.8 senses each against 5.6 in the uncommon band — so the words a beginner is most
likely to click are the ones the dictionary handles worst.

## Phase 11 — which sense inventory

Measured over 7,198 distinct words taken from 10,000 subtitle lines. Coverage is
counted twice: by distinct word, and weighted by how often the word occurs, because
missing `gonna` costs more than missing `zeugma`. "Trimmed" drops the senses marked
obsolete, archaic, rare, historical, dated, or as spelling variants — material a
person watching a film never needs and we would not ship.

|                     | by word | by use | senses | 10 or more |
| ------------------- | ------: | -----: | -----: | ---------: |
| WordNet             |   85.2% |  95.2% |    4.7 |        390 |
| Wiktionary          |   89.3% |  96.4% |    7.8 |       1463 |
| Wiktionary, trimmed |   87.3% |  95.4% |    7.0 |       1135 |

The plan expected Wiktionary to win on both counts. It does not.

Coverage is a tie where it matters: 95.2% against 95.4% of actual use. The words only
Wiktionary carries are not slang but function words and interjections — `something`,
`anything`, `else`, `sir`, `yeah` — which WordNet omits by design.

On granularity Wiktionary is worse, not better: 7.0 senses a word against 4.7, and
three times as many words split ten ways or more. Word by word: `club` is 7 senses in
WordNet and 13 in Wiktionary; `night` 8 against 9; `feel` 13 against 12.

So WordNet is the inventory, with Wiktionary filling the words it lacks. That keeps
SemCor's 187,000 human labels and the published numbers to compare against, and the
labels already made stay valid.

It does not solve the granularity problem — annotators agree on fine WordNet
distinctions around 70% of the time, and that is still the ceiling. With the escape
route closed, the remaining move is to cluster WordNet's own senses: merge the ones
nobody can tell apart. The multiple answers accepted during phase 10 labelling are
hand-made examples of exactly that.

### Clustering senses: what did not work

If the senses nobody can tell apart were merged, the ceiling would rise. The cheap
version of that is to let WordNet find them itself, so the pairs a labeller accepted
together were compared against the pairs they rejected, over five signals: the
subject file a sense is filed under, two measures of distance through the is-a
hierarchy, how much two senses share their synonyms, and how much their definitions
share words.

| nouns and verbs      | lexname | path |  wup | synonym | gloss | pairs |
| -------------------- | ------: | ---: | ---: | ------: | ----: | ----: |
| accepted together    |    0.50 | 0.17 | 0.39 |    0.49 |  0.06 |    16 |
| accepted vs rejected |    0.39 | 0.16 | 0.36 |    0.48 |  0.04 |   138 |

Nothing separates them. WordNet does not know which of its own senses a person cannot
tell apart, and neither the synonyms nor the definitions give it away.

Two caveats. Sixteen pairs is thin. And the signal is muddied, because two senses get
accepted together for two different reasons: sometimes they read the same, and
sometimes they are genuinely different and the line supports both — `only` as
`merely` and as `exclusively`. Only the first kind is a candidate for merging, and
the tool does not ask which is which.

The idea itself is sound. OntoNotes merged WordNet senses until annotators agreed 90%
of the time instead of 70%, and automatic disambiguation against that inventory
reaches 87–89% where fine-grained WordNet reaches 79. But those merges were made by
people deciding what they could not distinguish, not derived from the graph.

So: no clustering for now. Revisit it in phase 12, when a gloss encoder exists and
can be asked the same question — it may see a likeness that word overlap cannot.
