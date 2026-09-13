"""Pick the sense whose gloss sits nearest the subtitle line, with no training at all.

An embedding model turns a piece of text into a list of numbers, arranged so that text
with close meanings lands close together. Nothing here is trained on sense picking:
the model has never seen this task. It only knows how English sentences relate, and we
ask whether that alone beats showing the first sense in the dictionary.

Closeness is cosine similarity, which measures the angle between two of those lists
and ignores their length. Two texts about the same thing point the same way.

The score is reported for the top answer and for the top three and five, because the
card shows more than one sense and a right answer in second place still reaches the
reader.
"""

import argparse
import collections
import json

from sentence_transformers import SentenceTransformer, util

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"
BANDS = ["everyday", "common", "uncommon"]


def sense_text(sense, style):
    """What we hand the model to stand for a sense."""
    if style == "gloss":
        return sense["gloss"]
    if style == "synonyms":
        return ", ".join(sense["synonyms"]) + ": " + sense["gloss"]
    if style == "examples":
        return " ".join([sense["gloss"], *sense["examples"]])
    return ", ".join(sense["synonyms"]) + ": " + " ".join(
        [sense["gloss"], *sense["examples"]])


def line_text(row, focus):
    """The line as the model sees it.

    Pooling a whole sentence into one vector buries the word we are asking about:
    in "Wall safes went out with vaudeville" most of the signal is vaudeville.
    Naming the target word gives the vector something to lean on.
    """
    if focus == "plain":
        return row["text"]
    if focus == "named":
        return f'{row["text"]} The word "{row["word"]}" here means'
    return f'{row["word"]}: {row["text"]}'


def rank(model, rows, style, focus):
    """For each line, the sense keys ordered from nearest to furthest."""
    lines = model.encode([line_text(r, focus) for r in rows], convert_to_tensor=True,
                         normalize_embeddings=True)
    ordered = []
    for row, line in zip(rows, lines):
        texts = [sense_text(s, style) for s in row["senses"]]
        senses = model.encode(texts, convert_to_tensor=True,
                              normalize_embeddings=True)
        scores = util.cos_sim(line, senses)[0]
        order = scores.argsort(descending=True).tolist()
        ordered.append([row["senses"][i]["key"] for i in order])
    return ordered


def hits(rows, ordered, depth):
    return sum(1 for row, keys in zip(rows, ordered)
               if set(keys[:depth]) & set(row["label"]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--style", default="synonyms",
                        choices=["gloss", "synonyms", "examples", "all"])
    parser.add_argument("--focus", default="plain",
                        choices=["plain", "named", "prefixed"])
    parser.add_argument("--baseline", type=float, default=45.6)
    args = parser.parse_args()

    rows = [json.loads(l) for l in open(args.file, encoding="utf-8")]
    model = SentenceTransformer(args.model)
    ordered = rank(model, rows, args.style, args.focus)

    by_band = collections.defaultdict(list)
    for row, keys in zip(rows, ordered):
        by_band[row["band"]].append((row, keys))

    print(f"\n{args.model}  ·  sense as {args.style}  ·  line {args.focus}\n")
    print(f"{'':<12}{'lines':>7}{'first':>9}{'first 3':>9}{'first 5':>9}")
    for band in BANDS:
        part = by_band[band]
        if not part:
            continue
        rs, ks = zip(*part)
        print(f"{band:<12}{len(rs):>7}" + "".join(
            f"{100 * hits(rs, ks, d) / len(rs):>8.1f}%" for d in (1, 3, 5)))

    print(f"{DIM}{'-' * 46}{OFF}")
    print(f"{BOLD}{'overall':<12}{len(rows):>7}" + "".join(
        f"{100 * hits(rows, ordered, d) / len(rows):>8.1f}%" for d in (1, 3, 5)) + OFF)

    top1 = 100 * hits(rows, ordered, 1) / len(rows)
    gap = top1 - args.baseline
    verdict = "beats" if gap > 0 else "does not beat"
    print(f"\n{verdict} the first-sense baseline of {args.baseline}% "
          f"by {gap:+.1f} points")


if __name__ == "__main__":
    main()
