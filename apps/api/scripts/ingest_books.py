#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

CURRENT_FILE = Path(__file__).resolve()
API_DIR = CURRENT_FILE.parents[1]
sys.path.insert(0, str(API_DIR))

from app.repository import rebuild_index  # noqa: E402


def main() -> None:
    summary = rebuild_index()
    print(f"Indexed {summary['books']} book(s), {summary['chunks']} chunk(s).")
    print(f"Database: {summary['db_path']}")
    for source_file in summary["source_files"]:
        print(f"- {source_file}")


if __name__ == "__main__":
    main()

