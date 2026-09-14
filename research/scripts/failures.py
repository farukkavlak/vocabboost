"""Look at what the model got wrong.

An accuracy figure says how often, never how. The useful question is whether a miss
still leaves the reader with the right idea, and there is no honest way to measure
that automatically. WordNet's own hierarchy will not do it: its verbs are three levels
deep against nine for nouns, so two near-synonyms like `buy` as trade and `buy` as
purchase score further apart than `hand` as a body part and `hand` as a card game.
That is the same lesson the clustering attempt gave — WordNet's structure does not
carry the judgements people make.

So this prints the misses and leaves the reading of them to a person. What it does
count is the one thing that is well defined: how often the right sense was on screen
anyway, because the card lists three.
"""

import argparse
import json

from sentence_transformers import SentenceTransformer
from zero_shot import rank

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--show", type=int, default=20)
    parser.add_argument("--band", default="")
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    ordered = rank(SentenceTransformer(args.model), rows, "all", "prefixed")

    misses = [(r, k) for r, k in zip(rows, ordered, strict=True)
              if k[0] not in r["label"] and (not args.band or r["band"] == args.band)]
    gloss = {s["key"]: s["gloss"] for r in rows for s in r["senses"]}
    recovered = sum(1 for r, k in misses if set(k[:3]) & set(r["label"]))

    print(f"\n{len(misses)} misses out of {len(rows)}")
    print(f"{recovered} of them ({100 * recovered / len(misses):.0f}%) still had a "
          f"right sense in the top three\n")

    for row, keys in misses[: args.show]:
        print(f"\n{row['text']}")
        print(f"  {BOLD}{row['lemma']}{OFF} ({row['band']}, {len(row['senses'])} senses)")
        print(f"  {DIM}model {OFF}{gloss[keys[0]][:68]}")
        for key in row["label"]:
            print(f"  {DIM}right {OFF}{gloss[key][:68]}")


if __name__ == "__main__":
    main()
