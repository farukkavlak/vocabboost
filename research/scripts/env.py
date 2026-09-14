"""Read the repository's .env so scripts can find the API key.

The key lives outside this folder and outside git. Nothing here writes it anywhere,
and no key is ever needed to run the extension — only to label training data.
"""

import os
import pathlib

ENV = pathlib.Path(__file__).resolve().parents[2] / ".env"


def load():
    """Put anything in .env into the environment, without overwriting what is set."""
    if not ENV.exists():
        return
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ").strip()
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip("'\""))


def require(name):
    load()
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is not set. Put it in {ENV}")
    return value
