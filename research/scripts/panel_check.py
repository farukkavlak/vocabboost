"""Score the panel against the hand labels, by how many of its models agreed."""

import argparse
import collections

from common import panel_answers, read_jsonl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--panel", default="data/panel.jsonl")
    parser.add_argument("--models", nargs="+", default=[],
                        help="score a subset of the answers on file")
    args = parser.parse_args()

    rows = {r["id"]: r for r in read_jsonl(args.file)}
    answers = panel_answers(args.panel)

    models = args.models or sorted({m for per in answers.values() for m in per})
    answers = {i: {m: a for m, a in per.items() if m in models}
               for i, per in answers.items()}
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
