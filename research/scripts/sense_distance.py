"""Check whether WordNet separates senses a labeller accepted together from ones kept apart.

Five signals: lexicographer file, path and Wu-Palmer similarity, synonym overlap and gloss
overlap. The hierarchy measures exist for nouns and verbs only.
"""

import argparse
import collections
import statistics

from common import read_jsonl
from nltk.corpus import wordnet as wn


def pairs(row):
    """(accepted, accepted) pairs and (accepted, rejected) pairs for one line."""
    keys = [s["key"] for s in row["senses"]]
    taken = set(row["label"])
    same = [(a, b) for i, a in enumerate(keys) for b in keys[i + 1:]
            if a in taken and b in taken]
    apart = [(a, b) for a in keys if a in taken for b in keys if b not in taken]
    return same, apart


STOP = {"a", "an", "the", "of", "or", "and", "to", "in",
        "for", "with", "that", "is", "as", "by", "on", "be", "not"}


def overlap(left, right):
    """Jaccard: how much of the two sets is shared."""
    if not left or not right:
        return None
    return len(left & right) / len(left | right)


def words(text):
    return {w.strip(".,;:()`'\"").lower() for w in text.split()} - STOP


def signals(a, b):
    x, y = wn.synset(a), wn.synset(b)
    return {"lexname": float(x.lexname() == y.lexname()),
            "path": x.path_similarity(y),
            "wup": x.wup_similarity(y),
            "synonym": overlap({lemma.name() for lemma in x.lemmas()},
                               {lemma.name() for lemma in y.lemmas()}),
            "gloss": overlap(words(x.definition()), words(y.definition()))}


def summarise(name, measurements):
    print(f"  {name:<26}", end="")
    for signal in ("lexname", "path", "wup", "synonym", "gloss"):
        values = [m[signal] for m in measurements if m[signal] is not None]
        print(f"{statistics.mean(values):>9.2f}" if values else f"{'-':>9}", end="")
    print(f"{len(measurements):>8}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    args = parser.parse_args()

    rows = [r for r in read_jsonl(args.file) if r.get("label") and len(r["label"]) > 1]

    groups = collections.defaultdict(lambda: ([], []))
    for row in rows:
        family = "noun / verb" if row["pos"] in "nv" else "adjective / adverb"
        same, apart = pairs(row)
        groups[family][0].extend(signals(a, b) for a, b in same)
        groups[family][1].extend(signals(a, b) for a, b in apart)

    print(f"{len(rows)} lines where more than one sense was accepted\n")
    print(f"  {'':<26}{'lexname':>9}{'path':>9}{'wup':>9}"
          f"{'synonym':>9}{'gloss':>9}{'pairs':>8}")
    for family, (same, apart) in sorted(groups.items()):
        print(f"\n{family}")
        summarise("accepted together", same)
        summarise("accepted vs rejected", apart)


if __name__ == "__main__":
    main()
