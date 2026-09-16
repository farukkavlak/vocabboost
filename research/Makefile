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

ufsac:
	$(PY) -m gdown 1kwBMIDBTf6heRno9bdLvF-DahSLHIZyV -O data/raw/ufsac.tar.xz
	tar -xJf data/raw/ufsac.tar.xz -C data/raw \
	  ufsac-public-2.1/omsti.xml ufsac-public-2.1/masc.xml
	$(PY) scripts/build_ufsac.py --corpus data/raw/ufsac-public-2.1/omsti.xml \
	  --out data/omsti.jsonl
	$(PY) scripts/build_ufsac.py --corpus data/raw/ufsac-public-2.1/masc.xml \
	  --out data/masc.jsonl

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

# --- labelling with a panel of models -----------------------------------------

# TEACHER is the pool of lines to label; PANEL is what each model answered on them.
TEACHER ?= data/teacher.jsonl
PANEL   ?= data/teacher-panel.jsonl

# Draws lines the test set never saw, points the phrases at their phrase, and drops
# the single-sense rows — one option is not a question.
teacher:
	$(PY) scripts/pick_candidates.py --count 10000 --per-word 10 \
	  --exclude data/candidates.jsonl --out $(TEACHER) --seed 41
	$(PY) scripts/apply_phrases.py --file $(TEACHER) --write --min-senses 2

panel:
	$(PY) scripts/panel.py --file $(TEACHER) --out $(PANEL) --workers 12

# Scores the panel against the 200 lines marked by hand. Needs data/panel.jsonl.
panel-check:
	$(PY) scripts/panel_check.py

# Joins the lines and the answers into one file training can read.
labels:
	$(PY) scripts/take_labels.py

# Hand-labels a sample of the panel's own lines, blind, to measure its error rate.
check-teacher:
	$(PY) scripts/check_teacher.py

# Decides once which words train, which choose the epoch, and which report.
label-split:
	$(PY) scripts/split_labels.py

# --- training ----------------------------------------------------------------

# Stages the prepared data as a Kaggle dataset and pushes the script that trains on it.
# `kaggle datasets create` the first time; after that every push is a new version.
#
# CORPORA is what gets uploaded. OMSTI and MASC are left out by default — half a
# gigabyte for corpora no current job reads, and `make ufsac` rebuilds them in ten
# minutes. Add them back with `make kaggle CORPORA="... data/omsti.jsonl"`.
CORPORA ?= data/semcor.jsonl data/teacher-labels.jsonl

# `uv tool install kaggle` puts 2.x in ~/.local/bin. An older pip-installed 1.6 may sit
# earlier on PATH and fail on the new token format, so the path is spelled out.
KAGGLE ?= $(HOME)/.local/bin/kaggle
DATASET ?= ofarukkavlak/vocabboost-wsd

kaggle:
	rm -rf data/kaggle && mkdir -p data/kaggle
	cp $(CORPORA) data/working.jsonl data/label-split.json \
	  kaggle/run.py kaggle/dataset-metadata.json data/kaggle/
	$(KAGGLE) datasets version -p data/kaggle -t -m "$(M)"
	$(MAKE) wait-dataset
	$(KAGGLE) kernels push -p kaggle

# A new dataset version takes a minute or two to process, and a kernel pushed before it
# is ready mounts the *previous* version instead — silently, with the old files. One run
# died two minutes in for a file that was uploaded and not yet visible.
wait-dataset:
	@for i in $$(seq 60); do \
	  $(KAGGLE) datasets status $(DATASET) | grep -q ready && \
	  $(KAGGLE) datasets files $(DATASET) | grep -q label-split.json && exit 0; \
	  sleep 10; \
	done; echo "the dataset version is still not ready"; exit 1

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

sense-split:
	$(PY) scripts/sense_split.py

confidence:
	$(PY) scripts/confidence.py

sense-distance:
	$(PY) scripts/sense_distance.py

phrase-impact:
	$(PY) scripts/phrase_impact.py

# --- housekeeping ------------------------------------------------------------

lint:
	$(PY) -m ruff check scripts kaggle

clean:
	rm -rf .venv __pycache__ scripts/__pycache__
	rm -rf data/raw data/vocab.db data/semcor.jsonl data/omsti.jsonl \
	  data/masc.jsonl data/model data/kaggle
	rm -f data/working.jsonl data/sealed.jsonl data/model-full.zip
	rm -f data/teacher.jsonl

.PHONY: setup pool wiktionary vocab semcor ufsac candidates phrases label split \
        recheck teacher panel panel-check labels check-teacher kaggle baseline evaluate compare lookup failures lexicons \
        phrase-split sense-split confidence sense-distance phrase-impact lint clean
