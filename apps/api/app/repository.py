from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional
from .config import DB_PATH, BOOKS_DIR, INDEX_DIR
from .arabic import fts_query, normalize_arabic, highlight_arabic_text


@dataclass(frozen=True)
class SearchResult:
    id: int
    book_id: int
    book_title: str
    authors: list[str]
    categories: list[str]
    publisher: Optional[str]
    year: Optional[str]
    part_name: Optional[str]
    page_number: Optional[int]
    page_id: Optional[int]
    breadcrumb: list[str]
    text: str
    score: float
    text_highlighted: Optional[str] = None

    @property
    def citation(self) -> str:
        author = "، ".join(self.authors) if self.authors else "مؤلف غير محدد"
        parts = [self.book_title, author]
        if self.part_name:
            parts.append(f"ج {self.part_name}")
        if self.page_number is not None:
            parts.append(f"ص {self.page_number}")
        return "، ".join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book_title,
            "authors": self.authors,
            "categories": self.categories,
            "publisher": self.publisher,
            "year": self.year,
            "part_name": self.part_name,
            "page_number": self.page_number,
            "page_id": self.page_id,
            "breadcrumb": self.breadcrumb,
            "text": self.text,
            "score": self.score,
            "citation": self.citation,
            "text_highlighted": self.text_highlighted or self.text,
        }


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def reset_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS chunks_fts;
        DROP TABLE IF EXISTS chunks;
        DROP TABLE IF EXISTS books;

        CREATE TABLE books (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            authors_json TEXT NOT NULL,
            categories_json TEXT NOT NULL,
            publisher TEXT,
            year TEXT,
            source_file TEXT NOT NULL,
            source_format TEXT NOT NULL
        );

        CREATE TABLE chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL REFERENCES books(id),
            book_title TEXT NOT NULL,
            authors_json TEXT NOT NULL,
            categories_json TEXT NOT NULL,
            publisher TEXT,
            year TEXT,
            part_name TEXT,
            page_number INTEGER,
            page_id INTEGER,
            breadcrumb_json TEXT NOT NULL,
            breadcrumb_text TEXT NOT NULL,
            text_raw TEXT NOT NULL,
            text_normalized TEXT NOT NULL,
            source_file TEXT NOT NULL,
            source_line INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE chunks_fts USING fts5(
            text_normalized,
            breadcrumb_text,
            book_title,
            authors,
            content='chunks',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );
        """
    )


def discover_jsonl_books(books_dir: Path = BOOKS_DIR) -> list[Path]:
    return sorted(
        path
        for path in books_dir.glob("**/*.jsonl")
        if path.is_file() and not path.name.startswith(".")
    )


def _coerce_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def _insert_book(conn: sqlite3.Connection, metadata: dict[str, Any], source_file: Path) -> None:
    book_id = int(metadata["book_id"])
    conn.execute(
        """
        INSERT OR REPLACE INTO books (
            id, title, authors_json, categories_json, publisher, year, source_file, source_format
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            book_id,
            str(metadata.get("book_title") or f"Book {book_id}"),
            json.dumps(_coerce_list(metadata.get("authors")), ensure_ascii=False),
            json.dumps(_coerce_list(metadata.get("categories")), ensure_ascii=False),
            metadata.get("publisher"),
            metadata.get("year"),
            str(source_file),
            "jsonl",
        ),
    )


def ingest_book(conn: sqlite3.Connection, source_file: Path) -> int:
    inserted = 0
    seen_book_ids: set[int] = set()

    with source_file.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue

            record = json.loads(line)
            text = str(record.get("text") or "").strip()
            metadata = record.get("metadata") or {}
            if not text or "book_id" not in metadata:
                continue

            book_id = int(metadata["book_id"])
            if book_id not in seen_book_ids:
                _insert_book(conn, metadata, source_file)
                seen_book_ids.add(book_id)

            authors = _coerce_list(metadata.get("authors"))
            categories = _coerce_list(metadata.get("categories"))
            breadcrumb = _coerce_list(metadata.get("breadcrumb"))
            breadcrumb_text = " / ".join(breadcrumb)
            normalized_text = normalize_arabic(" ".join([breadcrumb_text, text]))

            cursor = conn.execute(
                """
                INSERT INTO chunks (
                    book_id, book_title, authors_json, categories_json, publisher, year,
                    part_name, page_number, page_id, breadcrumb_json, breadcrumb_text,
                    text_raw, text_normalized, source_file, source_line
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    book_id,
                    str(metadata.get("book_title") or f"Book {book_id}"),
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(categories, ensure_ascii=False),
                    metadata.get("publisher"),
                    metadata.get("year"),
                    metadata.get("part_name"),
                    metadata.get("page_number"),
                    metadata.get("page_id"),
                    json.dumps(breadcrumb, ensure_ascii=False),
                    breadcrumb_text,
                    text,
                    normalized_text,
                    str(source_file),
                    line_number,
                ),
            )
            chunk_id = int(cursor.lastrowid)
            conn.execute(
                """
                INSERT INTO chunks_fts (
                    rowid, text_normalized, breadcrumb_text, book_title, authors
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    normalized_text,
                    normalize_arabic(breadcrumb_text),
                    normalize_arabic(str(metadata.get("book_title") or "")),
                    normalize_arabic(" ".join(authors)),
                ),
            )
            inserted += 1

    return inserted


