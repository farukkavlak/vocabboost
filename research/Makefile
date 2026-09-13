MODEL ?= data/model
PY := .venv/bin/python

# --- setup -------------------------------------------------------------------

setup:
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements.txt
	$(PY) scripts/setup_nltk.py

# --- data --------------------------------------------------------------------

pool:
	$(PY) scripts/fetch_corpus.py
	$(PY) scripts/word_frequency.py

wiktionary:
	curl -C - --retry 5 -o data/raw/wiktionary-raw.jsonl \
	  https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
	$(PY) scripts/fetch_wiktionary.py

vocab:
	$(PY) scripts/build_vocab.py

semcor:
	$(PY) scripts/build_semcor.py

# --- the test set ------------------------------------------------------------

candidates:
	$(PY) scripts/pick_candidates.py

phrases:
	$(PY) scripts/apply_phrases.py

label:
	$(PY) scripts/label.py $(if $(REDO),--redo $(REDO))

split:
	$(PY) scripts/split.py

recheck:
	$(PY) scripts/recheck.py

# --- measuring ---------------------------------------------------------------

baseline:
	$(PY) scripts/baseline.py

evaluate:
	$(PY) scripts/zero_shot.py --model $(MODEL) --style all --focus prefixed

compare:
	$(PY) scripts/compare.py

lookup:
	$(PY) scripts/lookup.py

failures:
	$(PY) scripts/failures.py

# --- one-off measurements, kept so their numbers can be reproduced ------------

lexicons:
	$(PY) scripts/compare_lexicons.py

phrase-split:
	$(PY) scripts/phrase_split.py

sense-distance:
	$(PY) scripts/sense_distance.py

phrase-impact:
	$(PY) scripts/phrase_impact.py

# --- housekeeping ------------------------------------------------------------

clean:
	rm -rf .venv __pycache__ scripts/__pycache__
	rm -rf data/raw data/vocab.db data/semcor.jsonl data/model
	rm -f data/working.jsonl data/sealed.jsonl

.PHONY: setup pool wiktionary vocab semcor candidates phrases label split recheck \
        baseline evaluate compare lookup failures lexicons phrase-split sense-distance \
        phrase-impact clean
