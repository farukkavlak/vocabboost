"""Decide once which words are for training, which for choosing, which for reporting.

Until now the split lived inside `run.py` and moved with `--seed`. Two settings compared
at two seeds were validating on two different sets of words, so part of the difference
between them was the split rather than the setting. Writing it down fixes that, and phase
15 needs a validation set that does not move between the run that picks a threshold and
the run that reports it.

Split by word, not by line. A word in training that reappears in validation lets the
model recognise the word instead of reading the sentence, and every lemma here has 2.4
lines on average, so splitting by line would leak nearly all of them.

Stratified by frequency band, because the bands are not equally hard — the baseline is
52% on everyday words and 43% on uncommon ones — and an unstratified draw would let the
mix differ between the parts.

Every line of a word goes with it, whatever the panel answered: the unanimous ones, the
split ones, and the ones the panel said no sense fits. That is deliberate. Phase 15
calibrates on how often the model is right at a given confidence, and it can only do that
on a validation set that still contains the hard lines.

The test part is not the sealed 51. It is forty times larger and labelled by the panel,
so it carries the panel's own error — 3% where five models agreed, 20% where four did.
It narrows an error bar; it does not settle a comparison. The 51 stay sealed for phase 17.
"""

import argparse
import collections
import json
import random


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/teacher-labels.jsonl")
    parser.add_argument("--out", default="data/label-split.json")
    parser.add_argument("--validation", type=float, default=0.1)
    parser.add_argument("--test", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=3)
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]

    words = collections.defaultdict(set)
    for row in rows:
        words[row["band"]].add(row["lemma"])

    rng = random.Random(args.seed)
    split = {"validation": [], "test": [], "train": []}
    for band in sorted(words):
        pool = sorted(words[band])
        rng.shuffle(pool)
        valid = round(args.validation * len(pool))
        test = round(args.test * len(pool))
        split["validation"] += pool[:valid]
        split["test"] += pool[valid:valid + test]
        split["train"] += pool[valid + test:]

    for part in split.values():
        part.sort()

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(split, handle, indent=1, sort_keys=True)
        handle.write("\n")

    report(rows, split)


def report(rows, split):
    where = {word: part for part, words in split.items() for word in words}
    parts = collections.defaultdict(list)
    for row in rows:
        parts[where[row["lemma"]]].append(row)

    print(f"{'':<12}{'words':>7}{'lines':>8}{'5 of 5':>9}{'no sense':>10}"
          f"{'commonest':>11}")
    for part in ("train", "validation", "test"):
        got = parts[part]
        clean = [r for r in got if "key" in r and r["agreed"] == 5]
        first = sum(1 for r in clean if r["candidates"][0] == r["key"])
        print(f"{part:<12}{len(split[part]):>7,}{len(got):>8,}{len(clean):>9,}"
              f"{sum(1 for r in got if r.get('none')):>10,}"
              f"{100 * first / len(clean):>10.1f}%")


if __name__ == "__main__":
    main()
