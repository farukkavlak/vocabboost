"""Compare every way of choosing a sense, on the same hand-labelled lines.

Built and checked on the working set. The sealed set is read only with OPEN_SEALED=1, and
is meant to be opened once.

    make comparison-lines SET=working   # the lines, with the clicked word's position
    npm run test:comparison             # the extension answers them in Chrome
    make comparison SET=working         # ask Claude and OpenAI, print the table
"""

import argparse
import math
import os
import pathlib
import statistics
import time

from common import PENN_TO_WORDNET, percent, read_jsonl, write_jsonl
from export_tagger import tokenize
from lookup import WORD, Vocab
from nltk.tag.perceptron import PerceptronTagger

PROVIDERS = {"Claude Haiku 4.5": "anthropic/claude-haiku-4.5",
             "GPT-4o mini": "openai/gpt-4o-mini"}
UNTRAINED = "sentence-transformers/all-MiniLM-L6-v2"
OUT = pathlib.Path("data/comparison")


def labelled_lines(name):
    if name == "sealed" and os.environ.get("OPEN_SEALED") != "1":
        raise SystemExit("the sealed set is opened once, with OPEN_SEALED=1")
    return read_jsonl(f"data/{name}.jsonl")


def right(answer, label):
    """An empty label means no sense fits, so only "none" is right there."""
    return answer == "none" if not label else answer in label


def clicked(row, vocab, tagger):
    """The word a reader would click, and which of its occurrences in the line."""
    if row.get("phrase"):
        words = [w.lower() for w in WORD.findall(row["text"])]
        first = next(i for i in range(len(words))
                     if (p := vocab.phrase_at(words, i)) and p["lemma"] == row["lemma"])
        return WORD.findall(row["text"])[first], 0
    same = [tag for token, tag in tagger.tag(tokenize(row["text"]))
            if token.lower() == row["word"].lower()]
    occurrence = next((i for i, tag in enumerate(same)
                       if PENN_TO_WORDNET.get(tag) == row["pos"]), 0)
    return row["word"], occurrence


def write_lines(name):
    vocab, tagger = Vocab("data/vocab.db"), PerceptronTagger()
    lines = []
    for row in labelled_lines(name):
        word, occurrence = clicked(row, vocab, tagger)
        lines.append({"id": row["id"], "word": word, "sentence": row["text"],
                      "occurrence": occurrence})
    write_jsonl(OUT / f"{name}-lines.jsonl", lines)
    print(f"{len(lines)} lines -> {OUT / f'{name}-lines.jsonl'}")


def ask_providers(name, rows):
    """Each provider's answer per line, cached, with seconds and cost."""
    from env import require
    from panel import ask_with_usage

    require("FAL_KEY")

    path = OUT / f"{name}-providers.jsonl"
    done = read_jsonl(path) if path.exists() else []
    have = {(a["id"], a["model"]) for a in done}
    for row in rows:
        for model in PROVIDERS.values():
            if (row["id"], model) in have:
                continue
            start = time.perf_counter()
            answer, usage = ask_with_usage(model, row, f"comparison:{model}:{row['id']}")
            done.append({"id": row["id"], "model": model, "answer": answer,
                         "seconds": time.perf_counter() - start,
                         "cost": usage.get("cost", 0)})
            write_jsonl(path, done)
    return done


def interval(hits, n):
    """95% Wilson interval, in percent."""
    z = 1.96
    p = hits / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    spread = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return 100 * (centre - spread), 100 * (centre + spread)


def row_line(name, hits, n, top3="-", speed="-", cost="-", size="-"):
    low, high = interval(hits, n)
    spread = f"{low:.0f}-{high:.0f}%"
    print(f"| {name:<22} | {percent(hits, n):5.1f}% | {spread:>9} | {top3:>6} "
          f"| {speed:>10} | {cost:>11} | {size:>8} |")


def report(name):
    from sentence_transformers import SentenceTransformer
    from zero_shot import rank

    rows = labelled_lines(name)
    by_id = {r["id"]: r for r in rows}
    n = len(rows)
    print(f"\n{n} {name} lines\n")
    print(f"| {'':<22} | first  | 95% range | top 3  | per lookup |"
          " cost/lookup | download |")
    print(f"| {'-' * 22} | -----: | --------: | -----: | ---------: |"
          " ----------: | -------: |")

    first = sum(right(r["senses"][0]["key"], r["label"]) for r in rows)
    row_line("first sense", first, n, speed="<1 ms", cost="$0", size="19 MB")

    ordered = rank(SentenceTransformer(UNTRAINED), rows, "all", "prefixed")
    hits = sum(right(k[0], r["label"]) for r, k in zip(rows, ordered, strict=True))
    top3 = sum(bool(set(k[:3]) & set(r["label"])) for r, k in zip(rows, ordered, strict=True))
    row_line("untrained encoder", hits, n, f"{percent(top3, n):.0f}%", size="87 MB")

    ours = read_jsonl(OUT / f"{name}-extension.jsonl")
    hits = sum(right(o["ranked"][0] if o["ranked"] else None, by_id[o["id"]]["label"])
               for o in ours)
    top3 = sum(bool(set(o["ranked"][:3]) & set(by_id[o["id"]]["label"])) for o in ours)
    ms = statistics.median(o["ms"] for o in ours[1:])
    row_line("our model, in Chrome", hits, n, f"{percent(top3, n):.0f}%",
             f"{ms:.0f} ms", "$0", "62 MB")

    answers = ask_providers(name, rows)
    for label, model in PROVIDERS.items():
        mine = [a for a in answers if a["model"] == model]
        hits = sum(right(a["answer"], by_id[a["id"]]["label"]) for a in mine)
        seconds = statistics.median(a["seconds"] for a in mine)
        cost = statistics.mean(a["cost"] for a in mine)
        row_line(label, hits, n, speed=f"{seconds:.1f} s", cost=f"${cost:.5f}")

    led = [o for o in ours if o["confident"]]
    led_right = sum(right(o["ranked"][0], by_id[o["id"]]["label"]) for o in led)
    print(f"\nour model leads with one sense on {len(led)} of {n} lines "
          f"and is right on {led_right} of them")
    print(f"cold start in Chrome: {ours[0]['ms']:.0f} ms; provider times include fal.ai")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["lines", "report"])
    parser.add_argument("--set", default="working", choices=["working", "sealed"])
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.step == "lines":
        write_lines(args.set)
    else:
        report(args.set)


if __name__ == "__main__":
    main()
