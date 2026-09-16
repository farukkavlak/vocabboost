"""Score lines whose right sense is the commonest separately from the rest."""

import argparse

from common import percent, read_jsonl, unanimous
from sentence_transformers import SentenceTransformer
from zero_shot import hits, rank


def report(name, rows, ordered):
    print(f"\n{name}\n")
    print(f"{'right sense':<18}{'lines':>7}{'first sense':>13}{'model':>8}{'top 3':>8}")
    for part, commonest in [("the commonest", True), ("another one", False), ("all", None)]:
        picked = [(r, k) for r, k in zip(rows, ordered, strict=True)
                  if commonest is None or (r["senses"][0]["key"] in r["label"]) == commonest]
        part_rows, part_keys = zip(*picked, strict=True)
        n = len(part_rows)
        base = sum(1 for r in part_rows if r["senses"][0]["key"] in r["label"])
        print(f"{part:<18}{n:>7}{percent(base, n):>12.1f}%"
              f"{percent(hits(part_rows, part_keys, 1), n):>7.1f}%"
              f"{percent(hits(part_rows, part_keys, 3), n):>7.1f}%")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    model = SentenceTransformer(args.model)
    hand = read_jsonl(args.file)
    panel = unanimous(args.labels, args.split, "test")
    for name, rows in [("hand-labelled lines", hand), ("panel test lines, 5 of 5", panel)]:
        report(name, rows, rank(model, rows, "all", "prefixed"))


if __name__ == "__main__":
    main()
