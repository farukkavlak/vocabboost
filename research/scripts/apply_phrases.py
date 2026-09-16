"""Point lines whose target word belongs to a phrase at the phrase, and clear their labels.

Prints what would change; `--write` applies it. `--min-senses 2` also drops lines left
with a single sense and renumbers the rest.
"""

import argparse
import json

from common import read_jsonl, write_jsonl
from lookup import WORD, Vocab, index_of


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--db", default="data/vocab.db")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--min-senses", type=int, default=1)
    args = parser.parse_args()

    vocab = Vocab(args.db)
    rows = read_jsonl(args.file)

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

    if args.write and args.min_senses > 1:
        kept = [row for row in rows if len(row["senses"]) >= args.min_senses]
        print(f"{len(rows) - len(kept)} lines dropped for having one sense")
        for new_id, row in enumerate(kept, start=1):
            row["id"] = new_id
        rows = kept

    if args.write:
        write_jsonl(args.file, rows)
        print(f"rewritten, {changed} lines need labelling again")
    else:
        print("nothing written, pass --write to apply")


if __name__ == "__main__":
    main()
