"""Ask TypeSafe's Jev which sense each line uses, and score it like the other models.

Jev answers a question over a fixed set of options with a probability for each and a
confidence, and writes no text, so a sense choice is the shape it was built for.

    make jev-probe            # one line, printing the raw answer
    make jev SET=working      # every line, cached
    make jev-report SET=working

The senses are named `sense-1`, `sense-2`... in an order shuffled per line, so neither an
option's name nor its position can carry the answer. As the other models were, Jev is
offered `none` for a line no sense fits.

The sealed lines were opened in phase 17, so `SET=sealed` is a footnote, not a result.
"""

import argparse
import json
import pathlib
import random
import statistics
import time

import requests
from common import percent, read_jsonl, write_jsonl
from comparison import labelled_lines, right
from env import require

URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
OUT = pathlib.Path("data/comparison")

# $0.042 per million input tokens; output is free.
PER_INPUT_TOKEN = 0.042 / 1_000_000

INSTRUCTIONS = 'Which of these senses is the word "{word}" used in on this line?'
NONE = "none"


def question(row, order):
    """The senses as Jev's criteria: an option name mapped to what that sense means."""
    criteria = {}
    for shown, i in enumerate(order, start=1):
        sense = row["senses"][i]
        text = f"{', '.join(sense['synonyms'])}: {sense['gloss']}"
        if sense["examples"]:
            text += f" (for example: {'; '.join(sense['examples'])})"
        criteria[f"sense-{shown}"] = text
    criteria[NONE] = "The word is not used in any of the senses above on this line."
    return {"type": "choice",
            "instructions": INSTRUCTIONS.format(word=row["lemma"]),
            "criteria": criteria}


def send(key, row, order):
    """One line's question. The state names the line and the word, and nothing else."""
    return requests.post(
        URL, timeout=60, headers={"Authorization": f"Bearer {key}"},
        json={"model": MODEL,
              "state": {"subtitle_line": row["text"], "clicked_word": row["lemma"]},
              "questions": {"sense": question(row, order)}})


def ask(key, row, seed):
    """Jev's answer for one line: the sense key or "none", with what it said about it."""
    order = list(range(len(row["senses"])))
    random.Random(seed).shuffle(order)

    response = send(key, row, order)
    response.raise_for_status()
    body = response.json()
    answer = body["answers"]["sense"]
    chosen = answer["choice"]
    picked = (NONE if chosen == NONE
              else row["senses"][order[int(chosen.removeprefix("sense-")) - 1]]["key"])
    return {"answer": picked,
            "probability": answer["probabilities"][chosen],
            "confidence": answer["confidence"],
            "tokens": body.get("usage", {}).get("input_tokens", 0)}


def probe(key):
    """One line, with the whole response, so the shape can be read before a run."""
    row = labelled_lines("working")[0]
    print(f'"{row["lemma"]}" in: {row["text"]}\n')
    started = time.perf_counter()
    response = send(key, row, list(range(len(row["senses"]))))
    print(f"HTTP {response.status_code} in {time.perf_counter() - started:.2f} s\n")
    print(json.dumps(response.json(), indent=2)[:4000])


def run(key, name, seed):
    """Every line of a set, cached, so a rerun costs nothing."""
    path = OUT / f"{name}-jev.jsonl"
    done = read_jsonl(path) if path.exists() else []
    have = {a["id"] for a in done}
    for row in labelled_lines(name):
        if row["id"] in have:
            continue
        started = time.perf_counter()
        answer = ask(key, row, f"jev:{seed}:{row['id']}")
        done.append({"id": row["id"], **answer, "seconds": time.perf_counter() - started})
        write_jsonl(path, done)
    print(f"{len(done)} answers -> {path}")
    return done


def reliability(answers, labels, field):
    """What Jev's own numbers are worth: in each band, how often it is right."""
    print(f"\n{field:>12}{'lines':>7}{'said':>8}{'right':>8}")
    for low, high in ((0.0, 0.5), (0.5, 0.7), (0.7, 0.9), (0.9, 1.01)):
        part = [a for a in answers if low <= a[field] < high]
        if part:
            said = 100 * statistics.mean(a[field] for a in part)
            hits = sum(right(a["answer"], labels[a["id"]]) for a in part)
            print(f"{low:>7.0%}-{high:>4.0%}{len(part):>7}{said:>7.1f}%"
                  f"{percent(hits, len(part)):>7.1f}%")


def report(name):
    answers = read_jsonl(OUT / f"{name}-jev.jsonl")
    labels = {r["id"]: r["label"] for r in labelled_lines(name)}
    ours = {o["id"]: o for o in read_jsonl(OUT / f"{name}-extension.jsonl")}
    n = len(answers)
    print(f"\n{n} {name} lines\n")

    mine = sum(right(ours[a["id"]]["ranked"][0], labels[a["id"]]) for a in answers)
    hits = sum(right(a["answer"], labels[a["id"]]) for a in answers)
    print(f"ours   {percent(mine, n):5.1f}%")
    print(f"Jev    {percent(hits, n):5.1f}%")

    sure = [a for a in answers if ours[a["id"]]["confident"]]
    mixed = (ours[a["id"]]["ranked"][0] if ours[a["id"]]["confident"] else a["answer"]
             for a in answers)
    hybrid = sum(right(pick, labels[a["id"]])
                 for pick, a in zip(mixed, answers, strict=True))
    print(f"ours when sure, else Jev  {percent(hybrid, n):5.1f}% "
          f"(Jev asked on {n - len(sure)} of {n})")

    said_none = sum(a["answer"] == NONE for a in answers)
    truly_none = sum(not labels[a["id"]] for a in answers)
    print(f'\n"none": said on {said_none}, true on {truly_none}')
    print(f"seconds {statistics.median(a['seconds'] for a in answers):.2f} median, "
          f"cost ${sum(a['tokens'] for a in answers) * PER_INPUT_TOKEN:.4f} for {n} lines")

    reliability(answers, labels, "confidence")
    reliability(answers, labels, "probability")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["probe", "run", "report"])
    parser.add_argument("--set", default="working", choices=["working", "sealed"])
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    if args.step == "report":
        report(args.set)
        return
    key = require("TYPESAFE_KEY")
    if args.step == "probe":
        probe(key)
    else:
        run(key, args.set, args.seed)


if __name__ == "__main__":
    main()
