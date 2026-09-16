"""Train the small encoder on prepared examples and score it. One run, start to finish.

One script rather than notebook cells: a runtime that recycles between cells takes the
trained model with it.

Reads the `.jsonl` files `scripts/build_*.py` produce, so the data is prepared on a
laptop where it can be looked at. More than one file trains on them together. Needs
`working.jsonl` beside it — the hand-labelled subtitle lines.

    python run.py --data semcor.jsonl --out model-semcor
    python run.py --data teacher-labels.jsonl --from model-semcor --out model-tuned

`--from` continues from a model already trained rather than starting fresh. Mixing
3,708 subtitle lines into 177,665 SemCor ones makes them 2% of the data and one pass
will not weight them; training on them second is what domain adaptation means.

Three terms, since this is the first training code in the repo. A **batch** is how many
examples the model sees before adjusting itself. An **epoch** is one pass over the
training set. The **loss** is how wrong the model is now; training drives it down.

Loss on the training data alone tells you nothing — a memorising model shows a falling
loss and a test score that stops moving. So the subtitle lines are scored after every
epoch, not only at the end.

One score is not a result. Training is random — batch order, dropout — so the same job
twice gives two numbers, and the gap between them was four points before the seeding
below was fixed. `--seed` now fixes the training as well as the data, which makes a run
repeatable; it does not make one run informative. Comparing two settings means running
each at several seeds and reading the spread.
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

import torch
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


def load(paths, agreed=0):
    """Read the prepared examples, keeping only the ones worth training on.

    The panel-labelled file carries every line it was asked, with `agreed` saying how
    many of the five models gave the answer. `agreed` gates it: the labels are 97% right
    at five and 80% at four. Lines the panel answered with "no sense fits" carry no key
    and are dropped here — phase 15 is what they are for.

    SemCor rows have no `agreed` and are always kept: a person marked them.
    """
    rows = []
    for path in paths:
        part = [json.loads(line) for line in open(path, encoding="utf-8")]
        kept = [r for r in part if "key" in r and r.get("agreed", 5) >= agreed]
        if len(kept) < len(part):
            print(f"{path:<16}{len(part) - len(kept):>10,} dropped, "
                  f"below {agreed} of 5 or no sense fits")
        part = kept
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
    parser.add_argument("--from", dest="start", default=MODEL,
                        help="a trained model to continue from, instead of the base one")
    parser.add_argument("--examples", type=int, default=0, help="0 means all of them")
    parser.add_argument("--agreed", type=int, default=5,
                        help="how many of the five models a panel label needs")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    # Python's `random` covers the data: which rows, which wrong answers, which words
    # are held out. Torch covers the training: batch order and dropout. Seeding only the
    # first left the second free, and the same job scored 64.4% and 68.5% on two runs —
    # four points of movement mistaken for a result.
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    print()
    rows = load(args.data, args.agreed)
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

    print(f"starting from {args.start}\n")
    model = SentenceTransformer(args.start)
    checker = evaluation.TripletEvaluator.from_input_examples(pairs(valid, rng),
                                                             name="held-out words")
    print(f"epoch 0  held-out {held_out_score(checker, model):.3f}  "
          f"subtitles {score(model, test)}", flush=True)

    loader = DataLoader(pairs(train, rng), shuffle=True, batch_size=args.batch)
    loss = losses.MultipleNegativesRankingLoss(model)
    best = (0, None)
    for epoch in range(1, args.epochs + 1):
        model.fit(train_objectives=[(loader, loss)], epochs=1,
                  warmup_steps=int(0.1 * len(train) / args.batch) if epoch == 1 else 0,
                  show_progress_bar=True)
        subtitles = score(model, test)
        print(f"epoch {epoch}  held-out {held_out_score(checker, model):.3f}  "
              f"subtitles {subtitles}", flush=True)

        # The last epoch is not the best one. The three-epoch run went 66.4, 67.1, 65.8
        # on subtitles while the held-out score kept climbing — the model learning the
        # 3,322 examples rather than the task. So the epoch is chosen on the subtitle
        # score, and the held-out score cannot do it: it would pick the worst of the
        # three.
        #
        # That is a choice made on the working set, which flatters the working set by
        # however much the epochs differ. It is why 51 lines were sealed in phase 10 and
        # are opened once, in phase 17.
        if subtitles[1] > best[0]:
            best = (subtitles[1], epoch)
            model.save(args.out)

    print(f"\nsaved epoch {best[1]} to {args.out}/, "
          f"the best of {args.epochs} at {best[0]}%", flush=True)


if __name__ == "__main__":
    main()
