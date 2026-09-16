"""Train the encoder on prepared examples and score it on the hand-labelled lines.

    python run.py --data semcor.jsonl --out model-semcor
    python run.py --data teacher-labels.jsonl --from model-semcor --out model-tuned \
      --split label-split.json

`--from` continues from a trained model. `--split` reads the word split written by
`scripts/split_labels.py`; without it the words are split here by `--seed`. The best
epoch is chosen on the validation words when there is a split, and `--seed` fixes both
the data and the training order.
"""

import argparse
import collections
import json
import random

import nltk

# WordNet must be downloaded before `nltk.corpus` is imported.
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

MODEL = "sentence-transformers/all-MiniLM-L6-v2"   # 22M parameters, small enough for a browser


def load(paths, agreed=0):
    """Read the prepared examples.

    Panel rows are kept when at least `agreed` of five models gave the label; rows with no
    fitting sense are dropped. SemCor rows have no `agreed` and are always kept.
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
    """Synonyms, definition and two examples: the form that scored best untrained."""
    s = wn.synset(key)
    return " ".join([", ".join(lemma.name().replace("_", " ") for lemma in s.lemmas()) + ":",
                     s.definition(), *s.examples()[:2]])


def line_text(row):
    return f'{row["lemma"]}: {row["text"]}'


def pairs(rows, rng):
    """(line, right sense, another sense of the same word) triplets.

    The negative is a sibling sense, since telling a word's senses apart is the task.
    """
    made = []
    for row in rows:
        wrong = [k for k in row["candidates"] if k != row["key"]]
        if wrong:
            made.append(InputExample(texts=[line_text(row), sense_text(row["key"]),
                                            sense_text(rng.choice(wrong))]))
    return made


def as_test(row):
    """A training row in the shape `score` reads."""
    return {"lemma": row["lemma"], "text": row["text"],
            "senses": [{"key": key} for key in row["candidates"]], "label": [row["key"]]}


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
    """The accuracy from TripletEvaluator's result."""
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
    parser.add_argument("--split", default=None,
                        help="a word split from scripts/split_labels.py")
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

    # `random` fixes the data; torch fixes batch order and dropout.
    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    print()
    rows = load(args.data, args.agreed)
    rng.shuffle(rows)
    print()

    # Split by word, so no word is on both sides.
    if args.split:
        split = json.load(open(args.split, encoding="utf-8"))
        where = {word: part for part, words in split.items() for word in words}
        missing = {r["lemma"] for r in rows} - set(where)
        if missing:
            raise SystemExit(f"{len(missing)} words are not in {args.split}")
        train = [r for r in rows if where[r["lemma"]] == "train"]
        valid = [r for r in rows if where[r["lemma"]] == "validation"]
        panel = [as_test(r) for r in rows if where[r["lemma"]] == "test"]
    else:
        words = sorted({r["lemma"] for r in rows})
        rng.shuffle(words)
        held = set(words[: len(words) // 10])
        train = [r for r in rows if r["lemma"] not in held]
        valid = [r for r in rows if r["lemma"] in held][:2_000]
        panel = []
    if args.examples:
        train = train[: args.examples]
    print(f"train {len(train):,} examples, {len({r['lemma'] for r in train}):,} words")
    print(f"valid {len(valid):,} examples, {len({r['lemma'] for r in valid}):,} words")
    if panel:
        print(f"panel {len(panel):,} examples, held back until the last epoch")
    print()

    test = [json.loads(line) for line in open(args.test, encoding="utf-8")]
    base = sum(1 for r in test if r["senses"][0]["key"] in r["label"])
    print(f"{len(test)} hand-labelled subtitle lines, never seen in training")
    print(f"first sense in the dictionary   {100 * base / len(test):.1f}%\n")

    print(f"starting from {args.start}\n")
    model = SentenceTransformer(args.start)
    checker = evaluation.TripletEvaluator.from_input_examples(pairs(valid, rng),
                                                             name="held-out words")
    chooser = [as_test(r) for r in valid] if args.split else []
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
              f"subtitles {subtitles}", end="", flush=True)

        # The best epoch is chosen on the validation words when there are any. The
        # triplet score keeps rising while the model overfits, so it cannot choose.
        if chooser:
            picked = score(model, chooser)
            print(f"  validation {picked}", end="")
        else:
            picked = subtitles
        print(flush=True)
        if picked[1] > best[0]:
            best = (picked[1], epoch)
            model.save(args.out)

    where = "validation words" if chooser else "the subtitle lines"
    print(f"\nsaved epoch {best[1]} to {args.out}/, "
          f"the best of {args.epochs} at {best[0]}% on {where}", flush=True)

    # Scored once, on the saved model; never used to choose anything.
    if panel:
        print(f"panel test    {score(SentenceTransformer(args.out), panel)}", flush=True)


if __name__ == "__main__":
    main()
