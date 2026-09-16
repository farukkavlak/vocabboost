"""Score phrase lines and single-word lines separately."""

import argparse

from common import read_jsonl
from sentence_transformers import SentenceTransformer
from zero_shot import hits, rank


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--model", default="data/model")
    args = parser.parse_args()

    rows = read_jsonl(args.file)
    ordered = rank(SentenceTransformer(args.model), rows, "all", "prefixed")

    print(f"\n{args.model}\n")
    print(f"{'':<14}{'lines':>7}{'senses':>8}{'baseline':>10}{'model':>8}{'top 3':>8}")
    for name, phrase in [("phrases", True), ("single words", False), ("all", None)]:
        part = [(r, k) for r, k in zip(rows, ordered, strict=True)
                if phrase is None or bool(r.get("phrase")) == phrase]
        part_rows, part_keys = zip(*part, strict=True)
        base = sum(1 for r in part_rows if r["senses"][0]["key"] in r["label"])
        senses = sum(len(r["senses"]) for r in part_rows) / len(part_rows)
        print(f"{name:<14}{len(part_rows):>7}{senses:>8.1f}"
              f"{100 * base / len(part_rows):>9.1f}%"
              f"{100 * hits(part_rows, part_keys, 1) / len(part_rows):>7.1f}%"
              f"{100 * hits(part_rows, part_keys, 3) / len(part_rows):>7.1f}%")


if __name__ == "__main__":
    main()
