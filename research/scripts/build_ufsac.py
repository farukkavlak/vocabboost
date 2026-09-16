"""Turn a UFSAC corpus (OMSTI or MASC) into examples shaped like `build_semcor.py`'s.

A word tagged with more than one sense key is dropped rather than guessed.
"""

import argparse
import collections
import random
import xml.etree.ElementTree as ET

from common import candidate_synsets, describe_examples, write_jsonl
from nltk.corpus import wordnet as wn

MIN_SENSES = 2
MIN_WORDS = 4


def sentences(path):
    """Stream <sentence> elements, freeing each one; OMSTI is 2.2 GB."""
    for _, element in ET.iterparse(path, events=("end",)):
        if element.tag == "sentence":
            yield element
            element.clear()


def examples(path, counts):
    for sentence in sentences(path):
        words = sentence.findall("word")
        surfaces = [w.get("surface_form", "") for w in words]
        if len(surfaces) < MIN_WORDS:
            continue

        text = " ".join(surfaces)
        for index, word in enumerate(words):
            keys = word.get("wn30_key")
            if not keys:
                continue
            if ";" in keys:
                counts["ambiguous"] += 1
                continue
            try:
                sense = wn.lemma_from_key(keys)
                synset, lemma = sense.synset(), sense.name()
            except Exception:
                counts["unknown key"] += 1
                continue
            if not lemma or synset.pos() not in "nvar":
                continue

            candidates = candidate_synsets(lemma, synset.pos())
            if len(candidates) < MIN_SENSES or synset not in candidates:
                counts["one sense or missing"] += 1
                continue

            counts["kept"] += 1
            yield {
                "text": text,
                "word": surfaces[index],
                "lemma": lemma.replace("_", " ").lower(),
                "pos": synset.pos(),
                "key": synset.name(),
                "candidates": [s.name() for s in candidates],
            }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default="data/raw/ufsac-public-2.1/omsti.xml")
    parser.add_argument("--out", default="data/omsti.jsonl")
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    counts = collections.Counter()
    rows = list(examples(args.corpus, counts))
    random.Random(args.seed).shuffle(rows)
    write_jsonl(args.out, rows)
    describe_examples(rows)
    for name, count in counts.most_common():
        if name != "kept":
            print(f"dropped   {count:,} {name}")


if __name__ == "__main__":
    main()
