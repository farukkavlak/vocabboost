"""Build the data, train the small encoder, and score it. One run, start to finish.

Written as one script rather than a row of notebook cells because a Colab runtime that
recycles between cells takes the trained model with it. Here a restart costs one
command, not eight.

Needs `working.jsonl` beside it — the hand-labelled subtitle lines. Everything else it
fetches.

Three words worth knowing before reading it.

A **batch** is how many examples the model sees before adjusting itself. Bigger is
steadier and needs more memory.

An **epoch** is one pass over the training set. More epochs means more chances to
learn and, past a point, more chances to memorise.

The **loss** is how wrong the model currently is. Training is making it go down.
Watching it on the training data alone tells you nothing: a memorising model shows a
falling training loss and a test score that stops moving, and that gap is the thing to
watch. So the subtitle lines are scored after every epoch, not only at the end.
"""

import argparse
import collections
import json
import random

import nltk

# The data has to be on disk before nltk.corpus is imported, which is why the imports
# below are not at the top of the file.
for package in ["wordnet", "omw-1.4", "semcor"]:
    nltk.download(package, quiet=True)

from nltk.corpus import semcor
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
MIN_SENSES, MIN_WORDS = 2, 4


def semcor_examples():
    """SemCor, shaped like the question asked at run time.

    37,000 sentences where a person marked which sense each content word carries. It
    ships with NLTK and costs nothing. What it is not is film: it is books and
    journalism, so it teaches the task but not the register.
    """
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
        for _start, _length, label in tagged:
            try:
                synset, lemma = label.synset(), label.name()
            except Exception:
                continue
            if not lemma or synset.pos() not in "nvar":
                continue
            candidates = [s for s in wn.synsets(lemma, synset.pos())
                          if any(one.name() == lemma for one in s.lemmas())]
            if len(candidates) < MIN_SENSES or synset not in candidates:
                continue
            yield {"text": text, "lemma": lemma.replace("_", " ").lower(),
                   "key": synset.name(),
                   "candidates": [s.name() for s in candidates]}


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


def semcor_score(checker, model):
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
    parser.add_argument("--test", default="working.jsonl")
    parser.add_argument("--out", default="model")
    parser.add_argument("--examples", type=int, default=0, help="0 means all of them")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    rows = list(semcor_examples())
    rng.shuffle(rows)
    first = sum(1 for r in rows if r["candidates"][0] == r["key"])
    print(f"\nexamples {len(rows):,}, {len({r['lemma'] for r in rows}):,} words")
    print(f"{100 * first / len(rows):.1f}% of them are the commonest sense\n")

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
    print(f"epoch 0  semcor {semcor_score(checker, model):.3f}  "
          f"subtitles {score(model, test)}")

    loader = DataLoader(pairs(train, rng), shuffle=True, batch_size=args.batch)
    loss = losses.MultipleNegativesRankingLoss(model)
    for epoch in range(1, args.epochs + 1):
        model.fit(train_objectives=[(loader, loss)], epochs=1,
                  warmup_steps=int(0.1 * len(train) / args.batch) if epoch == 1 else 0,
                  output_path=args.out, show_progress_bar=True)
        print(f"epoch {epoch}  semcor {semcor_score(checker, model):.3f}  "
              f"subtitles {score(model, test)}")

    print(f"\nsaved to {args.out}/")


if __name__ == "__main__":
    main()