def rebuild_index(source_files: Iterable[Path] | None = None, db_path: Path = DB_PATH) -> dict[str, Any]:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    files = list(source_files or discover_jsonl_books())

    with connect(db_path) as conn:
        reset_schema(conn)
        chunk_count = 0
        for source_file in files:
            chunk_count += ingest_book(conn, source_file)
        conn.commit()

        book_count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]

    return {
        "db_path": str(db_path),
        "books": book_count,
        "chunks": chunk_count,
        "source_files": [str(path) for path in files],
    }


def list_books(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT b.id, b.title, b.authors_json, b.categories_json, b.publisher, b.year,
               COUNT(c.id) AS chunk_count
        FROM books b
        LEFT JOIN chunks c ON c.book_id = b.id
        GROUP BY b.id
        ORDER BY b.title
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "authors": json.loads(row["authors_json"]),
            "categories": json.loads(row["categories_json"]),
            "publisher": row["publisher"],
            "year": row["year"],
            "chunk_count": row["chunk_count"],
        }
        for row in rows
    ]


def _row_to_result(row: sqlite3.Row, query: str | None = None) -> SearchResult:
    text_raw = row["text_raw"]
    text_highlighted = highlight_arabic_text(text_raw, query) if query else text_raw
    return SearchResult(
        id=row["id"],
        book_id=row["book_id"],
        book_title=row["book_title"],
        authors=json.loads(row["authors_json"]),
        categories=json.loads(row["categories_json"]),
        publisher=row["publisher"],
        year=row["year"],
        part_name=row["part_name"],
        page_number=row["page_number"],
        page_id=row["page_id"],
        breadcrumb=json.loads(row["breadcrumb_json"]),
        text=text_raw,
        score=float(row["score"]),
        text_highlighted=text_highlighted,
    )


def search(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 10,
    book_ids: list[int] | None = None,
    mode: str = "all",
) -> list[SearchResult]:
    match_query = fts_query(query, mode)
    if not match_query:
        return []

    sql = """
        SELECT c.*, bm25(chunks_fts, 1.4, 0.7, 0.3, 0.3) AS score
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
    """
    params: list[Any] = [match_query]

    if book_ids:
        placeholders = ", ".join("?" for _ in book_ids)
        sql += f" AND c.book_id IN ({placeholders})"
        params.extend(book_ids)

    sql += " ORDER BY score LIMIT ?"
    params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    return [_row_to_result(row, query) for row in rows]


def get_chunk(
    conn: sqlite3.Connection,
    chunk_id: int,
    query: str | None = None,
) -> SearchResult | None:
    row = conn.execute(
        """
        SELECT c.*, 0.0 AS score
        FROM chunks c
        WHERE c.id = ?
        """,
        (chunk_id,),
    ).fetchone()
    return _row_to_result(row, query) if row else None


def get_chunk_context(
    conn: sqlite3.Connection,
    chunk_id: int,
    window: int = 2,
    query: str | None = None,
) -> list[SearchResult]:
    """Retrieve the target chunk along with surrounding chunks for context."""
    # Find book_id for this chunk
    row = conn.execute(
        "SELECT book_id FROM chunks WHERE id = ?",
        (chunk_id,),
    ).fetchone()
    if not row:
        return []
    book_id = row["book_id"]

    # Query chunks around chunk_id belonging to the same book
    rows = conn.execute(
        """
        SELECT c.*, 0.0 AS score
        FROM chunks c
        WHERE c.book_id = ? AND c.id >= ? AND c.id <= ?
        ORDER BY c.id
        """,
        (book_id, chunk_id - window, chunk_id + window),
    ).fetchall()
    return [_row_to_result(r, query) for r in rows]


