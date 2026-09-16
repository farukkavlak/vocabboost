"""Count how often each word appears in the subtitle pool.

The counts decide which frequency band a word falls in.
"""

import argparse
import collections
import json
import re

from common import read_jsonl

WORD = re.compile(r"[a-z]+")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool", default="data/raw/pool.jsonl")
    parser.add_argument("--out", default="data/raw/frequency.json")
    args = parser.parse_args()

    counts = collections.Counter()
    for row in read_jsonl(args.pool):
        counts.update(WORD.findall(row["text"].lower()))

    json.dump(counts, open(args.out, "w", encoding="utf-8"))
    print(f"counted  {sum(counts.values()):,} words, {len(counts):,} distinct -> {args.out}")
    print("commonest:", ", ".join(w for w, _ in counts.most_common(10)))


if __name__ == "__main__":
    main()
