"""Score every model side by side on the hand-labelled lines."""

import argparse

from common import read_jsonl
from sentence_transformers import SentenceTransformer
from zero_shot import hits, rank

RUNS = [
    ("untrained 22M", "sentence-transformers/all-MiniLM-L6-v2", "87 MB"),
    ("untrained 110M", "sentence-transformers/all-mpnet-base-v2", "438 MB"),
    ("trained 22M", "data/model", "87 MB"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    args = parser.parse_args()

    rows = read_jsonl(args.file)
    base = sum(1 for r in rows if r["senses"][0]["key"] in r["label"])

    print(f"\n{len(rows)} hand-labelled lines\n")
    print(f"{'':<18}{'size':>9}{'first':>9}{'first 3':>9}{'first 5':>9}")
    print(f"{'first sense':<18}{'0':>9}{100 * base / len(rows):>8.1f}%"
          f"{'-':>9}{'-':>9}")
    for name, path, size in RUNS:
        ordered = rank(SentenceTransformer(path), rows, "all", "prefixed")
        print(f"{name:<18}{size:>9}" + "".join(
            f"{100 * hits(rows, ordered, d) / len(rows):>8.1f}%" for d in (1, 3, 5)))


if __name__ == "__main__":
    main()
