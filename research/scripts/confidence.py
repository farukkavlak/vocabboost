"""Choose the confidence threshold on the validation words and report it on the test words.

Confidence is the gap between the first and second sense's scores. The threshold is the
lowest gap at which the answers above it are right at least `BAR` of the time.
"""

import argparse

from common import unanimous
from sentence_transformers import SentenceTransformer, util
from zero_shot import line_text, sense_text

# A leading sense must be right this often: the labeller's agreement with themselves.
BAR = 0.85

# The threshold this script chose; the other scripts check against it.
CONFIDENT_GAP = 0.081


def score_lines(model, rows):
    """Per line: the confidence gap, the first choice, and whether each is right.

    `scores` are the senses' scores best first; `hits` says which of them are right.
    """
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
        out.append({"gap": gap, "first": keys[0], "right": keys[0] in row["label"],
                    "top3": bool(set(keys[:3]) & set(row["label"])),
                    "senses": len(keys), "none": not row["label"],
                    "scores": scores.values.tolist(),
                    "hits": [key in row["label"] for key in keys]})
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
        lines = score_lines(model, unanimous(args.labels, args.split, part, keep_none=True))
        parts[part] = ([r for r in lines if not r["none"]], [r for r in lines if r["none"]])

    valid, nothing = parts["validation"]
    print(f"\nvalidation words, {len(valid)} lines\n")
    curve(valid)
    at = threshold(valid)
    report("validation words", valid, nothing, at)
    report("test words", *parts["test"], at)


if __name__ == "__main__":
    main()
