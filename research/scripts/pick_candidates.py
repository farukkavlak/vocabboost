"""Choose lines worth labelling, one target word each.

Two things make a word worth labelling. It has to be ambiguous, or there is nothing
to disambiguate: we keep words with three or more senses for the part of speech they
are used in. And it has to be a word someone would plausibly click.

Who clicks depends on their level. A beginner stops at `play` and `run`; someone
further along only stops at `vaudeville`. So the set is split into three frequency
bands of roughly equal size and accuracy is reported for each. One overall number
would hide the fact that the everyday words are the hardest ones, because a word
stays common by carrying many meanings.
"""

import argparse
import json
import random

import nltk
from fetch_corpus import usable
from nltk.corpus import wordnet as wn
from nltk.stem import WordNetLemmatizer

# WordNet groups senses by part of speech, so we need the tag to ask the right question.
TAGS = {"NN": wn.NOUN, "NNS": wn.NOUN, "VB": wn.VERB, "VBD": wn.VERB, "VBG": wn.VERB,
        "VBN": wn.VERB, "VBP": wn.VERB, "VBZ": wn.VERB, "JJ": wn.ADJ, "JJR": wn.ADJ,
        "JJS": wn.ADJ, "RB": wn.ADV, "RBR": wn.ADV, "RBS": wn.ADV}

MIN_SENSES = 3
MAX_PER_WORD = 3

# Occurrences in the 200k line pool, which holds about two million words. Below the
# floor a word is usually a typo or a name that slipped past the tagger. Above the
# ceiling it is `do`, `get`, `have` — tagged as verbs, but doing grammatical work
# rather than carrying a meaning anyone would look up.
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
        pos = TAGS.get(tag)
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


def sense_list(senses):
    # The synonyms are the fastest way to recognise a sense. "strongbox" says more
    # in one word than the gloss does in a line.
    return [{"key": s.name(),
             "synonyms": [lemma.name().replace("_", " ") for lemma in s.lemmas()],
             "gloss": s.definition(),
             "examples": s.examples()[:2]}
            for s in senses]


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

    # The test set was drawn from this same pool. A line in both would be a model
    # trained on its own exam, and the whole comparison would mean nothing.
    taken = {json.loads(line)["text"]
             for path in args.exclude
             for line in open(path, encoding="utf-8")}
    pool = [json.loads(line)["text"] for line in open(args.pool, encoding="utf-8")]
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
                           "senses": sense_list(choice["senses"]), "label": None})
            break
        if not any(quota.values()):
            break

    with open(args.out, "w", encoding="utf-8") as handle:
        for row in picked:
            handle.write(json.dumps(row) + "\n")

    print(f"picked   {len(picked)} lines -> {args.out}")
    print(f"words    {len(used)} distinct")
    for name, _, _ in BANDS:
        rows = [r for r in picked if r["band"] == name]
        average = sum(len(r["senses"]) for r in rows) / len(rows)
        print(f"  {name:<9} {len(rows):>3} lines, {average:>4.1f} senses on average")


if __name__ == "__main__":
    main()
