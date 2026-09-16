"""Turn the panel's answers into one file: a label where they agreed, a count where not.

Two files went into the panel — the lines and the answers — and neither is useful
alone. This writes what is left when they are joined, in the shape `build_semcor.py`
produces, so training reads subtitle labels and SemCor the same way.

Every line is kept, not just the unanimous ones, and every line carries the panel's
commonest answer together with `agreed`, the number of models that gave it. Hand-checking
showed `agreed` is a quality score: 58 of 60 right at five, 32 of 40 at four. So the
caller sets the bar — `run.py --agreed 5` trains on the clean labels, `--agreed 4` trades
six points of label error for half again as much data.

`none` marks the lines where the panel's answer was that no sense fits — `club` in `club
soda`. Those carry no key, since there is nothing to point at.

The id is kept so `teacher-panel.jsonl` still joins on, for anything that needs to know
which model dissented rather than only how many did.
"""

import argparse
import collections
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/teacher.jsonl")
    parser.add_argument("--panel", default="data/teacher-panel.jsonl")
    parser.add_argument("--out", default="data/teacher-labels.jsonl")
    args = parser.parse_args()

    answers = collections.defaultdict(dict)
    for line in open(args.panel, encoding="utf-8"):
        entry = json.loads(line)
        answers[entry["id"]][entry["model"]] = entry["answer"]

    rows = []
    for line in open(args.file, encoding="utf-8"):
        row = json.loads(line)
        given = answers.get(row["id"], {})
        if len(given) < 5 or None in given.values():
            continue
        answer, agreed = collections.Counter(given.values()).most_common(1)[0]
        out = {
            "id": row["id"],
            "text": row["text"],
            "word": row["word"],
            "lemma": row["lemma"],
            "pos": row["pos"],
            "band": row["band"],
            "candidates": [sense["key"] for sense in row["senses"]],
            "agreed": agreed,
        }
        if answer == "none":
            out["none"] = True
        else:
            out["key"] = answer
        rows.append(out)

    with open(args.out, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")

    labels = [r for r in rows if "key" in r and r["agreed"] == 5]
    counts = collections.Counter(r["agreed"] for r in rows)
    senses = sum(len(r["candidates"]) for r in rows) / len(rows)
    print(f"lines     {len(rows):,}")
    print(f"senses    {senses:.1f} on average")
    for level in sorted(counts, reverse=True):
        print(f"  {level} of 5 {counts[level]:>6,}")
    usable = collections.Counter(r["agreed"] for r in rows if "key" in r)
    print(f"labels    {usable[5]:,} at 5 of 5, {usable[5] + usable[4]:,} at 4 or more")
    print(f"none      {sum(1 for r in rows if r.get('none')):,} say no sense fits")
    print(f"words     {len({r['lemma'] for r in labels}):,} distinct in the labels")
    ranks = collections.Counter(r["candidates"].index(r["key"]) for r in labels)
    print(f"first     {100 * ranks[0] / len(labels):.1f}% of the labels "
          f"are the commonest sense")


if __name__ == "__main__":
    main()
