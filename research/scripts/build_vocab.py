"""Build `vocab.db` from WordNet: senses, the entries that point at them, and irregular forms.

Senses are stored once and shared by every lemma that lists them. Each entry keeps
WordNet's per-lemma order, commonest sense first, which the first-sense baseline relies on.
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
             json.dumps([lemma.name().replace("_", " ") for lemma in synset.lemmas()])))
        ids[synset.name()] = cursor.lastrowid
    return ids


def write_entries(connection, ids):
    names = set()
    for synset in wn.all_synsets():
        for lemma in synset.lemmas():
            names.add((lemma.name(), synset.pos()))

    # Asked per lemma so the senses come back commonest first. `wn.synsets` also
    # resolves inflections (`axes` → `axe`, `axis`), so synsets that do not list the
    # lemma itself are dropped. Case variants (`Confederacy`) share one lowercase entry.
    grouped = {}
    for raw, pos in sorted(names, key=lambda n: (n[0].lower(), n[0], n[1])):
        keys = [s.name() for s in wn.synsets(raw, pos)
                if any(lemma.name() == raw for lemma in s.lemmas())]
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
