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

# Lines the test set never saw, with phrases resolved and single-sense lines dropped.
teacher:
	$(PY) scripts/pick_candidates.py --count 10000 --per-word 10 \
	  --exclude data/candidates.jsonl --out $(TEACHER) --seed 41
	$(PY) scripts/apply_phrases.py --file $(TEACHER) --write --min-senses 2

panel:
	$(PY) scripts/panel.py --file $(TEACHER) --out $(PANEL) --workers 12

# Needs data/panel.jsonl: the panel's answers on the hand-labelled lines.
panel-check:
	$(PY) scripts/panel_check.py

labels:
	$(PY) scripts/take_labels.py

check-teacher:
	$(PY) scripts/check_teacher.py

label-split:
	$(PY) scripts/split_labels.py

# --- training ----------------------------------------------------------------

# Uploads the data as a new Kaggle dataset version, then pushes the training script.
# OMSTI and MASC are left out unless added: `make kaggle CORPORA="... data/omsti.jsonl"`.
CORPORA ?= data/semcor.jsonl data/teacher-labels.jsonl

# The uv-installed CLI; an older pip install on PATH fails on the current token format.
KAGGLE ?= $(HOME)/.local/bin/kaggle
DATASET ?= ofarukkavlak/vocabboost-wsd

kaggle:
	rm -rf data/kaggle && mkdir -p data/kaggle
	cp $(CORPORA) data/working.jsonl data/label-split.json \
	  kaggle/run.py kaggle/dataset-metadata.json data/kaggle/
	$(KAGGLE) datasets version -p data/kaggle -t -m "$(M)"
	$(MAKE) wait-dataset
	$(KAGGLE) kernels push -p kaggle

# A kernel pushed before the new dataset version is ready silently mounts the old one.
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

failures:
	$(PY) scripts/failures.py

sense-split:
	$(PY) scripts/sense_split.py

confidence:
	$(PY) scripts/confidence.py

calibrate:
	$(PY) scripts/calibrate.py

pos-effect:
	$(PY) scripts/pos_effect.py

# --- Jev ----------------------------------------------------------------------

SET ?= working

jev-probe:
	$(PY) scripts/jev.py probe

jev:
	$(PY) scripts/jev.py run --set $(SET)

jev-report:
	$(PY) scripts/jev.py report --set $(SET)

# --- files the extension ships -------------------------------------------------

extension: onnx tagger vocab-json

onnx:
	$(PY) scripts/export_onnx.py

check-onnx:
	$(PY) scripts/check_onnx.py

tagger:
	$(PY) scripts/export_tagger.py

vocab-json:
	$(PY) scripts/export_vocab.py

lookup:
	$(PY) scripts/lookup.py

# --- the final comparison (phase 17) -----------------------------------------

SET ?= working

comparison-lines:
	$(PY) scripts/comparison.py lines --set $(SET)

comparison:
	$(PY) scripts/comparison.py report --set $(SET)

# --- one-off measurements, kept so their numbers can be reproduced ------------

lexicons:
	$(PY) scripts/compare_lexicons.py

phrase-split:
	$(PY) scripts/phrase_split.py

phrase-impact:
	$(PY) scripts/phrase_impact.py

sense-distance:
	$(PY) scripts/sense_distance.py

# --- housekeeping ------------------------------------------------------------

lint:
	$(PY) -m ruff check scripts kaggle

clean:
	rm -rf .venv __pycache__ scripts/__pycache__
	rm -rf data/raw data/vocab.db data/semcor.jsonl data/omsti.jsonl \
	  data/masc.jsonl data/model data/kaggle data/onnx
	rm -f data/working.jsonl data/sealed.jsonl data/teacher.jsonl

.PHONY: setup pool wiktionary vocab semcor ufsac \
	candidates phrases label split recheck \
	teacher panel panel-check labels check-teacher label-split \
	kaggle wait-dataset \
	baseline evaluate compare failures sense-split confidence calibrate pos-effect \
	jev-probe jev jev-report \
	extension onnx check-onnx tagger vocab-json lookup \
	comparison-lines comparison \
	lexicons phrase-split phrase-impact sense-distance \
	lint clean
