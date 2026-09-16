"""Trim the kaikki.org English Wiktionary dump to the fields the research uses.

Reads a local copy by default (`--source url` streams it instead); a download on disk can
resume, and the dump is 3.2 GB.
"""

import argparse
import gzip
import json
import urllib.request

URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"


def senses_of(entry):
    kept = []
    for sense in entry.get("senses", []):
        glosses = sense.get("glosses") or []
        if not glosses:
            continue
        kept.append({
            "gloss": glosses[-1],
            "tags": sense.get("tags") or [],
            "examples": [e["text"] for e in (sense.get("examples") or [])[:2]
                         if e.get("text")],
            "form_of": [f["word"] for f in (sense.get("form_of") or []) if f.get("word")],
        })
    return kept


def ipa_of(entry):
    for sound in entry.get("sounds") or []:
        if sound.get("ipa"):
            return sound["ipa"]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="data/raw/wiktionary-raw.jsonl",
                        help="local file, or `url` to stream from kaikki.org")
    parser.add_argument("--out", default="data/raw/wiktionary.jsonl.gz")
    parser.add_argument("--limit", type=int, default=0, help="stop early, for testing")
    args = parser.parse_args()

    read = written = 0
    source = (urllib.request.urlopen(URL) if args.source == "url"
              else open(args.source, "rb"))
    with source, gzip.open(args.out, "wt", encoding="utf-8") as out:
        for raw in source:
            read += 1
            try:
                entry = json.loads(raw)
            except ValueError:
                continue
            senses = senses_of(entry)
            if not senses or not entry.get("word") or not entry.get("pos"):
                continue
            out.write(json.dumps({
                "word": entry["word"],
                "pos": entry["pos"],
                "senses": senses,
                "forms": [f["form"] for f in (entry.get("forms") or [])
                          if f.get("form") and "form" in f],
                "ipa": ipa_of(entry),
            }) + "\n")
            written += 1
            if args.limit and written >= args.limit:
                break
            if written % 100_000 == 0:
                print(f"  {written:,} entries kept", flush=True)

    print(f"read     {read:,} lines")
    print(f"kept     {written:,} entries -> {args.out}")


if __name__ == "__main__":
    main()
