"""Turn a click on a word into the entry to show. The reference for phase 16.

Two things stand between a click and an answer.

**Phrases.** In "instead of club soda, make it champagne" the word `club` carries none
of its own meanings, and seven senses about golf and nightclubs are worse than no
answer. So the words around the click are read first and the longest entry covering it
wins.

**Inflections.** `ran` is not in the dictionary, `run` is. WordNet lists the irregular
forms; the regular ones fall to a handful of suffix rules.

Phrases also move: "check it out" is `check out` with a pronoun inside, "I ran into
him" is `run into` inflected. So each position is tried in its dictionary form, and one
pronoun is allowed inside a two-word phrase.
"""

import re
import sqlite3

WORD = re.compile(r"[A-Za-z']+")

# The regular endings, longest first so `-ies` is tried before `-s`.
RULES = {
    "n": [("ies", "y"), ("ses", "s"), ("xes", "x"), ("zes", "z"), ("ches", "ch"),
          ("shes", "sh"), ("men", "man"), ("s", "")],
    "v": [("ies", "y"), ("ying", "ie"), ("ing", ""), ("ing", "e"), ("ied", "y"),
          ("ed", ""), ("ed", "e"), ("es", ""), ("s", "")],
    "a": [("iest", "y"), ("est", ""), ("est", "e"), ("ier", "y"), ("er", ""),
          ("er", "e")],
    "r": [],
}

LONGEST_PHRASE = 4

# Words that sit inside a separable phrasal verb: "check IT out", "pull YOURSELF
# together". Only object pronouns. `that` and `this` point at something in the world,
# so "keep that pace" is not the idiom `keep pace`.
INFIX = {"it", "them", "him", "her", "me", "us", "you", "myself", "yourself",
         "himself", "herself", "ourselves", "themselves", "itself"}

# WordNet files a few slang idioms under `the something` — `the boot` for dismissal,
# `the street` for the financial district. They collide with the plain noun on almost
# every line that contains it, so they are not matched as phrases. `a lot`, `in front`
# and `at a loss` carry no such clash and stay.
NOT_A_PHRASE_START = {"the"}


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

    def candidate_phrases(self, words, index):
        """Every phrase the click could belong to, longest first."""
        found = []
        for start in range(max(0, index - LONGEST_PHRASE + 1), index + 1):
            for end in range(index + 1, min(len(words), start + LONGEST_PHRASE) + 1):
                span = words[start:end]
                if len(span) < 2:
                    continue
                if span[0] not in NOT_A_PHRASE_START:
                    found.append(span)
                # "check it out" is the entry `check out`.
                if len(span) == 3 and span[1] in INFIX:
                    found.append([span[0], span[2]])
        return sorted(found, key=len, reverse=True)

    def phrase_at(self, words, index):
        """The longest phrase entry covering the clicked word, if there is one."""
        for span in self.candidate_phrases(words, index):
            # The first word carries the inflection: "ran into" is `run into`.
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
