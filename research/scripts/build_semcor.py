"""Turn SemCor into training examples: a sentence, a word, its candidate senses, the right one.

Words with a single sense are dropped; there is nothing to choose.
"""

import argparse
import random

from common import candidate_synsets, describe_examples, write_jsonl
from nltk.corpus import semcor

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
            candidates = candidate_synsets(lemma, synset.pos())
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
    write_jsonl(args.out, rows)
    describe_examples(rows)


if __name__ == "__main__":
    main()
