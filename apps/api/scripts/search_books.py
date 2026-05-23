#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

CURRENT_FILE = Path(__file__).resolve()
API_DIR = CURRENT_FILE.parents[1]
sys.path.insert(0, str(API_DIR))

from app.repository import connect, search  # noqa: E402


def main() -> None:
    query = " ".join(sys.argv[1:]).strip()
    if not query:
        raise SystemExit('Usage: python3 apps/api/scripts/search_books.py "سؤر الهرة"')

    with connect() as conn:
        results = search(conn, query, limit=10)

    if not results:
        print("No indexed references found.")
        return

    for index, result in enumerate(results, start=1):
        breadcrumb = " / ".join(result.breadcrumb)
        print(f"{index}. {result.citation}")
        if breadcrumb:
            print(f"   {breadcrumb}")
        print(f"   chunk_id={result.id} score={result.score:.4f}")
        print("   " + result.text.replace("\n", "\n   "))
        print()


if __name__ == "__main__":
    main()

