# Architecture Notes

## Goal

Build a study/reference assistant for Hanafi fiqh. It should find relevant passages in indexed books and show exact citations. It is not a fatwa system.

## Phase 1

Phase 1 focuses on reliable retrieval without an LLM:

1. Load JSONL books from `data/books`.
2. Preserve exact source text and metadata.
3. Normalize Arabic only for search.
4. Search with SQLite FTS5.
5. Return exact citations and snippets.

SQLite is intentional for the first test book. Once the larger corpus is added, this layer can be swapped or complemented with Postgres/Qdrant while keeping the same API contract.

## Phase 2

Add hybrid retrieval:

- Dense embeddings for semantic retrieval.
- Sparse/BM25 retrieval for exact fiqh terminology.
- Reranking before answer generation.

## Phase 3

Add answer generation with strict citation validation:

- The model receives only retrieved passages.
- The model must cite retrieved chunk IDs.
- The backend verifies every citation before returning the answer.
- If citations cannot be verified, return search results instead of a generated answer.

