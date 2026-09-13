"""Label a sample a second time, blind, and see how often you agree with yourself.

This is the ceiling. If you and your own earlier answers agree eight times in ten,
no model can be judged past eight in ten either, because the fourth line in every
twenty has no answer everyone would accept. Reading a model's score without this
number next to it is how people talk themselves into results that are not there.

Wait a few days after labelling. The point is not to remember what you said.
"""

import argparse
import json
import random

import label as labeller


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--out", default="data/recheck.jsonl")
    parser.add_argument("--count", type=int, default=30)
    parser.add_argument("--seed", type=int, default=99)
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    labelled = [row for row in rows if row.get("label") is not None]
    sample = random.Random(args.seed).sample(labelled, min(args.count, len(labelled)))

    print(labeller.HELP)
    answers = {}
    for done, row in enumerate(sample):
        order = labeller.show(row, done, len(sample))
        answer, _unsure = labeller.read_answer(row, order)
        if answer == "q":
            break
        if answer == "s":
            continue
        answers[row["id"]] = answer

    agreed = sum(1 for row in sample
                 if row["id"] in answers
                 and set(answers[row["id"]]) & set(row["label"]))
    done = len(answers)
    if not done:
        return

    with open(args.out, "w", encoding="utf-8") as handle:
        for row_id, answer in answers.items():
            handle.write(json.dumps({"id": row_id, "second_label": answer}) + "\n")

    print(f"\nagreed with yourself on {agreed}/{done} = {100 * agreed / done:.0f}%")
    print("No model measured on these labels can honestly claim to beat that.\n")


if __name__ == "__main__":
    main()
