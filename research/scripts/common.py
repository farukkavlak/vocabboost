"""Helpers shared by the research scripts."""

import collections
import json

BANDS = ["everyday", "common", "uncommon"]

# Terminal styles for the reports.
BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"

# Penn Treebank tags → WordNet parts of speech. Proper nouns are left out on purpose.
PENN_TO_WORDNET = {
    "NN": "n", "NNS": "n",
    "VB": "v", "VBD": "v", "VBG": "v", "VBN": "v", "VBP": "v", "VBZ": "v",
    "JJ": "a", "JJR": "a", "JJS": "a",
    "RB": "r", "RBR": "r", "RBS": "r",
}


def read_jsonl(path):
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


def percent(part, whole):
    return 100 * part / whole if whole else 0.0


def panel_answers(path):
    """Line id → model → answer, from a panel answers file."""
    answers = collections.defaultdict(dict)
    for entry in read_jsonl(path):
        answers[entry["id"]][entry["model"]] = entry["answer"]
    return answers


def load_split(path):
    """Word → "train", "validation" or "test"."""
    with open(path, encoding="utf-8") as handle:
        split = json.load(handle)
    return {word: part for part, words in split.items() for word in words}


def sense_dict(synset):
    """A WordNet synset in the shape the labelled lines store senses in."""
    return {"key": synset.name(),
            "gloss": synset.definition(),
            "examples": synset.examples()[:2],
            "synonyms": [name.replace("_", " ") for name in synset.lemma_names()]}


def candidate_synsets(lemma, pos):
    """The senses of a lemma, commonest first, leaving out those that only share a stem."""
    from nltk.corpus import wordnet as wn

    return [s for s in wn.synsets(lemma, pos)
            if any(name == lemma for name in s.lemma_names())]


def unanimous(labels, split, part, keep_none=False):
    """The panel lines of one part's words that all five models agreed on.

    Shaped like the hand-labelled lines: `senses` as dicts and `label` as a list, empty
    where the panel said no sense fits (kept only with `keep_none`).
    """
    from nltk.corpus import wordnet as wn

    where = load_split(split)
    rows = []
    for row in read_jsonl(labels):
        if where[row["lemma"]] != part or row.get("agreed") != 5:
            continue
        if "key" not in row and not keep_none:
            continue
        rows.append({"lemma": row["lemma"], "text": row["text"],
                     "senses": [sense_dict(wn.synset(k)) for k in row["candidates"]],
                     "label": [row["key"]] if "key" in row else []})
    return rows


def describe_examples(rows):
    """Print a summary of training examples."""
    senses = sum(len(r["candidates"]) for r in rows) / len(rows)
    first = sum(1 for r in rows if r["candidates"][0] == r["key"])
    print(f"examples  {len(rows):,}")
    print(f"words     {len({r['lemma'] for r in rows}):,} distinct")
    print(f"senses    {senses:.1f} on average")
    print(f"first     {percent(first, len(rows)):.1f}% of them are the commonest sense")
