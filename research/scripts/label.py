"""Mark the right sense for each line by hand.

Senses are shuffled: WordNet lists them commonest first, and how often the first one
is right is what we are measuring. Several can be accepted at once, because WordNet
splits meanings more finely than anyone can tell apart. An answer can be marked
uncertain, so accuracy is reportable with and without the shaky ones.

The model sees the same single line you do. If the line does not say which meaning it
is, neither of you can know, and `n` is the honest answer.

`n` and `x` differ. `n` means no sense fits a fine line — `club` in `club soda` — and
is what phase 15 learns from. `x` means the line is garbled and leaves the set.

Progress is written after every answer. `--redo 4,9` reopens those lines.
"""

import argparse
import json
import random
import textwrap

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"

HELP = """
  1        this sense
  1,3      both fit, they read the same to me
  n        no sense here fits
  x        the line itself is broken, drop it from the set
  ?1,3     as above, but I am not sure
  s        skip for now
  q        save and quit
"""


def save(path, rows):
    with open(path, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


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

    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
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
        save(args.file, rows)

    done = sum(1 for r in rows if r.get("label") is not None)
    unsure = sum(1 for r in rows if r.get("unsure"))
    broken = sum(1 for r in rows if r.get("broken"))
    print(f"\n{done}/{total} labelled, {unsure} of them marked unsure, "
          f"{broken} dropped as broken.")
    print("Run `make label` again to carry on.\n")


if __name__ == "__main__":
    main()
