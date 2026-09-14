"""Train the small encoder on prepared examples and score it. One run, start to finish.

One script rather than notebook cells: a runtime that recycles between cells takes the
trained model with it.

Reads the `.jsonl` files `scripts/build_*.py` produce, so the data is prepared on a
laptop where it can be looked at. More than one file trains on them together. Needs
`working.jsonl` beside it — the hand-labelled subtitle lines.

    python run.py --data semcor.jsonl --out model-semcor
    python run.py --data semcor.jsonl omsti.jsonl --out model-both

Three terms, since this is the first training code in the repo. A **batch** is how many
examples the model sees before adjusting itself. An **epoch** is one pass over the
training set. The **loss** is how wrong the model is now; training drives it down.

Loss on the training data alone tells you nothing — a memorising model shows a falling
loss and a test score that stops moving. So the subtitle lines are scored after every
epoch, not only at the end.
"""

import argparse
import collections
import json
import random

import nltk

# The data has to be on disk before nltk.corpus is imported, which is why the imports
# below are not at the top of the file.
for package in ["wordnet", "omw-1.4"]:
    nltk.download(package, quiet=True)

from nltk.corpus import wordnet as wn
from sentence_transformers import (
    InputExample,
    SentenceTransformer,
    evaluation,
    losses,
    util,
)
from torch.utils.data import DataLoader

MODEL = "sentence-transformers/all-MiniLM-L6-v2"   # 22M, the one that fits a browser


def load(paths):
    rows = []
    for path in paths:
        part = [json.loads(line) for line in open(path, encoding="utf-8")]
        first = sum(1 for r in part if r["candidates"][0] == r["key"])
        print(f"{path:<16}{len(part):>10,} examples  "
              f"{len({r['lemma'] for r in part}):>6,} words  "
              f"{100 * first / len(part):>5.1f}% commonest sense")
        rows.extend(part)
    return rows


def sense_text(key):
    """How a sense is written down.

    Phase 12 measured this: synonyms, definition and examples together beat the
    definition alone by seven points. WordNet's definitions are abstract, its examples
    are how people speak, and the question is a line somebody spoke.
    """
    s = wn.synset(key)
    return " ".join([", ".join(lemma.name().replace("_", " ") for lemma in s.lemmas()) + ":",
                     s.definition(), *s.examples()[:2]])


def line_text(row):
    return f'{row["lemma"]}: {row["text"]}'


def pairs(rows, rng):
    """Anchor, the right sense, and one wrong sense of the same word.

    The wrong answers are other senses of the same word, not random sentences. Telling
    `safe` the strongbox from `safe` the contraceptive is the job; telling it from "the
    weather is nice" is not, and easy negatives teach nothing.
    """
    made = []
    for row in rows:
        wrong = [k for k in row["candidates"] if k != row["key"]]
        if wrong:
            made.append(InputExample(texts=[line_text(row), sense_text(row["key"]),
                                            sense_text(rng.choice(wrong))]))
    return made


def score(encoder, test):
    """How often the right sense is first, in the top three, in the top five."""
    lines = encoder.encode([line_text(r) for r in test], convert_to_tensor=True,
                           normalize_embeddings=True, show_progress_bar=False)
    at = collections.Counter()
    for row, line in zip(test, lines, strict=True):
        texts = [sense_text(s["key"]) for s in row["senses"]]
        senses = encoder.encode(texts, convert_to_tensor=True,
                                normalize_embeddings=True, show_progress_bar=False)
        order = util.cos_sim(line, senses)[0].argsort(descending=True).tolist()
        keys = [row["senses"][i]["key"] for i in order]
        for depth in (1, 3, 5):
            if set(keys[:depth]) & set(row["label"]):
                at[depth] += 1
    return {d: round(100 * at[d] / len(test), 1) for d in (1, 3, 5)}


def held_out_score(checker, model):
    """TripletEvaluator returns a dict of metrics; we want the accuracy out of it."""
    result = checker(model)
    if isinstance(result, dict):
        for name, value in result.items():
            if "accuracy" in name:
                return value
        return next(iter(result.values()))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", nargs="+", default=["semcor.jsonl"])
    parser.add_argument("--test", default="working.jsonl")
    parser.add_argument("--out", default="model")
    parser.add_argument("--examples", type=int, default=0, help="0 means all of them")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    print()
    rows = load(args.data)
    rng.shuffle(rows)
    print()

    # Split by word, not by row. The same word in both halves would let the model
    # recognise it rather than read the sentence.
    words = sorted({r["lemma"] for r in rows})
    rng.shuffle(words)
    held = set(words[: len(words) // 10])
    train = [r for r in rows if r["lemma"] not in held]
    if args.examples:
        train = train[: args.examples]
    valid = [r for r in rows if r["lemma"] in held][:2_000]
    print(f"train {len(train):,} examples, {len({r['lemma'] for r in train}):,} words")
    print(f"valid {len(valid):,} examples, {len({r['lemma'] for r in valid}):,} words\n")

    test = [json.loads(line) for line in open(args.test, encoding="utf-8")]
    base = sum(1 for r in test if r["senses"][0]["key"] in r["label"])
    print(f"{len(test)} hand-labelled subtitle lines, never seen in training")
    print(f"first sense in the dictionary   {100 * base / len(test):.1f}%\n")

    model = SentenceTransformer(MODEL)
    checker = evaluation.TripletEvaluator.from_input_examples(pairs(valid, rng),
                                                             name="held-out words")
    print(f"epoch 0  held-out {held_out_score(checker, model):.3f}  "
          f"subtitles {score(model, test)}", flush=True)

    loader = DataLoader(pairs(train, rng), shuffle=True, batch_size=args.batch)
    loss = losses.MultipleNegativesRankingLoss(model)
    for epoch in range(1, args.epochs + 1):
        model.fit(train_objectives=[(loader, loss)], epochs=1,
                  warmup_steps=int(0.1 * len(train) / args.batch) if epoch == 1 else 0,
                  output_path=args.out, show_progress_bar=True)
        print(f"epoch {epoch}  held-out {held_out_score(checker, model):.3f}  "
              f"subtitles {score(model, test)}", flush=True)

    print(f"\nsaved to {args.out}/", flush=True)


if __name__ == "__main__":
    main()
