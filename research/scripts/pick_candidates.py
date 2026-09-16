"""Pick subtitle lines to label, one ambiguous word each, balanced across frequency bands."""

import argparse
import json
import random

import nltk
from common import PENN_TO_WORDNET, read_jsonl, sense_dict, write_jsonl
from fetch_corpus import usable
from nltk.corpus import wordnet as wn
from nltk.stem import WordNetLemmatizer

MIN_SENSES = 3
MAX_PER_WORD = 3

# Occurrences in the 200k-line pool. Below the floor are typos and names; above the
# ceiling are words like `do` and `have`, which mostly do grammatical work.
MIN_FREQUENCY = 15
MAX_FREQUENCY = 5000
BANDS = [("everyday", 400, MAX_FREQUENCY), ("common", 100, 400),
         ("uncommon", MIN_FREQUENCY, 100)]

lemmatizer = WordNetLemmatizer()


def band_of(count):
    for name, low, high in BANDS:
        if low <= count < high:
            return name
    return None


def candidates(line, frequency):
    """Every word in the line that is ambiguous enough to be worth a label."""
    found = []
    for word, tag in nltk.pos_tag(nltk.word_tokenize(line)):
        pos = PENN_TO_WORDNET.get(tag)
        if pos is None or len(word) < 3 or not word.isalpha():
            continue
        lemma = lemmatizer.lemmatize(word.lower(), pos)
        count = frequency.get(lemma, 0)
        band = band_of(count)
        if band is None:
            continue
        senses = wn.synsets(lemma, pos)
        if len(senses) < MIN_SENSES:
            continue
        found.append({"word": word, "lemma": lemma, "pos": pos, "frequency": count,
                      "band": band, "senses": senses})
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool", default="data/raw/pool.jsonl")
    parser.add_argument("--frequency", default="data/raw/frequency.json")
    parser.add_argument("--count", type=int, default=201)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--out", default="data/candidates.jsonl")
    parser.add_argument("--per-word", type=int, default=MAX_PER_WORD)
    parser.add_argument("--exclude", nargs="*", default=[],
                        help="files whose lines must not be picked again")
    args = parser.parse_args()

    # Lines already used elsewhere (the test set) must not be picked again.
    taken = {row["text"] for path in args.exclude for row in read_jsonl(path)}
    pool = [row["text"] for row in read_jsonl(args.pool)]
    pool = [text for text in pool if text not in taken]
    if taken:
        print(f"{len(taken)} lines held out, {len(pool):,} left in the pool")
    frequency = json.load(open(args.frequency, encoding="utf-8"))
    random.Random(args.seed).shuffle(pool)

    quota = {name: args.count // len(BANDS) for name, _, _ in BANDS}
    picked, used = [], {}

    for text in pool:
        if not usable(text) or not any(quota.values()):
            continue
        # Fill the emptiest band first, so no band runs dry on rare lines.
        wanted = sorted(candidates(text, frequency),
                        key=lambda c: -quota[c["band"]])
        for choice in wanted:
            if quota[choice["band"]] == 0:
                continue
            if used.get(choice["lemma"], 0) >= args.per_word:
                continue
            quota[choice["band"]] -= 1
            used[choice["lemma"]] = used.get(choice["lemma"], 0) + 1
            picked.append({"id": len(picked) + 1, "text": text, "word": choice["word"],
                           "lemma": choice["lemma"], "pos": choice["pos"],
                           "frequency": choice["frequency"], "band": choice["band"],
                           "senses": [sense_dict(s) for s in choice["senses"]], "label": None})
            break
        if not any(quota.values()):
            break

    write_jsonl(args.out, picked)

    print(f"picked   {len(picked)} lines -> {args.out}")
    print(f"words    {len(used)} distinct")
    for name, _, _ in BANDS:
        rows = [r for r in picked if r["band"] == name]
        average = sum(len(r["senses"]) for r in rows) / len(rows)
        print(f"  {name:<9} {len(rows):>3} lines, {average:>4.1f} senses on average")


if __name__ == "__main__":
    main()
