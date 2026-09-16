"""Join the lines and the panel's answers into `teacher-labels.jsonl`.

Each line keeps the panel's commonest answer as `key` (or `none` when no sense fits) and
`agreed`, how many models gave it. Callers choose the agreement they train on.
"""

import argparse
import collections

from common import panel_answers, percent, read_jsonl, write_jsonl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/teacher.jsonl")
    parser.add_argument("--panel", default="data/teacher-panel.jsonl")
    parser.add_argument("--out", default="data/teacher-labels.jsonl")
    args = parser.parse_args()

    answers = panel_answers(args.panel)

    rows = []
    for row in read_jsonl(args.file):
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

    write_jsonl(args.out, rows)

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
    print(f"first     {percent(ranks[0], len(labels)):.1f}% of the labels "
          f"are the commonest sense")


if __name__ == "__main__":
    main()
