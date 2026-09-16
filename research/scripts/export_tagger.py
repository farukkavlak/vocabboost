"""Hand NLTK's part-of-speech tagger to the extension, and the answers it has to match.

Every labelled line was tagged by NLTK before a sense was chosen, and without the tag the
model loses ten points. The extension ships the same tagger rather than a different one,
so it gives the tags every number in this folder was measured with.

Two files are written:

- `extension/public/tagger.json`, the perceptron's weights, its dictionary of words that
  only ever take one tag, and its tag list. Weights are rounded to three decimals: 5.1 MB
  against 5.7, and not one tag changes over the 8,431 panel lines.
- `tests/fixtures/tags.json`, lines with the tokens and tags Python gives them, which the
  TypeScript port is tested against.

One thing differs from `nltk.word_tokenize`. It splits a line into sentences with Punkt,
a trained model of its own, before splitting words: a period ending a sentence is a
token, one ending an abbreviation is not. The port splits after any word ending in a
period instead. Over 8,580 labelled lines that changes the tokens of 111 and the tag of
the looked-up word on one. The fixture is written with the port's rule, so the test
checks the port and this note records what the rule costs.
"""

import argparse
import json
import re

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

    # The lines of the validation and test words: every kind of line the model is
    # scored on, and none it was trained on.
    where = {w: part for part, ws in json.load(open(args.split)).items() for w in ws}
    lines = []
    for line in open(args.labels, encoding="utf-8"):
        row = json.loads(line)
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
