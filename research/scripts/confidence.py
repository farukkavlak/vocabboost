"""When the card leads with one sense, and when it says the line does not settle it.

The model always has a nearest sense, even when nothing fits. Its confidence is read as the
gap between its first and second choice, not the first score alone: a line can sit close
to every sense at once, and a high score then says nothing about which one it means.

The bar is set before looking: a sense the card leads with must be right at least 85% of
the time, which is how often the labeller agreed with themselves days later. Asking more
claims a certainty the labels do not have; asking less shows a wrong meaning as the
answer. The threshold is the lowest gap that clears it on the validation words, and the
test words are read once, with that threshold, to report it.
"""

import argparse
import json

from nltk.corpus import wordnet as wn
from sentence_transformers import SentenceTransformer, util
from zero_shot import line_text, sense_text

BAR = 0.85


def unanimous(labels, split, part):
    """Lines of one part's words where all five models agreed, on a sense or on none."""
    where = {w: p for p, words in json.load(open(split)).items() for w in words}
    rows = []
    for line in open(labels, encoding="utf-8"):
        r = json.loads(line)
        if where[r["lemma"]] != part or r.get("agreed") != 5:
            continue
        senses = []
        for key in r["candidates"]:
            s = wn.synset(key)
            senses.append({"key": key, "gloss": s.definition(), "examples": s.examples()[:2],
                           "synonyms": [n.replace("_", " ") for n in s.lemma_names()]})
        rows.append({"lemma": r["lemma"], "text": r["text"], "senses": senses,
                     "label": [r["key"]] if "key" in r else []})
    return rows


def read(model, rows):
    """Each line as (gap, first choice right, a right sense in the top three, senses)."""
    lines = model.encode([line_text(r, "prefixed") for r in rows], convert_to_tensor=True,
                         normalize_embeddings=True, show_progress_bar=False)
    out = []
    for row, line in zip(rows, lines, strict=True):
        senses = model.encode([sense_text(s, "all") for s in row["senses"]],
                              convert_to_tensor=True, normalize_embeddings=True,
                              show_progress_bar=False)
        scores = util.cos_sim(line, senses)[0].sort(descending=True)
        keys = [row["senses"][i]["key"] for i in scores.indices.tolist()]
        gap = float(scores.values[0] - scores.values[1]) if len(keys) > 1 else 1.0
        out.append({"gap": gap, "right": keys[0] in row["label"],
                    "top3": bool(set(keys[:3]) & set(row["label"])),
                    "senses": len(keys), "none": not row["label"]})
    return out


def pct(part, key):
    return f"{100 * sum(r[key] for r in part) / len(part):>6.1f}%" if part else "      -"


def curve(lines):
    print(f"{'answers':>9}{'gap':>8}{'right':>8}{'  below, in top 3':>18}")
    ordered = sorted(lines, key=lambda r: -r["gap"])
    for share in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3):
        k = round(share * len(ordered))
        print(f"{share:>8.0%}{ordered[k - 1]['gap']:>8.3f}"
              f"{pct(ordered[:k], 'right')}{pct(ordered[k:], 'top3'):>18}")


def threshold(lines):
    """The lowest gap whose answers, and every answer above it, clear the bar."""
    ordered = sorted(lines, key=lambda r: -r["gap"])
    best, right = None, 0
    for k, r in enumerate(ordered, 1):
        right += r["right"]
        if right / k >= BAR:
            best = r["gap"]
    return best


def report(name, lines, nothing, at):
    above = [r for r in lines if r["gap"] >= at]
    below = [r for r in lines if r["gap"] < at]
    print(f"\n{name}, threshold {at:.3f}\n")
    print(f"answers {len(above)} of {len(lines)} ({100 * len(above) / len(lines):.1f}%), "
          f"right {pct(above, 'right').strip()}")
    print(f"the rest: a right sense in the top three {pct(below, 'top3').strip()}")
    led = sum(r["gap"] >= at for r in nothing)
    print(f"no sense fits: leads with one anyway on {led} of {len(nothing)}")
    print(f"\n{'senses':<10}{'lines':>7}{'answers':>9}{'right':>8}")
    for label, low, high in [("2", 2, 2), ("3 to 5", 3, 5), ("6 or more", 6, 999)]:
        part = [r for r in lines if low <= r["senses"] <= high]
        up = [r for r in part if r["gap"] >= at]
        print(f"{label:<10}{len(part):>7}{100 * len(up) / max(len(part), 1):>8.1f}%"
              f"{pct(up, 'right')}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    model = SentenceTransformer(args.model)
    parts = {}
    for part in ("validation", "test"):
        lines = read(model, unanimous(args.labels, args.split, part))
        parts[part] = ([r for r in lines if not r["none"]], [r for r in lines if r["none"]])

    valid, nothing = parts["validation"]
    print(f"\nvalidation words, {len(valid)} lines\n")
    curve(valid)
    at = threshold(valid)
    report("validation words", valid, nothing, at)
    report("test words", *parts["test"], at)


if __name__ == "__main__":
    main()
