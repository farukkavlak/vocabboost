"""Label panel lines by hand, blind, and score the panel against them per agreement level."""

import argparse
import collections
import json
import pathlib
import random

import label as labeller
from common import panel_answers, percent, read_jsonl


def agreement(answers):
    """How many of the panel gave the commonest answer, and what it was."""
    counts = collections.Counter(answers)
    answer, count = counts.most_common(1)[0]
    return count, answer


def agrees(person, panel):
    """`n` is an empty list and the panel spells it "none". Both mean no sense fits."""
    if panel == "none":
        return not person
    return panel in set(person)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/teacher.jsonl")
    parser.add_argument("--panel", default="data/teacher-panel.jsonl")
    parser.add_argument("--out", default="data/teacher-check.jsonl")
    parser.add_argument("--sample", default="5:60,4:40",
                        help="how many lines from each agreement level")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    rows = {row["id"]: row for row in read_jsonl(args.file)}
    answers = panel_answers(args.panel)

    levels = collections.defaultdict(list)
    for row_id, given in answers.items():
        if len(given) < 5 or None in given.values():
            continue
        count, answer = agreement(given.values())
        levels[count].append((row_id, answer))

    wanted = dict(part.split(":") for part in args.sample.split(","))
    sample = []
    rng = random.Random(args.seed)
    for level, count in wanted.items():
        pool = sorted(levels[int(level)])
        take = min(int(count), len(pool))
        if take < int(count):
            print(f"only {take} lines agreed {level} of 5, wanted {count}")
        for row_id, answer in rng.sample(pool, take):
            sample.append({"id": row_id, "level": int(level), "panel": answer})
    rng.shuffle(sample)

    path = pathlib.Path(args.out)
    done = {e["id"]: e for e in read_jsonl(path)} if path.exists() else {}

    todo = [item for item in sample if item["id"] not in done]
    print(f"{len(sample)} lines in the sample, {len(todo)} left to label")
    print(labeller.HELP)

    with path.open("a", encoding="utf-8") as handle:
        for item in todo:
            row = rows[item["id"]]
            order = labeller.show(row, len(done), len(sample))
            answer, unsure = labeller.read_answer(row, order)
            if answer == "q":
                break
            if answer == "s":
                continue
            entry = {"id": item["id"], "level": item["level"],
                     "panel": item["panel"],
                     "person": [] if answer == "broken" else answer,
                     "broken": answer == "broken", "unsure": unsure}
            handle.write(json.dumps(entry) + "\n")
            handle.flush()
            done[item["id"]] = entry

    report(done.values())


def report(entries):
    entries = list(entries)
    broken = sum(1 for e in entries if e["broken"])
    entries = [e for e in entries if not e["broken"]]
    if not entries:
        return
    print("\n  the panel against the person\n")
    by_level = collections.defaultdict(list)
    for entry in entries:
        by_level[entry["level"]].append(entry)
    for level in sorted(by_level, reverse=True):
        group = by_level[level]
        right = sum(1 for e in group if agrees(e["person"], e["panel"]))
        print(f"  {level} of 5 agreed   {right:>3}/{len(group):<3} "
              f"= {percent(right, len(group)):.0f}% match the person")
    print(f"\n  {len(entries)} lines scored, {broken} dropped as broken\n")


if __name__ == "__main__":
    main()
