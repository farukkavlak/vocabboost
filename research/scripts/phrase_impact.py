"""Count the hand-labelled lines whose target word turns out to belong to a phrase."""

import argparse

from common import read_jsonl
from lookup import WORD, Vocab, index_of


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--db", default="data/vocab.db")
    args = parser.parse_args()

    vocab = Vocab(args.db)
    rows = read_jsonl(args.file)

    fired, rescued, examples = 0, 0, []
    for row in rows:
        # Lines `apply_phrases` already switched count too.
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
