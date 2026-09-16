"""Split the panel-labelled words into train, validation and test, stratified by band.

Split by word, not by line, so a word never appears on both sides. Written to a file so
every run uses the same split.
"""

import argparse
import collections
import json
import random

from common import percent, read_jsonl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/teacher-labels.jsonl")
    parser.add_argument("--out", default="data/label-split.json")
    parser.add_argument("--validation", type=float, default=0.1)
    parser.add_argument("--test", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=3)
    args = parser.parse_args()

    rows = read_jsonl(args.file)

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
              f"{percent(first, len(clean)):>10.1f}%")


if __name__ == "__main__":
    main()
