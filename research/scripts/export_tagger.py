"""Export NLTK's tagger for the extension, and a fixture of tokens and tags its port must match.

The port splits sentences after any word ending in a period instead of using Punkt; the
fixture is written with that rule.
"""

import argparse
import json
import re

from common import load_split, read_jsonl
from nltk.tag.perceptron import PerceptronTagger
from nltk.tokenize import NLTKWordTokenizer

words = NLTKWordTokenizer()


def tokenize(text):
    """A period that ends a word, followed by a space, ends a sentence."""
    return [t for part in re.split(r"(?<=[^.\s]\.)\s+", text) for t in words.tokenize(part)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    parser.add_argument("--weights", default="../extension/public/tagger.json")
    parser.add_argument("--fixture", default="../tests/fixtures/tags.json")
    args = parser.parse_args()

    tagger = PerceptronTagger()
    weights = {feature: {tag: round(w, 3) for tag, w in tags.items() if round(w, 3)}
               for feature, tags in tagger.model.weights.items()}
    with open(args.weights, "w", encoding="utf-8") as out:
        json.dump({"weights": weights, "tagdict": tagger.tagdict,
                   "classes": sorted(tagger.classes)}, out, separators=(",", ":"))

    # Lines of the validation and test words.
    where = load_split(args.split)
    lines = []
    for row in read_jsonl(args.labels):
        if where[row["lemma"]] != "train":
            tokens = tokenize(row["text"])
            lines.append({"text": row["text"], "tokens": tokens,
                          "tags": [tag for _, tag in tagger.tag(tokens)]})
    with open(args.fixture, "w", encoding="utf-8") as out:
        json.dump(lines, out, indent=0, ensure_ascii=False)

    print(f"{args.weights}  {len(weights):,} features")
    print(f"{args.fixture}  {len(lines):,} lines")


if __name__ == "__main__":
    main()
