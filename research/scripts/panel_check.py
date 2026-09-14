"""Does the panel agree with a person, and does agreeing mean being right?

This is the gate before phase 13 spends money on ten thousand lines. If a unanimous
panel matches the hand labels almost always, the rest can be labelled without reading
it. If it does not, the labels would carry the panel's errors into the student.

The number that matters is not how often the panel is right overall. It is how often
it is right *when it agrees*, because that is the subset we would keep.
"""

import argparse
import collections
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--panel", default="data/panel.jsonl")
    args = parser.parse_args()

    rows = {r["id"]: r for r in (json.loads(line)
                                 for line in open(args.file, encoding="utf-8"))}
    answers = collections.defaultdict(dict)
    for line in open(args.panel, encoding="utf-8"):
        entry = json.loads(line)
        answers[entry["id"]][entry["model"]] = entry["answer"]

    models = sorted({m for per in answers.values() for m in per})
    buckets = collections.defaultdict(lambda: [0, 0])
    alone = collections.Counter()
    seen = collections.Counter()

    for rid, per_model in answers.items():
        row = rows.get(rid)
        if row is None or row.get("broken") or len(per_model) < len(models):
            continue
        right = set(row["label"]) if row["label"] else {"none"}

        for model, answer in per_model.items():
            seen[model] += 1
            alone[model] += answer in right

        votes = collections.Counter(per_model.values())
        top, count = votes.most_common(1)[0]
        buckets[count][0] += 1
        buckets[count][1] += top in right

    print(f"\n{sum(n for n, _ in buckets.values())} lines\n")
    print("each model on its own")
    for model in models:
        print(f"  {model.split('/')[1]:<22}{100 * alone[model] / seen[model]:>6.1f}%")

    print("\nby how many of the panel agreed")
    for count in sorted(buckets, reverse=True):
        total, right = buckets[count]
        print(f"  {count} of {len(models)} agree{'':<10}{total:>5} lines"
              f"{100 * right / total:>8.1f}% match the person")

    unanimous, unanimous_right = buckets[len(models)]
    covered = 100 * unanimous / sum(n for n, _ in buckets.values())
    print(f"\nkeeping only unanimous lines: {covered:.0f}% of the data, "
          f"{100 * unanimous_right / unanimous:.1f}% of it matching the person")


if __name__ == "__main__":
    main()
