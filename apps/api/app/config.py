from __future__ import annotations

from pathlib import Path


# Dynamically resolve root directory to work seamlessly in both nested monorepo and flat HF space structures
_curr = Path(__file__).resolve()
ROOT_DIR = _curr.parents[3]
if not (ROOT_DIR / "data" / "index").exists():
    if (_curr.parents[1] / "data" / "index").exists():
        ROOT_DIR = _curr.parents[1]
    elif (_curr.parents[2] / "data" / "index").exists():
        ROOT_DIR = _curr.parents[2]

BOOKS_DIR = ROOT_DIR / "data" / "books"
INDEX_DIR = ROOT_DIR / "data" / "index"
DB_PATH = INDEX_DIR / "fiqh.db"

