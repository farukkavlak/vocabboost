"""Measure the strategy the extension uses today: always show the first sense.

WordNet lists senses commonest first, so this is a real strategy and not a straw man.
Whatever number it gives is what every later phase has to beat.

The number is reported per frequency band as well as overall, because the bands are
not equally hard. A line the labeller marked as having no fitting sense counts as
wrong, since showing the first sense there is wrong.

A line can accept several senses, so an answer counts if it is among them. The score
is also shown without the lines the labeller was unsure about. If the two differ by
much, the labels carry more noise than the numbers admit.
"""

import argparse
import collections
import json

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"
BANDS = ["everyday", "common", "uncommon"]


def score(rows):
    right = sum(1 for row in rows if row["senses"][0]["key"] in row["label"])
    senses = sum(len(row["senses"]) for row in rows) / len(rows)
    return right, len(rows), 100 * right / len(rows), senses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    by_band = collections.defaultdict(list)
    for row in rows:
        by_band[row["band"]].append(row)

    print(f"{'':<12}{'lines':>7}{'senses':>9}{'guessing':>10}{'first sense':>14}")
    for band in BANDS:
        if not by_band[band]:
            continue
        right, total, percent, senses = score(by_band[band])
        print(f"{band:<12}{total:>7}{senses:>9.1f}"
              f"{100 / senses:>9.0f}%{percent:>13.1f}%")

    right, total, percent, senses = score(rows)
    print(f"{DIM}{'-' * 52}{OFF}")
    print(f"{BOLD}{'overall':<12}{total:>7}{senses:>9.1f}"
          f"{100 / senses:>9.0f}%{percent:>13.1f}%{OFF}")

    sure = [row for row in rows if not row.get("unsure")]
    if len(sure) < len(rows):
        right, total, percent, _ = score(sure)
        print(f"\n{DIM}without the {len(rows) - len(sure)} unsure lines: "
              f"{right}/{total} = {percent:.1f}%{OFF}")

    none = sum(1 for row in rows if not row["label"])
    if none:
        print(f"{DIM}{none} lines had no sense that fitted{OFF}")


if __name__ == "__main__":
    main()
