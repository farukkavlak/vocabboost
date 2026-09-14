"""Ask several models which sense a line uses, independently.

The student can never be better than its labels, and one model is wrong more often
than it sounds — published evaluations put GPT-4 between 56% and 77% on this task. So
the teacher is a panel: each model answers alone, and where they agree the label is
worth more than any one of them.

Each model sees the senses in its own shuffled order. Models anchor on the first
option the same way people do, and WordNet lists senses commonest first, so an
unshuffled list would quietly hand them the answer we are trying to measure.

Answers are cached by line and model, so a rerun costs nothing and a crash loses
nothing.
"""

import argparse
import concurrent.futures
import json
import pathlib
import random
import re

import fal_client
from env import require

# Five families. Mistral, Cohere, Phi and DeepSeek are missing because they answer with
# prose where a number was asked for — DeepSeek on 57 of 200 lines.
MODELS = ["anthropic/claude-haiku-4.5",
          "google/gemini-2.5-flash",
          "openai/gpt-4o-mini",
          "meta-llama/llama-3.3-70b-instruct",
          "qwen/qwen-2.5-72b-instruct"]

PROMPT = """Which sense of "{word}" is used in this line?

{line}

{options}

Answer with the number alone. If none of them fit, answer 0."""


def ask(model, row, seed):
    order = list(range(len(row["senses"])))
    random.Random(seed).shuffle(order)
    options = "\n".join(
        f'{shown}. {", ".join(row["senses"][i]["synonyms"])}: {row["senses"][i]["gloss"]}'
        for shown, i in enumerate(order, start=1))

    result = fal_client.subscribe("openrouter/router", arguments={
        "model": model,
        "prompt": PROMPT.format(word=row["lemma"], line=row["text"], options=options),
        "max_tokens": 8,
        "temperature": 0,
    })
    found = re.search(r"\d+", str(result.get("output", "")))
    if not found:
        return None
    picked = int(found.group())
    if picked == 0:
        return "none"
    if 1 <= picked <= len(order):
        return row["senses"][order[picked - 1]]["key"]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/candidates.jsonl")
    parser.add_argument("--out", default="data/panel.jsonl")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--models", nargs="+", default=MODELS,
                        help="try a candidate without editing the panel")
    args = parser.parse_args()

    require("FAL_KEY")
    rows = [json.loads(line) for line in open(args.file, encoding="utf-8")]
    rows = [r for r in rows if not r.get("broken")]
    if args.limit:
        rows = rows[: args.limit]

    cache = {}
    path = pathlib.Path(args.out)
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            cache[(entry["id"], entry["model"])] = entry

    todo = [(row, model) for row in rows for model in args.models
            if (row["id"], model) not in cache]
    print(f"{len(rows)} lines, {len(args.models)} models, {len(todo)} calls to make")

    if todo:
        with (path.open("a", encoding="utf-8") as out,
              concurrent.futures.ThreadPoolExecutor(args.workers) as pool):
                futures = {
                    pool.submit(ask, model, row, args.seed + row["id"]): (row, model)
                    for row, model in todo}
                for n, future in enumerate(concurrent.futures.as_completed(futures), 1):
                    row, model = futures[future]
                    try:
                        answer = future.result()
                    except Exception as error:
                        print(f"  {model} on {row['id']}: {str(error)[:60]}")
                        continue
                    out.write(json.dumps({"id": row["id"], "model": model,
                                          "answer": answer}) + "\n")
                    out.flush()
                    if n % 50 == 0:
                        print(f"  {n}/{len(todo)}")

    print(f"answers in {args.out}")


if __name__ == "__main__":
    main()
