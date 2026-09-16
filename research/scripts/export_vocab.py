"""Hand `vocab.db` to the extension as JSON, and the answers its lookup has to match.

A browser cannot open SQLite without shipping a build of it. As JSON the vocabulary is
19 MB against 27, holds about 120 MB of memory against 150, and needs no library.

Two files are written:

- `extension/public/vocab.json`: every sense once, as `[key, gloss, examples, synonyms]`;
  every entry as lemma, then part of speech, then indexes into the senses, commonest
  first; and WordNet's irregular forms as surface, then part of speech, then lemmas.
  Entries keep the database's order, which is the order `entry` falls back to when no
  part of speech is given.
- `tests/fixtures/lookups.json`: lines with what `lookup.py` finds in them — the senses
  of the tagged word, and the phrase, if any, at every word — which the TypeScript port
  is tested against. Each carries its part of the split and, where all five panel
  models agreed, the right sense, so the whole chain can be scored the way the research
  scored the model.
"""

import argparse
import json
import sqlite3

from lookup import WORD, Vocab


def export(db, path):
    order = {}
    senses = []
    for row in db.execute("SELECT * FROM sense ORDER BY id"):
        order[row["id"]] = len(senses)
        senses.append([row["key"], row["gloss"], json.loads(row["examples"]),
                       json.loads(row["synonyms"])])

    entries = {}
    for entry in db.execute("SELECT * FROM entry ORDER BY id").fetchall():
        entries.setdefault(entry["lemma"], {})[entry["pos"]] = [
            order[sense_id] for (sense_id,) in db.execute(
                "SELECT sense_id FROM entry_sense WHERE entry_id = ? ORDER BY rank",
                (entry["id"],))]

    forms = {}
    for form in db.execute("SELECT * FROM form ORDER BY rowid"):
        forms.setdefault(form["surface"], {}).setdefault(form["pos"], []).append(form["lemma"])

    with open(path, "w", encoding="utf-8") as out:
        json.dump({"senses": senses, "entries": entries, "forms": forms}, out,
                  separators=(",", ":"), ensure_ascii=False)
    return len(senses), len(entries)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/vocab.db")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    parser.add_argument("--out", default="../extension/public/vocab.json")
    parser.add_argument("--fixture", default="../tests/fixtures/lookups.json")
    args = parser.parse_args()

    vocab = Vocab(args.db)
    vocab.db.row_factory = sqlite3.Row
    senses, lemmas = export(vocab.db, args.out)

    # The lines of the validation and test words, and every line that is a phrase.
    where = {w: part for part, ws in json.load(open(args.split)).items() for w in ws}
    lines = []
    for line in open(args.labels, encoding="utf-8"):
        row = json.loads(line)
        phrase = " " in row["lemma"]
        if where[row["lemma"]] == "train" and not phrase:
            continue
        words = [w.lower() for w in WORD.findall(row["text"])]
        found = [vocab.phrase_at(words, i) for i in range(len(words))]
        case = {"text": row["text"], "part": where[row["lemma"]],
                "phrases": [p["lemma"] if p else None for p in found],
                "label": row.get("key") if row.get("agreed") == 5 else None}
        if phrase:
            # Which word was clicked is not recorded; the first the phrase covers will do.
            first = next(i for i, p in enumerate(found) if p and p["lemma"] == row["lemma"])
            case.update(word=WORD.findall(row["text"])[first], lemma=row["lemma"],
                         senses=row["candidates"])
        else:
            lemma, keys = vocab.senses_of(row["word"], row["pos"])
            case.update(word=row["word"], pos=row["pos"], lemma=lemma, senses=keys)
        lines.append(case)
    with open(args.fixture, "w", encoding="utf-8") as out:
        json.dump(lines, out, indent=0, ensure_ascii=False)

    print(f"{args.out}  {senses:,} senses, {lemmas:,} lemmas")
    print(f"{args.fixture}  {len(lines):,} lines")


if __name__ == "__main__":
    main()
