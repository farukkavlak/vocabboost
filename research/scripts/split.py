"""Split the hand-labelled lines into a working set and a sealed set, even across bands.

Sealed ids are chosen from the whole file, labelled or not, so the split never moves.
"""

import argparse
import collections
import random

from common import BANDS, read_jsonl, write_jsonl


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

    rows = read_jsonl(args.file)
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
        write_jsonl(path, part)
        print(f"{len(part):>4} lines -> {path:<20} ({spread})")


if __name__ == "__main__":
    main()
