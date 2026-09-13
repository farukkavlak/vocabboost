"""Train the small encoder to put a line next to its right sense.

The shape is the bi-encoder from the phase 12 reading: one encoder reads the line, the
same encoder reads each candidate sense, and the nearest sense wins. Training moves the
right sense closer to the line and the wrong ones further away.

Three words worth knowing before reading the code.

A **batch** is how many examples the model looks at before adjusting itself. Larger
batches give steadier adjustments and need more memory.

An **epoch** is one pass over the whole training set. More epochs means more chances to
learn, and past a point, more chances to memorise.

The **loss** is a number saying how wrong the model currently is. Training is nothing
but making that number go down. Watching it on the training data alone tells you
nothing: a model that memorises its examples shows a falling training loss and a rising
validation loss, and that gap is the thing to watch for.

The negatives are the other senses of the same word, not random sentences. Telling
`safe` the strongbox from `safe` the contraceptive is the job; telling it from "the
weather is nice" is not, and a model trained on easy negatives learns nothing useful.
"""

import argparse
import json
import random

from sentence_transformers import (InputExample, SentenceTransformer, losses,
                                   evaluation)
from torch.utils.data import DataLoader


def sense_text(synset):
    from nltk.corpus import wordnet as wn
    s = wn.synset(synset)
    parts = [", ".join(l.name().replace("_", " ") for l in s.lemmas()) + ":",
             s.definition(), *s.examples()[:2]]
    return " ".join(parts)


def line_text(row):
    return f'{row["lemma"]}: {row["text"]}'


def pairs(rows, rng):
    """Anchor, right sense, and one wrong sense of the same word."""
    made = []
    for row in rows:
        wrong = [k for k in row["candidates"] if k != row["key"]]
        if not wrong:
            continue
        made.append(InputExample(texts=[line_text(row),
                                        sense_text(row["key"]),
                                        sense_text(rng.choice(wrong))]))
    return made


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/semcor.jsonl")
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--out", default="data/model")
    parser.add_argument("--examples", type=int, default=50_000)
    parser.add_argument("--validation", type=int, default=2_000)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    rows = [json.loads(l) for l in open(args.data, encoding="utf-8")]
    rng.shuffle(rows)

    # Split by word, not by row. The same word appearing in both halves would let the
    # model recognise it rather than read the sentence.
    words = sorted({r["lemma"] for r in rows})
    rng.shuffle(words)
    held = set(words[: len(words) // 10])
    train = [r for r in rows if r["lemma"] not in held][: args.examples]
    valid = [r for r in rows if r["lemma"] in held][: args.validation]

    print(f"train  {len(train):,} examples, {len({r['lemma'] for r in train}):,} words")
    print(f"valid  {len(valid):,} examples, {len({r['lemma'] for r in valid}):,} words")

    model = SentenceTransformer(args.model)
    loader = DataLoader(pairs(train, rng), shuffle=True, batch_size=args.batch)
    loss = losses.MultipleNegativesRankingLoss(model)

    checker = evaluation.TripletEvaluator.from_input_examples(
        pairs(valid, rng), name="held-out words")

    model.fit(train_objectives=[(loader, loss)],
              evaluator=checker,
              epochs=args.epochs,
              warmup_steps=int(0.1 * len(loader)),
              output_path=args.out,
              show_progress_bar=True)
    print(f"\nsaved to {args.out}")


if __name__ == "__main__":
    main()
