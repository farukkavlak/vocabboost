"""Ask a panel of five models, independently, which sense each line uses.

Each model sees the senses in its own shuffled order. Answers are cached per line and
model, so reruns are free.
"""

import argparse
import concurrent.futures
import json
import pathlib
import random
import re

import fal_client
from common import read_jsonl
from env import require

# Five model families. Others tried (Mistral, Cohere, Phi, DeepSeek) often answered
# with prose instead of a number.
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
    """The sense key the model picks, "none", or None for an answer that is not a number."""
    return ask_with_usage(model, row, seed)[0]


def ask_with_usage(model, row, seed):
    """`ask`, plus the provider's usage report (tokens and cost)."""
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
    usage = result.get("usage") or {}
    found = re.search(r"\d+", str(result.get("output", "")))
    picked = int(found.group()) if found else -1
    if picked == 0:
        return "none", usage
    if 1 <= picked <= len(order):
        return row["senses"][order[picked - 1]]["key"], usage
    return None, usage


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
    rows = [r for r in read_jsonl(args.file) if not r.get("broken")]
    if args.limit:
        rows = rows[: args.limit]

    path = pathlib.Path(args.out)
    cache = {(e["id"], e["model"]) for e in read_jsonl(path)} if path.exists() else set()

    todo = [(row, model) for row in rows for model in args.models
            if (row["id"], model) not in cache]
    print(f"{len(rows)} lines, {len(args.models)} models, {len(todo)} calls to make")

    if todo:
        with (path.open("a", encoding="utf-8") as out,
              concurrent.futures.ThreadPoolExecutor(args.workers) as pool):
            futures = {
                pool.submit(ask, model, row, f'{args.seed}:{model}:{row["id"]}'):
                    (row, model)
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
