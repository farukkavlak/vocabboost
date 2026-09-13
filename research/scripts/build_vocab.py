"""Build vocab.db, the dictionary the extension ships with.

WordNet is the sense inventory, measured in phase 11 as covering 95% of the words
people actually use and splitting meanings less finely than Wiktionary. Wiktionary
fills the words it lacks, which are interjections and function words rather than slang.

A sense belongs to more than one word: `run` and `go` share one. Storing it under each
of them copies the same definition twice, so senses are stored once and the words
point at them. That alone is most of the file size.

A third of WordNet's lemmas are phrases — `club soda`, `check out`, `pull together` —
and they matter more than their share suggests, because a phrase is exactly where
looking a word up alone fails.

Senses keep WordNet's order, which is by how common the sense is for that particular
word — `safe` the strongbox before `safe` the contraceptive. The order differs per
word and is not the order synsets are stored in, so it has to be asked for per lemma.
It is the baseline every later phase is measured against, so getting it wrong would
quietly invalidate every number.
"""

import argparse
import json
import sqlite3

from nltk.corpus import wordnet as wn

SCHEMA = """
CREATE TABLE sense (
  id       INTEGER PRIMARY KEY,
  key      TEXT NOT NULL,
  gloss    TEXT NOT NULL,
  examples TEXT NOT NULL,
  synonyms TEXT NOT NULL
);
CREATE TABLE entry (
  id    INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,
  pos   TEXT NOT NULL,
  words INTEGER NOT NULL
);
CREATE TABLE entry_sense (
  entry_id INTEGER NOT NULL REFERENCES entry(id),
  sense_id INTEGER NOT NULL REFERENCES sense(id),
  rank     INTEGER NOT NULL
);
CREATE TABLE form (
  surface TEXT NOT NULL,
  lemma   TEXT NOT NULL,
  pos     TEXT NOT NULL
);
CREATE UNIQUE INDEX entry_lookup ON entry (lemma, pos);
CREATE INDEX entry_sense_entry ON entry_sense (entry_id);
CREATE INDEX form_lookup ON form (surface);
"""


def write_senses(connection):
    """Every synset once, returning where each one landed."""
    ids = {}
    for synset in wn.all_synsets():
        cursor = connection.execute(
            "INSERT INTO sense (key, gloss, examples, synonyms) VALUES (?, ?, ?, ?)",
            (synset.name(), synset.definition(),
             json.dumps(synset.examples()[:2]),
             json.dumps([l.name().replace("_", " ") for l in synset.lemmas()])))
        ids[synset.name()] = cursor.lastrowid
    return ids


def write_entries(connection, ids):
    names = set()
    for synset in wn.all_synsets():
        for lemma in synset.lemmas():
            names.add((lemma.name(), synset.pos()))

    # Asked for per lemma, so the senses come back commonest first for that word.
    # `synsets` also resolves inflections, and `axes` resolves to both `axe` and
    # `axis`, so anything that does not actually list this lemma is dropped.
    # Lookups are lowercase, and `Confederacy` and `confederacy` are separate lemmas
    # in WordNet. They share one entry here, the common noun's senses first.
    grouped = {}
    for raw, pos in sorted(names, key=lambda n: (n[0].lower(), n[0], n[1])):
        keys = [s.name() for s in wn.synsets(raw, pos)
                if any(l.name() == raw for l in s.lemmas())]
        if not keys:
            continue
        entry = grouped.setdefault((raw.replace("_", " ").lower(), pos), [])
        entry.extend(k for k in keys if k not in entry)

    links = 0
    for (lemma, pos), keys in grouped.items():
        cursor = connection.execute(
            "INSERT INTO entry (lemma, pos, words) VALUES (?, ?, ?)",
            (lemma, pos, lemma.count(" ") + 1))
        for rank, key in enumerate(keys):
            connection.execute("INSERT INTO entry_sense VALUES (?, ?, ?)",
                               (cursor.lastrowid, ids[key], rank))
            links += 1
    return grouped, links


def write_forms(connection):
    """Inflected forms WordNet lists as irregular. The regular ones are suffix rules."""
    seen = set()
    for pos in (wn.NOUN, wn.VERB, wn.ADJ, wn.ADV):
        for surface, lemmas in wn._exception_map[pos].items():
            for lemma in lemmas:
                key = (surface, lemma, pos)
                if key in seen or surface == lemma:
                    continue
                seen.add(key)
                connection.execute("INSERT INTO form VALUES (?, ?, ?)", key)
    return len(seen)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/vocab.db")
    args = parser.parse_args()

    connection = sqlite3.connect(args.out)
    for table in ("entry_sense", "sense", "entry", "form"):
        connection.execute(f"DROP TABLE IF EXISTS {table}")
    connection.executescript(SCHEMA)

    ids = write_senses(connection)
    grouped, links = write_entries(connection, ids)
    forms = write_forms(connection)
    connection.commit()
    connection.execute("VACUUM")
    connection.close()

    phrases = sum(1 for lemma, _ in grouped if " " in lemma)
    print(f"senses   {len(ids):,} stored once")
    print(f"entries  {len(grouped):,}  ({phrases:,} of them phrases)")
    print(f"links    {links:,}")
    print(f"forms    {forms:,}")


if __name__ == "__main__":
    main()
