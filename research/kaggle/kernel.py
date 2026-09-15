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

# Four runs. The first is the control: SemCor alone, trained again rather than compared
# against the 64.4% already on file, because that number came from a session with one T4
# and Kaggle sometimes gives two, which doubles the effective batch.
#
# The rest ask whether the subtitle labels buy anything, two ways. Mixed in, they are 2%
# of the data and one pass will not weight them. Trained second, on top of the control,
# they are the whole of the second pass — which is what domain adaptation means. The
# mixed run is kept because it is the obvious thing to try, and the contrast is the
# point. `model-semcor` has to finish first: the tuned runs start from it.
CONTROL = "model-semcor"
JOBS = [
    (CONTROL, ["semcor.jsonl"], []),
    ("model-mixed", ["semcor.jsonl", "teacher-labels.jsonl"], ["--agreed", "5"]),
    # Three epochs, not one: 3,708 examples is 58 steps at batch 64, and a single pass
    # over that is barely training. `run.py` scores after each one, so the epoch the
    # model starts overfitting shows up in the log rather than having to be guessed.
    ("model-tuned", ["teacher-labels.jsonl"],
     ["--agreed", "5", "--from", CONTROL, "--epochs", "3"]),
    ("model-tuned-4of5", ["teacher-labels.jsonl"],
     ["--agreed", "4", "--from", CONTROL, "--epochs", "3"]),
]

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

    for name in sorted(built):
        shutil.make_archive(str(OUT / name), "zip", OUT / name)
        shutil.rmtree(OUT / name)


if __name__ == "__main__":
    main()
