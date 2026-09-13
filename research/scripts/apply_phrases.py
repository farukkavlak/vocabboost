"""Point the test lines that are really phrases at the phrase, and clear their labels.

The set was built one word at a time, so a line saying `check it out` was labelled as
though the question were "which of the 25 senses of check". It is not. The right answer
is the entry `check out`, and the old label answers a question we will not ask.

This rewrites those lines to carry the phrase and its senses, and empties their labels
so they can be marked again. Nothing else in the file is touched. Run it with
`--write` once the listing looks right.
"""

import argparse
import json

from lookup import WORD, Vocab
from phrase_impact import index_of


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--db", default="data/vocab.db")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    vocab = Vocab(args.db)
    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]

    changed = 0
    for row in rows:
        if row.get("broken") or row.get("phrase"):
            continue
        words = [w.lower() for w in WORD.findall(row["text"])]
        index = index_of(words, row["word"])
        if index is None:
            continue
        phrase = vocab.phrase_at(words, index)
        if not phrase:
            continue

        senses = vocab.senses(phrase["id"])
        print(f"  {row['id']:>4}  {row['lemma']:<12} -> {phrase['lemma']:<20}"
              f"{len(row['senses']):>3} -> {len(senses)} senses")
        changed += 1
        if not args.write:
            continue
        row["lemma"] = phrase["lemma"]
        row["word"] = phrase["lemma"]
        row["pos"] = phrase["pos"]
        row["phrase"] = True
        row["senses"] = [{"key": s["key"], "gloss": s["gloss"],
                          "examples": json.loads(s["examples"]),
                          "synonyms": json.loads(s["synonyms"])} for s in senses]
        row["label"] = None
        row.pop("unsure", None)

    print(f"\n{changed} lines are phrases")
    if args.write:
        with open(args.file, "w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")
        print(f"rewritten, {changed} lines need labelling again")
    else:
        print("nothing written, pass --write to apply")


if __name__ == "__main__":
    main()
