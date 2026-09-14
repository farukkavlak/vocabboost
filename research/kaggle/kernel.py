"""What Kaggle runs. Every job in one session, so one push answers every question.

Kaggle takes a single code file; everything else arrives as a dataset — the prepared
`.jsonl` files, the hand-labelled lines, and `run.py` itself. `make kaggle` uploads the
dataset and pushes this script.

Sessions last twelve hours and run detached. Colab's free session ends around fifty
minutes and took a training run with it, which is why this is here.

The short job runs first, so a session that dies halfway still leaves the cheap answer
in the log.
"""

import pathlib
import shutil
import subprocess
import sys

INPUT = pathlib.Path("/kaggle/input")

# SemCor is 177,665 examples. The slice matches it so the only difference between the
# first job and the run we already have is which corpus the examples came from.
JOBS = [
    ("model-omsti", ["--data", "omsti.jsonl", "--examples", "177665"]),
    ("model-both", ["--data", "semcor.jsonl", "omsti.jsonl"]),
]

NEEDED = ["run.py", "working.jsonl", "semcor.jsonl", "omsti.jsonl"]


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

    data = find_data()
    print(f"data   {data}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                    "sentence-transformers"], check=True)
    for name in NEEDED:
        shutil.copy(data / name, name)

    for name, options in JOBS:
        print(f"\n{'=' * 70}\n{name}\n{'=' * 70}", flush=True)
        subprocess.run([sys.executable, "run.py", "--out", name, *options], check=True)
        shutil.make_archive(f"/kaggle/working/{name}", "zip", name)
        shutil.rmtree(name)


if __name__ == "__main__":
    main()
