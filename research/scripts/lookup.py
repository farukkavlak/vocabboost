"""Turn a clicked word into WordNet entries from `vocab.db`; the reference for the extension.

`phrase_at` finds the longest phrase around the word; `senses_of` resolves a single word
the way NLTK's lemmatizer and `wn.synsets` do, so the extension offers the senses the
labels were chosen from.
"""

import re
import sqlite3

WORD = re.compile(r"[A-Za-z']+")

# Suffix rules for phrase heads, longest first so `-ies` is tried before `-s`.
RULES = {
    "n": [("ies", "y"), ("ses", "s"), ("xes", "x"), ("zes", "z"), ("ches", "ch"),
          ("shes", "sh"), ("men", "man"), ("s", "")],
    "v": [("ies", "y"), ("ying", "ie"), ("ing", ""), ("ing", "e"), ("ied", "y"),
          ("ed", ""), ("ed", "e"), ("es", ""), ("s", "")],
    "a": [("iest", "y"), ("est", ""), ("est", "e"), ("ier", "y"), ("er", ""),
          ("er", "e")],
    "r": [],
}

# NLTK's `morphy` rules, used for single words.
MORPHY = {
    "n": [("s", ""), ("ses", "s"), ("ves", "f"), ("xes", "x"), ("zes", "z"), ("ches", "ch"),
          ("shes", "sh"), ("men", "man"), ("ies", "y")],
    "v": [("s", ""), ("ies", "y"), ("es", "e"), ("es", ""), ("ed", "e"), ("ed", ""),
          ("ing", "e"), ("ing", "")],
    "a": [("er", ""), ("est", ""), ("er", "e"), ("est", "e")],
    "r": [],
}

LONGEST_PHRASE = 4

# Object pronouns allowed inside a phrasal verb: "check it out" is `check out`.
INFIX = {"it", "them", "him", "her", "me", "us", "you", "myself", "yourself",
         "himself", "herself", "ourselves", "themselves", "itself"}

# `the boot`, `the street`: WordNet idioms that clash with the plain noun.
NOT_A_PHRASE_START = {"the"}


def index_of(words, target):
    """The first position of `target` in `words`, ignoring case, or None."""
    target = target.lower()
    return next((i for i, word in enumerate(words) if word == target), None)


class Vocab:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row

    def entry(self, lemma, pos=None):
        if pos:
            row = self.db.execute(
                "SELECT * FROM entry WHERE lemma = ? AND pos = ?", (lemma, pos)
            ).fetchone()
            return row
        return self.db.execute(
            "SELECT * FROM entry WHERE lemma = ? ORDER BY id", (lemma,)).fetchone()

    def senses(self, entry_id):
        return self.db.execute(
            "SELECT s.* FROM sense s JOIN entry_sense es ON es.sense_id = s.id"
            " WHERE es.entry_id = ? ORDER BY es.rank", (entry_id,)).fetchall()

    def lemmas_of(self, surface, pos):
        """Every lemma this surface form could be, irregular list before suffix rules."""
        found = [r["lemma"] for r in self.db.execute(
            "SELECT lemma FROM form WHERE surface = ? AND pos = ?", (surface, pos))]
        for ending, replacement in RULES.get(pos, []):
            if surface.endswith(ending):
                found.append(surface[: len(surface) - len(ending)] + replacement)
        return [surface, *found]

    def exists(self, lemma, pos):
        # WordNet files some adjectives as satellites (`s`); NLTK counts them as `a`.
        return self.db.execute(
            "SELECT 1 FROM entry WHERE lemma = ? AND pos IN (?, ?)",
            (lemma, pos, "s" if pos == "a" else pos)).fetchone() is not None

    def morphy(self, form, pos):
        """NLTK's `morphy`: the word and its base forms that WordNet has."""
        forms = [r["lemma"] for r in self.db.execute(
            "SELECT lemma FROM form WHERE surface = ? AND pos = ?", (form, pos))]
        if not forms:
            forms = [form[: len(form) - len(old)] + new
                     for old, new in MORPHY[pos] if form.endswith(old)]
        found = []
        for candidate in [form, *forms]:
            if candidate not in found and self.exists(candidate, pos):
                found.append(candidate)
        return found

    def senses_of(self, word, pos):
        """The lemma and sense keys NLTK gives a word of this part of speech."""
        forms = self.morphy(word.lower(), pos)
        lemma = min(forms, key=len) if forms else word.lower()
        keys = []
        for form in self.morphy(lemma, pos):
            for part in (pos, "s") if pos == "a" else (pos,):
                row = self.entry(form, part)
                for sense in self.senses(row["id"]) if row else []:
                    if sense["key"] not in keys:
                        keys.append(sense["key"])
        return lemma, keys

    def candidate_phrases(self, words, index):
        """Every span of up to four words around `index`, longest first."""
        found = []
        for start in range(max(0, index - LONGEST_PHRASE + 1), index + 1):
            for end in range(index + 1, min(len(words), start + LONGEST_PHRASE) + 1):
                span = words[start:end]
                if len(span) < 2:
                    continue
                if span[0] not in NOT_A_PHRASE_START:
                    found.append(span)
                if len(span) == 3 and span[1] in INFIX:
                    found.append([span[0], span[2]])
        return sorted(found, key=len, reverse=True)

    def phrase_at(self, words, index):
        """The longest phrase entry covering the word at `index`, if there is one."""
        for span in self.candidate_phrases(words, index):
            # Only the first word is inflected: "ran into" is `run into`.
            for head in [*self.lemmas_of(span[0], "v"), span[0]]:
                row = self.entry(" ".join([head, *span[1:]]))
                if row:
                    return row
        return None

    def look_up(self, line, index, pos=None):
        """What to show for the word at `index` in `line`."""
        words = [w.lower() for w in WORD.findall(line)]
        phrase = self.phrase_at(words, index)
        if phrase:
            return phrase, self.senses(phrase["id"])

        for lemma in self.lemmas_of(words[index], pos or "n"):
            row = self.entry(lemma, pos) if pos else self.entry(lemma)
            if row:
                return row, self.senses(row["id"])
        return None, []


def main():
    vocab = Vocab("data/vocab.db")
    cases = [("And instead of club soda, make it champagne.", 3, None),
             ("Come on, you gotta pull yourself together.", 4, None),
             ("Thought I'd check it out for myself.", 2, "v"),
             ("I ran into him at the store.", 1, "v"),
             ("Wall safes went out with vaudeville.", 1, "n")]
    for line, index, pos in cases:
        row, senses = vocab.look_up(line, index, pos)
        words = WORD.findall(line)
        name = row["lemma"] if row else "nothing"
        print(f"{words[index]:<8} in {line}")
        print(f"  -> {name} ({len(senses)} senses)"
              + (f": {senses[0]['gloss'][:52]}" if senses else ""))


if __name__ == "__main__":
    main()
