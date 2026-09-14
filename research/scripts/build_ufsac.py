"""Turn a UFSAC corpus into training examples, shaped exactly like the SemCor ones.

UFSAC bundles fifteen sense-annotated corpora in one XML format with WordNet 3.0 keys.
Two are worth training on. OMSTI is aligned automatically from parallel text, so it is
large and possibly noisy. MASC is smaller but includes transcribed speech, the register
the extension actually sees.

SemCor was marked by people; these were not. Same shape and same evaluation, so the
only difference is the data, which is what `make ufsac` sets up for the training run.

A word carrying two sense keys is dropped rather than resolved to the first: a label
nobody was sure of teaches the wrong thing.
"""

import argparse
import collections
import json
import random
import xml.etree.ElementTree as ET

from nltk.corpus import wordnet as wn

MIN_SENSES = 2
MIN_WORDS = 4


def sentences(path):
    """Stream <sentence> elements, freeing each one so a 2.2 GB file fits in memory."""
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

            candidates = [s for s in wn.synsets(lemma, synset.pos())
                          if any(one.name() == lemma for one in s.lemmas())]
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
    with open(args.out, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")

    senses = sum(len(r["candidates"]) for r in rows) / len(rows)
    ranks = collections.Counter(r["candidates"].index(r["key"]) for r in rows)
    print(f"examples  {len(rows):,}")
    print(f"words     {len({r['lemma'] for r in rows}):,} distinct")
    print(f"senses    {senses:.1f} on average")
    print(f"first     {100 * ranks[0] / len(rows):.1f}% of them are the commonest sense")
    for name, count in counts.most_common():
        if name != "kept":
            print(f"dropped   {count:,} {name}")


if __name__ == "__main__":
    main()
