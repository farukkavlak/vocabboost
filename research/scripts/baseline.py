"""Score the first-sense strategy on the hand-labelled lines, per band and overall."""

import argparse
import collections

from common import BANDS, BOLD, DIM, OFF, percent, read_jsonl


def score(rows):
    right = sum(1 for row in rows if row["senses"][0]["key"] in row["label"])
    senses = sum(len(row["senses"]) for row in rows) / len(rows)
    return right, len(rows), percent(right, len(rows)), senses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    args = parser.parse_args()

    rows = read_jsonl(args.file)
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
