"""Label a sample again, blind, and report how often you agree with your earlier answers.

That agreement is the ceiling for any model scored on these labels. Wait a few days first.
"""

import argparse
import json
import random

import label as labeller
from common import percent, read_jsonl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--out", default="data/recheck.jsonl")
    parser.add_argument("--count", type=int, default=30)
    parser.add_argument("--seed", type=int, default=99)
    args = parser.parse_args()

    rows = read_jsonl(args.file)
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

    # Two "no sense fits" answers are empty lists, and they agree.
    def agrees(first, again):
        return bool(set(first) & set(again)) or (not first and not again)

    agreed = sum(1 for row in sample
                 if row["id"] in answers and agrees(row["label"], answers[row["id"]]))
    done = len(answers)
    if not done:
        return

    with open(args.out, "w", encoding="utf-8") as handle:
        for row_id, answer in answers.items():
            handle.write(json.dumps({"id": row_id, "second_label": answer}) + "\n")

    print(f"\nagreed with yourself on {agreed}/{done} = {percent(agreed, done):.0f}%")
    print("No model measured on these labels can honestly claim to beat that.\n")


if __name__ == "__main__":
    main()
