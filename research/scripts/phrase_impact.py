"""How often does the clicked word turn out to belong to a phrase?

The test set was built one word at a time, so its labels answer the question "which
sense of `club`". Where the line actually says `club soda`, that question was the
wrong one, and the honest answer during labelling was `n` — no sense fits. Those are
the lines phrase detection turns from a shrug into an answer.
"""

import argparse
import json

from lookup import WORD, Vocab


def index_of(words, target):
    target = target.lower()
    for i, word in enumerate(words):
        if word == target:
            return i
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--db", default="data/vocab.db")
    args = parser.parse_args()

    vocab = Vocab(args.db)
    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]

    fired, rescued, examples = 0, 0, []
    for row in rows:
        # Lines already switched to their phrase count too, or the figure would drop
        # to zero the moment `apply_phrases` had run.
        if row.get("phrase"):
            fired += 1
            examples.append((row, row["lemma"]))
            continue
        words = [w.lower() for w in WORD.findall(row["text"])]
        index = index_of(words, row["word"])
        if index is None:
            continue
        phrase = vocab.phrase_at(words, index)
        if not phrase:
            continue
        fired += 1
        if row["label"] == []:
            rescued += 1
        examples.append((row, phrase["lemma"]))

    print(f"\n{fired} of {len(rows)} lines turn out to be phrases")
    none = sum(1 for r in rows if r["label"] == [] and not r.get("broken"))
    print(f"{rescued} of the {none} lines marked 'no sense fits' are among them\n")
    for row, phrase in examples[:14]:
        mark = "n" if row["label"] == [] else " "
        print(f"  {mark} {row['word']:<12} -> {phrase:<22} {row['text'][:46]}")


if __name__ == "__main__":
    main()
