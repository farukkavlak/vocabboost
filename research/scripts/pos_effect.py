"""Score the model with the tagged part of speech's senses, and with all of the lemma's."""

import argparse

from common import sense_dict, unanimous
from confidence import BAR, CONFIDENT_GAP, score_lines, threshold
from nltk.corpus import wordnet as wn
from sentence_transformers import SentenceTransformer


def every_sense(row):
    """The row with the senses of the lemma's other parts of speech added after its own."""
    have = {s["key"] for s in row["senses"]}
    senses = list(row["senses"])
    for synset in wn.synsets(row["lemma"].replace(" ", "_")):
        if synset.name() not in have:
            have.add(synset.name())
            senses.append(sense_dict(synset))
    return {**row, "senses": senses}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    model = SentenceTransformer(args.model)
    print(f"\n{'':<24}{'senses':>7}{'first':>8}{'top 3':>8}{'leads':>8}{'right':>8}"
          f"{'  own threshold':>16}")
    for part in ("validation", "test"):
        rows = [r for r in unanimous(args.labels, args.split, part) if r["label"]]
        for name, given in [("tagged", rows), ("every sense", [every_sense(r) for r in rows])]:
            lines = score_lines(model, given)
            above = [r for r in lines if r["gap"] >= CONFIDENT_GAP]
            own = threshold(lines)
            print(f"{part + ', ' + name:<24}"
                  f"{sum(len(r['senses']) for r in given) / len(given):>7.1f}"
                  f"{100 * sum(r['right'] for r in lines) / len(lines):>7.1f}%"
                  f"{100 * sum(r['top3'] for r in lines) / len(lines):>7.1f}%"
                  f"{100 * len(above) / len(lines):>7.1f}%"
                  f"{100 * sum(r['right'] for r in above) / len(above):>7.1f}%"
                  f"{f'{own:.3f}' if own is not None else f'never {BAR:.0%}':>16}")


if __name__ == "__main__":
    main()
