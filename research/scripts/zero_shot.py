"""Rank each line's senses by embedding similarity, and score the ranking.

Also holds `rank` and `hits`, which the other scoring scripts use.
"""

import argparse
import collections

from common import BANDS, BOLD, DIM, OFF, read_jsonl
from sentence_transformers import SentenceTransformer, util


def sense_text(sense, style):
    """The text the model encodes for a sense."""
    if style == "gloss":
        return sense["gloss"]
    if style == "synonyms":
        return ", ".join(sense["synonyms"]) + ": " + sense["gloss"]
    if style == "examples":
        return " ".join([sense["gloss"], *sense["examples"]])
    return ", ".join(sense["synonyms"]) + ": " + " ".join(
        [sense["gloss"], *sense["examples"]])


def line_text(row, focus):
    """The text the model encodes for a line. `prefixed` names the word, which helps most."""
    if focus == "plain":
        return row["text"]
    if focus == "named":
        return f'{row["text"]} The word "{row["word"]}" here means'
    return f'{row["lemma"]}: {row["text"]}'


def rank(model, rows, style, focus):
    """For each line, its sense keys ordered by similarity, best first."""
    lines = model.encode([line_text(r, focus) for r in rows], convert_to_tensor=True,
                         normalize_embeddings=True)
    ordered = []
    for row, line in zip(rows, lines, strict=True):
        texts = [sense_text(s, style) for s in row["senses"]]
        senses = model.encode(texts, convert_to_tensor=True,
                              normalize_embeddings=True)
        scores = util.cos_sim(line, senses)[0]
        order = scores.argsort(descending=True).tolist()
        ordered.append([row["senses"][i]["key"] for i in order])
    return ordered


def hits(rows, ordered, depth):
    return sum(1 for row, keys in zip(rows, ordered, strict=True)
               if set(keys[:depth]) & set(row["label"]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/working.jsonl")
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--style", default="synonyms",
                        choices=["gloss", "synonyms", "examples", "all"])
    parser.add_argument("--focus", default="plain",
                        choices=["plain", "named", "prefixed"])
    parser.add_argument("--baseline", type=float, default=55.0)
    args = parser.parse_args()

    rows = read_jsonl(args.file)
    model = SentenceTransformer(args.model)
    ordered = rank(model, rows, args.style, args.focus)

    by_band = collections.defaultdict(list)
    for row, keys in zip(rows, ordered, strict=True):
        by_band[row["band"]].append((row, keys))

    print(f"\n{args.model}  ·  sense as {args.style}  ·  line {args.focus}\n")
    print(f"{'':<12}{'lines':>7}{'first':>9}{'first 3':>9}{'first 5':>9}")
    for band in BANDS:
        part = by_band[band]
        if not part:
            continue
        rs, ks = zip(*part, strict=True)
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
