# fiqh.ai

A reference-search assistant for Hanafi fiqh texts. The first milestone is a citation-safe retrieval system: it indexes the JSONL books in `data/books`, searches the source text, and returns exact passages with book/page metadata. Generation can be added after retrieval quality is measurable.

## Current MVP

- Ingests Shamela-style JSONL book exports from `data/books/**/book_*.jsonl`
- Stores books and page/chunk metadata in SQLite
- Builds an Arabic-aware FTS5 search index
- Exposes search through a FastAPI backend
- Provides a minimal Next.js research UI

## Quick Start

```bash
python3 apps/api/scripts/ingest_books.py
python3 apps/api/scripts/search_books.py "سؤر الهرة"
```

API dependencies:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
python apps/api/scripts/ingest_books.py
uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

Web UI:

```bash
npm install
npm run dev:web
```

Then open `http://localhost:3000`.

Full usage instructions are in [docs/usage.md](docs/usage.md).

## Project Layout

```text
apps/api        Python retrieval API and ingestion scripts
apps/web        Next.js UI
data/books      Source JSONL/Markdown books
data/index      Generated local SQLite index
docs            Architecture notes
```

## Retrieval Policy

The system should never fabricate references. Citations must come from stored chunk metadata, not model-generated text. If no strong result is found, the assistant should say that no reliable indexed reference was found.
