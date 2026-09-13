"""Turn SemCor into training examples shaped like the question we ask at run time.

SemCor is 37,000 sentences where a person marked which sense each content word
carries. It ships with NLTK, it is what the published bi-encoder was trained on, and
it costs nothing. What it is not is film: it is books and journalism, so it teaches
the task but not the register. Phase 13's second half covers that.

Each example is the same shape as a line in the test set — a sentence, a target word,
the senses it could carry, and which one is right — so training and evaluation ask the
identical question.

Words with one sense are dropped. There is nothing to learn from a choice of one, and
keeping them would flatter every number that follows.
"""

import argparse
import collections
import json
import random

from nltk.corpus import semcor
from nltk.corpus import wordnet as wn

MIN_SENSES = 2
MIN_WORDS = 4


def examples():
    for sentence in semcor.tagged_sents(tag="sem"):
        words, tagged = [], []
        for chunk in sentence:
            leaves = chunk.leaves() if hasattr(chunk, "leaves") else list(chunk)
            start = len(words)
            words.extend(leaves)
            label = getattr(chunk, "label", lambda: None)()
            if label is not None and hasattr(label, "synset"):
                tagged.append((start, len(leaves), label))

        if len(words) < MIN_WORDS:
            continue
        text = " ".join(words)
        for start, length, label in tagged:
            try:
                synset = label.synset()
                lemma = label.name()
            except Exception:
                continue
            if not lemma or synset.pos() not in "nvar":
                continue
            candidates = [s for s in wn.synsets(lemma, synset.pos())
                          if any(l.name() == lemma for l in s.lemmas())]
            if len(candidates) < MIN_SENSES or synset not in candidates:
                continue
            yield {
                "text": text,
                "word": " ".join(words[start:start + length]),
                "lemma": lemma.replace("_", " ").lower(),
                "pos": synset.pos(),
                "key": synset.name(),
                "candidates": [s.name() for s in candidates],
            }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/semcor.jsonl")
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rows = list(examples())
    random.Random(args.seed).shuffle(rows)
    with open(args.out, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")

    senses = sum(len(r["candidates"]) for r in rows) / len(rows)
    ranks = collections.Counter(r["candidates"].index(r["key"]) for r in rows)
    first = 100 * ranks[0] / len(rows)
    print(f"examples  {len(rows):,}")
    print(f"words     {len({r['lemma'] for r in rows}):,} distinct")
    print(f"senses    {senses:.1f} on average")
    print(f"first     {first:.1f}% of them are the commonest sense")


if __name__ == "__main__":
    main()
