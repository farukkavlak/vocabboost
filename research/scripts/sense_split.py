"""Split accuracy by whether the right sense is the word's commonest one.

"Always show the first sense" is right exactly when the line uses the commonest sense, and
wrong every other time. An average hides which of the two a model is good at, and a
reader looks a word up mostly when the obvious sense does not fit. So both test sets are
read in two parts: lines where the right sense is the first one WordNet lists, and lines
where it is not.
"""

import argparse
import json

from nltk.corpus import wordnet as wn
from sentence_transformers import SentenceTransformer
from zero_shot import hits, rank


def panel_rows(labels, split):
    """The unanimous lines of the test words, in the shape `rank` reads."""
    where = {w: part for part, words in json.load(open(split)).items() for w in words}
    rows = []
    for line in open(labels, encoding="utf-8"):
        r = json.loads(line)
        if where[r["lemma"]] != "test" or r.get("agreed") != 5 or "key" not in r:
            continue
        senses = []
        for key in r["candidates"]:
            s = wn.synset(key)
            senses.append({"key": key, "gloss": s.definition(), "examples": s.examples()[:2],
                           "synonyms": [n.replace("_", " ") for n in s.lemma_names()]})
        rows.append({"lemma": r["lemma"], "text": r["text"], "senses": senses,
                     "label": [r["key"]]})
    return rows


def report(name, rows, ordered):
    print(f"\n{name}\n")
    print(f"{'right sense':<18}{'lines':>7}{'first sense':>13}{'model':>8}{'top 3':>8}")
    for part, commonest in [("the commonest", True), ("another one", False), ("all", None)]:
        picked = [(r, k) for r, k in zip(rows, ordered, strict=True)
                  if commonest is None or (r["senses"][0]["key"] in r["label"]) == commonest]
        part_rows, part_keys = zip(*picked, strict=True)
        n = len(part_rows)
        base = sum(1 for r in part_rows if r["senses"][0]["key"] in r["label"])
        print(f"{part:<18}{n:>7}{100 * base / n:>12.1f}%"
              f"{100 * hits(part_rows, part_keys, 1) / n:>7.1f}%"
              f"{100 * hits(part_rows, part_keys, 3) / n:>7.1f}%")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    model = SentenceTransformer(args.model)
    hand = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    panel = panel_rows(args.labels, args.split)
    for name, rows in [("hand-labelled lines", hand), ("panel test lines, 5 of 5", panel)]:
        report(name, rows, rank(model, rows, "all", "prefixed"))


if __name__ == "__main__":
    main()
