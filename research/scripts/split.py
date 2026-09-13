"""Split the labelled lines into a working set and a sealed set.

The sealed lines are not opened until phase 17. Every number we quote before then
comes from the working set. Anything tuned against a set of examples looks better on
that set than it will in the wild, and the only defence is a set nothing was ever
tuned against.

Which lines are sealed is decided once, from the full file, before any of it is
labelled. If it were decided from whatever happens to be labelled today, a line could
sit in the working set this week and in the sealed set next week, after we had
already read it. Then nothing would really be sealed.

The split keeps the three frequency bands even. A sealed set that happened to be all
rare words would flatter us, since rare words carry fewer meanings.
"""

import argparse
import collections
import json
import random

BANDS = ["everyday", "common", "uncommon"]


def sealed_ids(rows, per_band, seed):
    """Chosen from every row, labelled or not, so the set never shifts."""
    by_band = collections.defaultdict(list)
    for row in rows:
        by_band[row["band"]].append(row["id"])
    chosen = set()
    for band in BANDS:
        ids = sorted(by_band[band])
        random.Random(seed).shuffle(ids)
        chosen.update(ids[:per_band])
    return chosen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--sealed-per-band", type=int, default=17)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    sealed_set = sealed_ids(rows, args.sealed_per_band, args.seed)

    labelled = [row for row in rows
                if row["label"] is not None and not row.get("broken")]
    broken = sum(1 for row in rows if row.get("broken"))
    waiting = len(rows) - len(labelled) - broken
    if waiting:
        print(f"{waiting} of {len(rows)} lines are not labelled yet")
    if broken:
        print(f"{broken} dropped as broken")
    if waiting or broken:
        print()

    sealed = [row for row in labelled if row["id"] in sealed_set]
    working = [row for row in labelled if row["id"] not in sealed_set]

    for path, part in [("data/working.jsonl", working), ("data/sealed.jsonl", sealed)]:
        counts = collections.Counter(row["band"] for row in part)
        spread = ", ".join(f"{counts[b]} {b}" for b in BANDS)
        with open(path, "w", encoding="utf-8") as handle:
            for row in part:
                handle.write(json.dumps(row) + "\n")
        print(f"{len(part):>4} lines -> {path:<20} ({spread})")


if __name__ == "__main__":
    main()
