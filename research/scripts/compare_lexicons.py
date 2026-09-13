"""Measure WordNet and Wiktionary against the same subtitle lines.

Two questions decide which one the extension ships with.

Coverage: of the words someone might click, how many does the source even have an
entry for? Counted twice — once per distinct word, and once weighted by how often the
word occurs, because missing `gonna` costs more than missing `zeugma`.

Granularity: how many senses does it offer for a word? This is the one that matters
most and gets the least attention. Annotators agree with each other around 70% of the
time on WordNet's fine distinctions and around 90% on coarser ones, so a source that
splits `feel` thirteen ways has set a ceiling before any model is trained.
"""

import argparse
import collections
import gzip
import json
import random

import nltk
from nltk.corpus import wordnet as wn
from nltk.stem import WordNetLemmatizer

from fetch_corpus import usable
from pick_candidates import TAGS

# Wiktionary names parts of speech in words; WordNet uses letters.
WIKI_POS = {"noun": wn.NOUN, "verb": wn.VERB, "adj": wn.ADJ, "adv": wn.ADV}

# Senses a person watching a film will never need, and which we would not ship.
# `alt-of` and `alternative` are spelling variants pointing elsewhere, not meanings.
SKIP = {"alt-of", "alternative", "abbreviation", "initialism", "obsolete", "archaic",
        "rare", "historical", "dated"}

lemmatizer = WordNetLemmatizer()


def load_wiktionary(path, filtered):
    """word + part of speech -> how many senses, ignoring pointers to other words."""
    counts = collections.Counter()
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            entry = json.loads(line)
            pos = WIKI_POS.get(entry["pos"])
            if pos is None:
                continue
            real = [s for s in entry["senses"]
                    if not s["form_of"]
                    and not (filtered and SKIP.intersection(s["tags"]))]
            if real:
                counts[(entry["word"].lower(), pos)] += len(real)
    return counts


def targets(lines):
    """Every content word in the sample, lemmatised, with how often it occurs."""
    counts = collections.Counter()
    for line in lines:
        for word, tag in nltk.pos_tag(nltk.word_tokenize(line)):
            pos = TAGS.get(tag)
            if pos is None or len(word) < 3 or not word.isalpha():
                continue
            counts[(lemmatizer.lemmatize(word.lower(), pos), pos)] += 1
    return counts


def report(name, senses, occurrences):
    """senses: word -> sense count for the words this source has."""
    types = len(senses)
    tokens = sum(occurrences[k] for k in senses)
    all_types = len(occurrences)
    all_tokens = sum(occurrences.values())
    ambiguous = [n for n in senses.values() if n > 1]
    average = sum(ambiguous) / len(ambiguous) if ambiguous else 0
    print(f"{name:<22}{100 * types / all_types:>8.1f}%{100 * tokens / all_tokens:>8.1f}%"
          f"{average:>11.1f}{sum(1 for n in senses.values() if n >= 10):>11}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool", default="data/raw/pool.jsonl")
    parser.add_argument("--wiktionary", default="data/raw/wiktionary.jsonl.gz")
    parser.add_argument("--lines", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    pool = [json.loads(l)["text"] for l in open(args.pool, encoding="utf-8")]
    pool = [t for t in pool if usable(t)]
    random.Random(args.seed).shuffle(pool)
    occurrences = targets(pool[: args.lines])
    print(f"{len(occurrences):,} distinct words over {args.lines:,} lines\n")

    wordnet_senses = {}
    for key in occurrences:
        found = wn.synsets(key[0], key[1])
        if found:
            wordnet_senses[key] = len(found)

    print(f"{'':<22}{'by word':>9}{'by use':>9}{'senses':>11}{'10 or more':>11}")
    report("WordNet", wordnet_senses, occurrences)

    for filtered in (False, True):
        table = load_wiktionary(args.wiktionary, filtered)
        wiki_senses = {k: table[k] for k in occurrences if k in table}
        name = "Wiktionary, trimmed" if filtered else "Wiktionary"
        report(name, wiki_senses, occurrences)

    shared = set(wordnet_senses) & set(wiki_senses)
    finer = sum(1 for k in shared if wordnet_senses[k] > wiki_senses[k])
    print(f"\nof {len(shared):,} words both sources carry, WordNet splits "
          f"{100 * finer / len(shared):.0f}% of them more finely")

    only_wiki = sorted(set(wiki_senses) - set(wordnet_senses),
                       key=lambda k: -occurrences[k])[:15]
    print("commonest words only Wiktionary has:",
          ", ".join(k[0] for k in only_wiki))


if __name__ == "__main__":
    main()
