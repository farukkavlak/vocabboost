"""The script Kaggle runs: every training job, one after another, in one session.

Kaggle takes a single code file; `run.py` and the data arrive as a dataset, which
`make kaggle` uploads before pushing this file. Only the trained models are written to
`/kaggle/working`, since everything there becomes the run's output.
"""

import pathlib
import shutil
import subprocess
import sys

INPUT = pathlib.Path("/kaggle/input")
OUT = pathlib.Path("/kaggle/working")

# Each setting runs at three seeds. A control and its tuned model share a seed, so they
# are compared pair by pair.
SEEDS = [17, 23, 41]
JOBS = []
for seed in SEEDS:
    control = f"model-semcor-{seed}"
    JOBS.append((control, ["semcor.jsonl"], ["--seed", str(seed)]))
    JOBS.append((f"model-tuned-{seed}", ["teacher-labels.jsonl"],
                 ["--from", control, "--seed", str(seed),
                  "--epochs", "3", "--split", "label-split.json"]))

NEEDED = ["run.py", "working.jsonl", "semcor.jsonl", "teacher-labels.jsonl",
          "label-split.json"]


def find_data():
    """The folder the dataset mounted in, which is not always `/kaggle/input/<slug>`.

    Fails early with a listing, since a dataset version still processing mounts nowhere.
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
        raise SystemExit("no GPU: check the accelerator and that the account is verified")

    built = set()
    data = find_data()
    print(f"data   {data}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                    "sentence-transformers"], check=True)

    for name, corpora, options in JOBS:
        print(f"\n{'=' * 70}\n{name}\n{'=' * 70}", flush=True)
        # `--from <name>` refers to a model an earlier job wrote.
        options = [str(OUT / o) if o in built else o for o in options]
        options = [str(data / o) if o == "label-split.json" else o for o in options]
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
