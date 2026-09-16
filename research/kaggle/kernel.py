"""What Kaggle runs. Every job in one session, so one push answers every question.

Kaggle takes a single code file; everything else arrives as a dataset — the prepared
`.jsonl` files, the hand-labelled lines, and `run.py` itself. `make kaggle` uploads the
dataset and pushes this script.

Sessions last twelve hours and run detached. Colab's free session ends around fifty
minutes and took a training run with it, which is why this is here.

The short job runs first, so a session that dies halfway still leaves the cheap answer
in the log.

Nothing is copied into `/kaggle/working`: everything there is kept as the run's output,
and copying the corpora in once made it 680 MB. The dataset is read where it is mounted
and only the trained models are written out.
"""

import pathlib
import shutil
import subprocess
import sys

INPUT = pathlib.Path("/kaggle/input")
OUT = pathlib.Path("/kaggle/working")

# Three seeds of each, because one score is not a result. The same control job scored
# 64.4% and 68.5% on two runs of identical code — torch was never seeded, so batch order
# and dropout moved freely. That is fixed, but a fixed seed only makes one run
# repeatable; it says nothing about how much the setting matters. Running both settings
# at three seeds gives a spread to read the difference against.
#
# The seed moves the held-out word split as well as the batch order, so a seed is a
# whole different draw of the experiment. Control and tuned share the seed within each
# pair, which is the point: the difference is read pair by pair, not across pairs.
#
# Six jobs, about ninety minutes. Two questions the last session settled — mixing the
# corpora and the 4-of-5 labels — are not repeated.
SEEDS = [17, 23, 41]
JOBS = []
for seed in SEEDS:
    control = f"model-semcor-{seed}"
    JOBS.append((control, ["semcor.jsonl"], ["--seed", str(seed)]))
    # Three epochs: 3,708 examples is 58 steps at batch 64, and `run.py` keeps whichever
    # epoch scored best rather than the last one.
    JOBS.append((f"model-tuned-{seed}", ["teacher-labels.jsonl"],
                 ["--agreed", "5", "--from", control, "--seed", str(seed),
                  "--epochs", "3"]))

NEEDED = ["run.py", "working.jsonl", "semcor.jsonl", "teacher-labels.jsonl"]


def find_data():
    """Where the dataset actually mounted.

    Not `/kaggle/input/<slug>` — it lands under `datasets/<owner>/<slug>`, and a
    version still processing at launch lands nowhere. Search for the files and say
    what is there on failure, because the whole session is spent before anyone looks.
    """
    for folder in sorted({p.parent for p in INPUT.rglob("run.py")}):
        if all((folder / name).exists() for name in NEEDED):
            return folder
    listing = "\n".join(f"  {p}" for p in sorted(INPUT.rglob("*"))[:40])
    raise SystemExit(f"the dataset is not mounted with {NEEDED}\n{listing or '  nothing'}")


def main():
    import torch
    print(f"torch {torch.__version__}, gpu {torch.cuda.is_available()}", flush=True)
    if not torch.cuda.is_available():
        # On CPU the long job takes days and the session is cut at twelve hours.
        raise SystemExit("no GPU: check the accelerator and that the account is verified")

    built = set()
    data = find_data()
    print(f"data   {data}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                    "sentence-transformers"], check=True)

    for name, corpora, options in JOBS:
        print(f"\n{'=' * 70}\n{name}\n{'=' * 70}", flush=True)
        # `--from model-semcor` means the directory an earlier job wrote, so the
        # archiving waits until every job has run.
        options = [str(OUT / o) if o in built else o for o in options]
        subprocess.run([sys.executable, str(data / "run.py"),
                        "--data", *[str(data / c) for c in corpora],
                        "--test", str(data / "working.jsonl"),
                        "--out", str(OUT / name), *options], check=True)
        built.add(name)

    # Six models is half a gigabyte of output to download for numbers that are already
    # in the log. Only the tuned ones are kept; the controls exist to be trained on top
    # of, and one is already on the laptop.
    for name in sorted(built):
        if name.startswith("model-tuned"):
            shutil.make_archive(str(OUT / name), "zip", OUT / name)
        shutil.rmtree(OUT / name)


if __name__ == "__main__":
    main()
