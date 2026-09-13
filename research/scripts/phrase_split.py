"""Separate what the lexicon fixed from what the model does.

Phrase detection lifted the baseline nine points on its own, which muddies every later
comparison: an improvement in phase 14 could be the model learning, or it could be
these lines. Keeping them apart keeps the two readable.
"""

import json

from sentence_transformers import SentenceTransformer

from zero_shot import hits, rank


def main():
    rows = [json.loads(l) for l in open("data/working.jsonl", encoding="utf-8")]
    ordered = rank(SentenceTransformer("sentence-transformers/all-mpnet-base-v2"),
                   rows, "examples", "prefixed")

    print(f"\n{'':<14}{'lines':>7}{'senses':>8}{'baseline':>10}{'model':>8}{'top 3':>8}")
    for name, phrase in [("phrases", True), ("single words", False), ("all", None)]:
        part = [(r, k) for r, k in zip(rows, ordered)
                if phrase is None or bool(r.get("phrase")) == phrase]
        part_rows, part_keys = zip(*part)
        base = sum(1 for r in part_rows if r["senses"][0]["key"] in r["label"])
        senses = sum(len(r["senses"]) for r in part_rows) / len(part_rows)
        print(f"{name:<14}{len(part_rows):>7}{senses:>8.1f}"
              f"{100 * base / len(part_rows):>9.1f}%"
              f"{100 * hits(part_rows, part_keys, 1) / len(part_rows):>7.1f}%"
              f"{100 * hits(part_rows, part_keys, 3) / len(part_rows):>7.1f}%")


if __name__ == "__main__":
    main()
