"""Label lines by hand: pick the sense (or senses) the line uses.

Senses are shown shuffled, since how often the first one is right is what gets measured.
`n` means no sense fits; `x` drops a garbled line. Progress is saved after each answer,
and `--redo 4,9` reopens lines.
"""

import argparse
import random
import textwrap

from common import BOLD, DIM, OFF, read_jsonl, write_jsonl

HELP = """
  1        this sense
  1,3      both fit, they read the same to me
  n        no sense here fits
  x        the line itself is broken, drop it from the set
  ?1,3     as above, but I am not sure
  s        skip for now
  q        save and quit
"""


def show(row, done, total):
    order = list(range(len(row["senses"])))
    random.Random(row["id"]).shuffle(order)

    text = row["text"].replace(row["word"], f"{BOLD}{row['word']}{OFF}", 1)
    print(f"\n{DIM}{done}/{total} labelled  ·  {row['band']}  ·  id {row['id']}{OFF}")
    print(f"\n  {text}\n")
    print(f"  {BOLD}{row['lemma']}{OFF} ({row['pos']})\n")

    for shown, index in enumerate(order, start=1):
        sense = row["senses"][index]
        synonyms = ", ".join(sense["synonyms"])
        print(f"  {shown:>2}. {BOLD}{synonyms}{OFF}")
        print(textwrap.fill(sense["gloss"], 74, initial_indent="      ",
                            subsequent_indent="      "))
        for example in sense["examples"]:
            print(f"      {DIM}\"{example}\"{OFF}")
    return order


def read_answer(row, order):
    while True:
        answer = input("\n  > ").strip().lower()
        if answer in ("q", "s"):
            return answer, False
        if answer in ("h", "?", "help"):
            print(HELP)
            continue

        unsure = answer.startswith("?")
        answer = answer.lstrip("?").strip()

        if answer == "n":
            return [], unsure
        if answer == "x":
            return "broken", unsure
        picks = [p.strip() for p in answer.split(",") if p.strip()]
        if picks and all(p.isdigit() and 1 <= int(p) <= len(order) for p in picks):
            keys = [row["senses"][order[int(p) - 1]]["key"] for p in picks]
            return sorted(set(keys)), unsure
        print("  not an option — press h for help")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--redo", default="", help="comma separated ids to label again")
    args = parser.parse_args()

    rows = read_jsonl(args.file)
    total = len(rows)
    redo = {int(i) for i in args.redo.replace(",", " ").split()}
    print(HELP)

    for row in rows:
        if redo and row["id"] not in redo:
            continue
        if not redo and row.get("label") is not None:
            continue
        done = sum(1 for r in rows if r.get("label") is not None)
        order = show(row, done, total)
        answer, unsure = read_answer(row, order)
        if answer == "q":
            break
        if answer == "s":
            continue
        if answer == "broken":
            row["label"], row["broken"] = [], True
        else:
            row["label"], row["unsure"] = answer, unsure
        write_jsonl(args.file, rows)

    done = sum(1 for r in rows if r.get("label") is not None)
    unsure = sum(1 for r in rows if r.get("unsure"))
    broken = sum(1 for r in rows if r.get("broken"))
    print(f"\n{done}/{total} labelled, {unsure} of them marked unsure, "
          f"{broken} dropped as broken.")
    print("Run `make label` again to carry on.\n")


if __name__ == "__main__":
    main()
